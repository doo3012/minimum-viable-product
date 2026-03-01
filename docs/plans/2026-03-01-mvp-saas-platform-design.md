# MVP B2B Multi-Tenant SaaS Platform — System Design

**Date:** 2026-03-01
**Status:** Approved

---

## 1. Overview

A full-stack B2B multi-tenant SaaS platform for company onboarding across multiple Business Units (BUs), with a cross-service chat integration. Three services:

| Service | Tech | Pattern |
|---|---|---|
| Web frontend | Next.js 16+ (Bun), React 19, TypeScript | App Router |
| Main API | .NET 10 | Vertical Slice Architecture + CQRS (MediatR) |
| Chat service | Go 1.25.3 | Clean Architecture (Echo) |

**Infrastructure:** PostgreSQL (single shared instance, two schemas), NATS JetStream (event bus), Docker Compose.

---

## 2. Repository Structure

```
minimum-viable-product/
├── docker-compose.yml
├── README.md
├── .gitignore
├── docs/
│   └── plans/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── api/                    # .NET 10 backend
│   └── chat/                   # Go chat service
└── infra/
    ├── postgres/
    │   └── init.sql            # schema bootstrap
    └── nats/
        └── nats-server.conf
```

---

## 3. Multi-Tenancy Strategy

**Pattern:** Row-level isolation using a `company_id` discriminator column on all tenant-scoped tables.

**Enforcement in .NET:**
- JWT claims contain `company_id`
- A MediatR pipeline behavior (`TenantBehavior`) extracts `company_id` from `IHttpContextAccessor` and injects it into every `IRequest` implementing `ITenantScoped`
- No handler ever manually passes `company_id` — it is injected automatically
- All EF Core queries append `WHERE company_id = @tenantId` via a global query filter

---

## 4. Database Schema

### Schema: `main` (owned by .NET API)

```sql
-- Multi-tenancy anchor
companies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  address        TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

business_units (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  name       TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Auth
users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  username            TEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('Owner','Admin','Staff')),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Staff global profile (shared across all BUs in the company)
staff_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  user_id    UUID REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Staff BU-scoped data (email is unique per BU)
staff_bu (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES staff_profiles(id),
  bu_id      UUID NOT NULL REFERENCES business_units(id),
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, bu_id)
);

-- Chat access control (explicit grant required)
chat_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES staff_profiles(id),
  bu_id      UUID NOT NULL REFERENCES business_units(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (staff_id, bu_id)
);
```

### Schema: `chat` (owned by Go chat service)

```sql
workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bu_id      UUID NOT NULL UNIQUE,   -- references main.business_units conceptually
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES chat.workspaces(id),
  user_id      UUID NOT NULL,        -- references main.users conceptually
  role         TEXT NOT NULL CHECK (role IN ('admin','member')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
```

> **Note:** No foreign keys cross schemas. Integrity is enforced at the application layer via NATS events.

---

## 5. Authentication & JWT Flow

1. User POSTs `{ username, password }` to `POST /api/auth/login`
2. .NET verifies credentials and issues a JWT with:
   ```json
   {
     "sub": "user-uuid",
     "company_id": "company-uuid",
     "role": "Owner | Admin | Staff",
     "exp": "<24h>"
   }
   ```
3. JWT is set as an **httpOnly cookie** (`Set-Cookie` response header)
4. Next.js BFF route handler (`app/api/[...path]/route.ts`) reads the cookie and forwards requests to .NET with `Authorization: Bearer <token>`
5. On first login, `must_change_password = true` forces redirect to `/change-password`

**Default password format:** `Welcome@<CompanyName>1`

---

## 6. Inter-Service Communication (NATS JetStream)

### Event: `bu.created`

Published by .NET after a Business Unit is successfully created. Consumed by Go chat service to provision a workspace.

**Payload:**
```json
{
  "bu_id": "uuid",
  "bu_name": "string",
  "owner_user_id": "uuid",
  "company_id": "uuid"
}
```

**JetStream configuration:**
- Stream: `PLATFORM_EVENTS`, subjects: `bu.*`
- Retention: `WorkQueuePolicy` (message deleted after ack)
- Consumer: durable, `AckExplicit`
- At-least-once delivery: message persists if Go is temporarily down

**Go handler on `bu.created`:**
1. Insert row into `chat.workspaces` (`bu_id`, `name`)
2. Insert owner into `chat.workspace_members` with `role = 'admin'`
3. Ack message

---

## 7. API Surface

### .NET API

| Method | Path | Description | Auth |
|---|---|---|---|
| POST | /api/auth/login | Login, returns JWT cookie | Public |
| POST | /api/auth/change-password | Change password | Authenticated |
| POST | /api/companies/onboard | Onboard new company | Public |
| GET | /api/business-units | List BUs | Authenticated |
| POST | /api/business-units | Create BU | Owner/Admin |
| GET | /api/staff | List staff | Authenticated |
| POST | /api/staff | Create staff + assign role | Owner |
| GET | /api/staff/:id | Get global staff profile | Authenticated |
| PUT | /api/staff/:id | Update global profile | Owner/Admin |
| GET | /api/staff/:id/bu/:buId | Get BU-scoped data | Authenticated |
| PUT | /api/staff/:id/bu/:buId | Update BU-scoped data | Owner/Admin |
| GET | /api/chat-permissions/bu/:buId | List chat access for BU | Owner |
| POST | /api/chat-permissions | Grant chat access | Owner |
| DELETE | /api/chat-permissions/:id | Revoke chat access | Owner |

### Go Chat Service

| Method | Path | Description |
|---|---|---|
| POST | /api/workspaces | Provision workspace (internal) |
| GET | /api/workspaces/:id | Get workspace info |
| GET | /api/workspaces/:id/members | List members |
| POST | /api/workspaces/:id/members | Add member |
| DELETE | /api/workspaces/:id/members/:uid | Remove member |

---

## 8. Frontend Structure (Next.js App Router)

```
app/
├── (public)/
│   ├── onboard/page.tsx          # Company onboarding form
│   └── login/page.tsx            # Login form
│
├── (auth)/                       # Protected — requires valid JWT cookie
│   ├── layout.tsx                # Auth guard + sidebar
│   ├── dashboard/page.tsx
│   ├── staff/
│   │   ├── page.tsx              # Staff list (TanStack Table)
│   │   ├── new/page.tsx          # Create staff (Owner only)
│   │   └── [id]/page.tsx         # Staff detail with BU-scoped data tabs
│   ├── business-units/
│   │   ├── page.tsx              # BU list
│   │   └── new/page.tsx          # Create BU
│   └── chat-permissions/
│       └── [buId]/page.tsx       # Manage chat access per BU (Owner only)
│
└── api/
    └── [...path]/route.ts        # BFF proxy — cookie → Bearer token
```

**State management:**
- **Zustand**: auth state (user info, role, company_id), UI state
- **TanStack Query**: all server data fetching and mutations
- **React Hook Form + Zod**: all forms with client-side validation
- **SweetAlert2**: confirmation dialogs

---

## 9. Company Onboarding Flow

1. User submits onboarding form (company name, address, contact number)
2. .NET creates `companies` row
3. .NET creates default `business_units` row (`is_default = true`, name = `"Default"`)
4. .NET creates `users` row (role = `Owner`, `must_change_password = true`)
5. .NET publishes `bu.created` event to NATS
6. Go chat service provisions workspace for the default BU and assigns owner as admin
7. .NET returns `{ username, defaultPassword }` to frontend
8. Frontend redirects to login

---

## 10. .NET Project Structure (Vertical Slice)

```
api/
├── Api.csproj
├── Program.cs
├── Features/
│   ├── Auth/
│   │   ├── Login/
│   │   │   ├── LoginCommand.cs
│   │   │   ├── LoginHandler.cs
│   │   │   └── LoginEndpoint.cs
│   │   └── ChangePassword/
│   ├── Companies/
│   │   └── Onboard/
│   ├── BusinessUnits/
│   │   ├── Create/
│   │   └── List/
│   ├── Staff/
│   │   ├── Create/
│   │   ├── List/
│   │   ├── GetById/
│   │   └── UpdateBuScoped/
│   └── ChatPermissions/
│       ├── Grant/
│       ├── Revoke/
│       └── ListByBu/
├── Common/
│   ├── Behaviors/
│   │   ├── TenantBehavior.cs
│   │   └── ValidationBehavior.cs
│   ├── Interfaces/
│   │   └── ITenantScoped.cs
│   └── Models/
└── Infrastructure/
    ├── Persistence/
    │   └── AppDbContext.cs
    └── Messaging/
        └── NatsPublisher.cs
```

---

## 11. Go Chat Service Structure (Clean Architecture)

```
chat/
├── cmd/
│   └── server/main.go
├── internal/
│   ├── domain/
│   │   ├── workspace.go
│   │   └── member.go
│   ├── usecase/
│   │   ├── workspace_usecase.go
│   │   └── member_usecase.go
│   ├── repository/
│   │   ├── workspace_repo.go
│   │   └── member_repo.go
│   ├── delivery/
│   │   └── http/
│   │       ├── router.go
│   │       └── workspace_handler.go
│   └── infrastructure/
│       ├── postgres/
│       │   └── db.go
│       └── nats/
│           └── consumer.go
└── go.mod
```

---

## 12. Docker Compose Services

| Service | Image | Port |
|---|---|---|
| web | node (Bun) | 3000 |
| api | .NET 10 | 5000 |
| chat | Go | 8080 |
| postgres | postgres:16 | 5432 |
| nats | nats:latest | 4222 / 8222 |

---

## 13. Assumptions

1. No email service in scope — default password is returned directly in the onboarding API response
2. Chat service is internal-only — it does not need to be directly accessible from the frontend (permissions managed via .NET)
3. A staff member can belong to multiple BUs within the same company
4. The Company Owner role cannot be changed or reassigned
5. No pagination required for MVP list endpoints (can add later)
6. JWT expiry: 24 hours, no refresh token in scope for MVP
