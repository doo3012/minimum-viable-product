# Platform Updates Design: RabbitMQ Outbox, Real-Time Chat, Role-Binding, UI Shell

**Date:** 2026-03-03
**Status:** Approved

---

## Overview

Four interconnected features to upgrade the B2B Multi-Tenant SaaS MVP:

1. **RabbitMQ + Outbox Pattern** — Reliable event delivery via MassTransit
2. **Real-Time Chat** — WebSocket-based BU-scoped group chat
3. **Role-Binding Authorization** — Global vs. localized role enforcement
4. **UI Shell** — Dynamic layout with BU switcher and role-based rendering

Execution order: 1 → 3 → 2 → 4 (each feature depends on the previous).

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Broker strategy | Go consumes from RabbitMQ; NATS code stays dormant | Single active event path, simpler ops |
| WebSocket auth | BFF-issued token in query param | Keeps Go unexposed; httpOnly cookie handled by BFF |
| Role storage | `role` column on `staff_bu` table | Minimal schema change; `users.role` stays for Owner check |
| UI approach | Rebuild shell layout from scratch | Clean break matching the new spec exactly |
| BU context | BU ID in URL path (`/bu/[buId]/...`) | Enables deep-linking, bookmarking, browser navigation |

---

## Feature 1: RabbitMQ + Outbox Pattern

### Schema Change

EF Core MassTransit Outbox adds its own tables automatically (`OutboxMessage`, `OutboxState`, `InboxState`).

### Docker

- Add `rabbitmq:3-management` service
  - Ports: `5672` (AMQP), `15672` (management UI)
  - Env: `RABBITMQ_DEFAULT_USER=guest`, `RABBITMQ_DEFAULT_PASS=guest`
- NATS service remains in docker-compose (untouched)

### .NET Changes

- Add NuGet packages: `MassTransit`, `MassTransit.RabbitMQ`, `MassTransit.EntityFrameworkCore`
- Configure MassTransit with RabbitMQ transport + EF Core Outbox in `Program.cs`
- Replace direct NATS publish calls with `IPublishEndpoint.Publish<BusinessUnitCreated>()`
- Outbox writes events to DB in the same transaction as BU creation
- Background delivery service relays outbox messages to RabbitMQ
- Existing NATS code remains in codebase but is no longer called

### Go Changes

- Add `amqp091-go` package for RabbitMQ consumption
- New RabbitMQ consumer subscribing to `business-unit-created` queue
- Existing NATS subscriber code remains but is not started
- Consumer triggers the same workspace creation logic

---

## Feature 3: Role-Binding Authorization Strategy

### Schema Change

```sql
ALTER TABLE main.staff_bu
  ADD COLUMN role TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin','Staff'));
```

- `users.role`: keeps `Owner` as the global role marker
- `staff_bu.role`: localized role per BU assignment (`Admin` or `Staff`)
- `chat_permissions`: stays as-is (explicit Owner toggle for chat access)

### JWT Claims Update

- Current: `{ sub, company_id, role, exp }`
- New: `{ sub, company_id, global_role, exp }`
- `global_role` is `Owner` or `User`
- BU-specific role resolved per-request from `staff_bu.role` based on active BU

### MediatR Behavior Changes

`AuthorizeBehavior` updated logic:
- If `global_role == Owner` → allow everything
- Otherwise: extract `bu_id` from request, look up `staff_bu.role`, check permission

New attributes: `[RequireRole("Admin")]`, `[RequireBuAccess]`

### Permission Matrix

| Action | Owner | Admin | Staff |
|--------|-------|-------|-------|
| Edit company info | Yes | No | No |
| Create/delete BUs | Yes | No | No |
| Invite staff (global) | Yes | No | No |
| Assign BU roles | Yes | No | No |
| Toggle chat access | Yes | No | No |
| BU staff list | Yes | Yes | No |
| Edit localized profile | Yes | Yes | No |
| Read BU data | Yes | Yes | Yes |
| Own profile | Yes | Yes | Yes |
| Chat (if granted) | Auto | If granted | If granted |

---

## Feature 2: Real-Time Chat System

### Schema Addition (chat schema)

```sql
CREATE TABLE chat.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES chat.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  display_name TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_workspace_created ON chat.messages(workspace_id, created_at DESC);
```

### WebSocket Hub (Go)

- Hub-per-workspace pattern: one hub per active workspace manages connected clients
- On WS upgrade: validate token (query param), check `workspace_members` for user+workspace, reject 403 if not found
- On message received: insert into `chat.messages`, broadcast JSON to all clients in workspace
- Message format: `{ id, userId, displayName, content, createdAt }`

### REST History Endpoint (Go)

- `GET /api/workspaces/:buId/messages?limit=50`
- Returns latest 50 messages ordered by `created_at DESC`, reversed for display
- Same token auth as WebSocket

### Token Exchange Flow

1. React calls BFF: `POST /api/chat/token` (BFF reads httpOnly JWT cookie)
2. BFF calls .NET: `POST /api/chat-tokens` — validates JWT, checks `chat_permissions`, returns short-lived token (5 min, signed with shared secret)
3. React fetches history via BFF: `GET /api/chat/messages?buId=xxx`
4. React opens WebSocket: `ws://localhost:8080/ws?token=xxx&buId=xxx`
5. Go validates token on upgrade, checks workspace_members, upgrades connection

### Go Package Structure

- `internal/delivery/ws/` — Hub + Client types
- `internal/usecase/message.go` — message CRUD
- `internal/repository/message.go` — Postgres queries
- `internal/delivery/http/message_handler.go` — REST history endpoint
- Token validation middleware (shared JWT secret with .NET)

---

## Feature 4: UI Shell & Role-Based Workflows

### Routing Structure (Next.js App Router)

```
app/
  (auth)/
    login/page.tsx
    change-password/page.tsx
  (app)/
    layout.tsx                    ← AppShell (top nav + sidebar + main)
    company/
      settings/page.tsx           ← Owner only
      staff/page.tsx              ← Owner: global staff directory
      access-control/page.tsx     ← Owner: BU assignment + chat toggle
    bu/
      management/page.tsx         ← Owner: create/delete BUs
      [buId]/
        layout.tsx                ← BU context provider
        dashboard/page.tsx
        staff/page.tsx            ← Admin+: BU staff list
        chat/page.tsx             ← Conditional on chat_permissions
    profile/page.tsx              ← All roles: edit own profile
```

### Key Components

- **AppShell**: Top nav (company name | BU switcher | user menu) + sidebar + main content
- **BuSwitcher**: Dropdown of accessible BUs; navigates to `/bu/[buId]/dashboard` on change; plain text if only 1 BU
- **DynamicSidebar**: Menu items based on `global_role` + current BU role
- **ChatBox**: WebSocket chat with history loading, message input, message list

### State Management (Zustand)

- `useAuthStore`: user info, global_role, accessible BUs with their roles (fetched on login)
- Active BU derived from URL param `[buId]`, not stored in Zustand

### Login Redirect Logic

- Owner → `/bu/[firstBuId]/dashboard`
- Admin/Staff → `/bu/[firstAccessibleBuId]/dashboard`

### Sidebar Visibility

| Menu Item | Owner | Admin | Staff |
|-----------|-------|-------|-------|
| Company Settings | Yes | No | No |
| BU Management | Yes | No | No |
| Global Staff Directory | Yes | No | No |
| BU Access Control | Yes | No | No |
| BU Dashboard | Yes | Yes | Yes |
| BU Staff List | Yes | Yes | No |
| Chat Workspace | Yes | If granted | If granted |
| My Profile | Yes | Yes | Yes |

### Chat Conditional Rendering

- `chat_permissions` exists for user+BU → render `ChatBox` component
- No permission → render "Access Restricted" with lock icon, no input
