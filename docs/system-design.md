# System Design Document — MVP SaaS Platform

## 1. ภาพรวมสถาปัตยกรรม (Architecture Overview)

### 1.1 Service Topology

```mermaid
graph TB
    Browser[Browser / Frontend Client]

    subgraph Docker Compose
        Web[Next.js Web App<br/>Port 3000]
        API[.NET API<br/>Port 5000]
        Chat[Go Chat Service<br/>Port 8080]
        PG[(PostgreSQL 16<br/>Port 5432)]
        NATS[NATS JetStream<br/>Port 4222]
    end

    Browser -->|HTTP| Web
    Web -->|HTTP Proxy /api/*| API
    API -->|EF Core| PG
    API -->|Publish bu.created| NATS
    API -->|HTTP Sync| Chat
    Chat -->|pgx| PG
    NATS -->|Subscribe bu.*| Chat
```

### 1.2 Technology Stack

| Layer | Technology | หน้าที่ |
|-------|-----------|--------|
| Frontend | Next.js 16, React 19, TanStack Query, Zustand | UI, State Management, BFF Proxy |
| API | .NET 10 Minimal APIs, MediatR, EF Core | Business Logic, CQRS, Multi-Tenancy |
| Chat Service | Go 1.25, Echo v4, pgx/v5 | Chat Workspace Management |
| Database | PostgreSQL 16 | Data Persistence (2 schemas) |
| Messaging | NATS JetStream | Async Event-Driven Communication |
| Container | Docker Compose | Local Development & Deployment |

### 1.3 Architectural Patterns

- **.NET API:** Vertical Slice Architecture (VSA) + CQRS ผ่าน MediatR — แต่ละ Feature มีโฟลเดอร์ของตัวเอง (Command, Handler, Endpoint)
- **Go Chat Service:** Clean Architecture — แบ่งเป็น Domain, Use Case, Repository, Delivery layers
- **Frontend:** Next.js App Router + BFF Proxy Pattern — ทุก API request ผ่าน `/api/[...path]` route handler ก่อนถึง backend

---

## 2. Database Schema (ER Diagram)

### 2.1 Schema `main` (เป็นของ .NET API)

```mermaid
erDiagram
    companies {
        uuid id PK
        varchar name UK
        varchar address
        varchar contact_number
        timestamp created_at
    }

    business_units {
        uuid id PK
        uuid company_id FK
        varchar name
        boolean is_default
        timestamp created_at
    }

    users {
        uuid id PK
        uuid company_id FK
        varchar username UK
        varchar password_hash
        varchar role "CHECK: Owner, Admin, Staff"
        boolean must_change_password
        timestamp created_at
    }

    staff_profiles {
        uuid id PK
        uuid company_id FK
        uuid user_id FK "nullable"
        varchar first_name
        varchar last_name
        timestamp created_at
    }

    staff_bu {
        uuid id PK
        uuid staff_id FK
        uuid bu_id FK
        varchar email
        timestamp created_at
    }

    chat_permissions {
        uuid id PK
        uuid staff_id FK
        uuid bu_id FK
        timestamp granted_at
    }

    companies ||--o{ business_units : "has"
    companies ||--o{ users : "has"
    companies ||--o{ staff_profiles : "has"
    users ||--o| staff_profiles : "linked to"
    staff_profiles ||--o{ staff_bu : "assigned to"
    business_units ||--o{ staff_bu : "scoped in"
    staff_profiles ||--o{ chat_permissions : "granted"
    business_units ||--o{ chat_permissions : "for BU"
```

### 2.2 Schema `chat` (เป็นของ Go Chat Service)

```mermaid
erDiagram
    workspaces {
        uuid id PK
        uuid bu_id UK
        varchar name
        timestamp created_at
    }

    workspace_members {
        uuid id PK
        uuid workspace_id FK
        uuid user_id "conceptual FK to main.users"
        varchar role "CHECK: admin, member"
        timestamp created_at
    }

    workspaces ||--o{ workspace_members : "has"
```

**หมายเหตุ:** ไม่มี Foreign Key ข้าม schema — `workspace_members.user_id` เชื่อมกับ `main.users.id` ผ่าน NATS events และ HTTP sync เท่านั้น

---

## 3. Multi-Tenancy Strategy

### 3.1 Row-Level Isolation

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant TenantBehavior
    participant EFCore as EF Core
    participant PostgreSQL

    Client->>API: Request + JWT (company_id claim)
    API->>TenantBehavior: MediatR Pipeline
    TenantBehavior->>EFCore: SetTenant(companyId)
    EFCore->>EFCore: Apply Global Query Filter<br/>(WHERE company_id = @tenantId)
    EFCore->>PostgreSQL: SELECT ... WHERE company_id = '...'
    PostgreSQL-->>Client: Tenant-scoped data only
```

### 3.2 รายละเอียด

- **กลยุทธ์:** Row-Level Isolation ด้วยคอลัมน์ `company_id` ในทุกตารางหลัก
- **การทำงาน:** `TenantBehavior` (MediatR Pipeline Behavior) อ่าน `company_id` จาก JWT claim แล้วเรียก `AppDbContext.SetTenant()` ซึ่งจะ activate EF Core Global Query Filters
- **ตารางที่มี filter:** `business_units`, `users`, `staff_profiles`
- **ตารางที่ไม่มี filter:** `companies` (เจตนา — ใช้ตอน onboard), `staff_bu` (filter ผ่าน join กับ `staff_profiles`), `chat_permissions` (filter ผ่าน join กับ `business_units`)

### 3.3 JWT Claims

```json
{
  "sub": "<user_id>",
  "company_id": "<company_id>",
  "role": "Owner | Admin | Staff",
  "iss": "mvp-api",
  "aud": "mvp-web",
  "exp": "<24 hours>"
}
```

---

## 4. Inter-Service Communication

### 4.1 Async: NATS JetStream (BU Provisioning)

```mermaid
sequenceDiagram
    participant API as .NET API
    participant NATS as NATS JetStream
    participant Chat as Go Chat Service
    participant DB as PostgreSQL

    API->>NATS: Publish "bu.created"<br/>{bu_id, bu_name, owner_user_id, company_id}
    NATS->>Chat: Deliver (durable consumer: "chat-service")
    Chat->>DB: INSERT INTO chat.workspaces
    Chat->>DB: INSERT INTO chat.workspace_members<br/>(owner as admin)
    Chat->>NATS: ACK
```

**Stream Configuration:**
- Stream: `PLATFORM_EVENTS`
- Subjects: `bu.*`
- Retention: `WorkQueue` (ลบหลัง ACK)
- Consumer: `chat-service` (durable, explicit ack)

**Event Payload (`bu.created`):**
```json
{
  "bu_id": "uuid",
  "bu_name": "string",
  "owner_user_id": "uuid",
  "company_id": "uuid"
}
```

### 4.2 Sync: HTTP (Chat Permission Sync)

```mermaid
sequenceDiagram
    participant Admin as Owner
    participant API as .NET API
    participant DB as PostgreSQL (main)
    participant Chat as Go Chat Service
    participant ChatDB as PostgreSQL (chat)

    Admin->>API: POST /api/chat-permissions<br/>{staffId, buId}
    API->>DB: INSERT INTO chat_permissions
    API->>Chat: GET /api/workspaces/by-bu/{buId}
    Chat->>ChatDB: SELECT FROM chat.workspaces
    Chat-->>API: {id: workspace_id}
    API->>Chat: POST /api/workspaces/{wsId}/members<br/>{user_id: staff.userId}
    Chat->>ChatDB: INSERT INTO chat.workspace_members
    Chat-->>API: 201 Created
    API-->>Admin: 201 Created
```

**เมื่อ Revoke Permission:**
```mermaid
sequenceDiagram
    participant Admin as Owner
    participant API as .NET API
    participant DB as PostgreSQL (main)
    participant Chat as Go Chat Service
    participant ChatDB as PostgreSQL (chat)

    Admin->>API: DELETE /api/chat-permissions/{id}
    API->>DB: SELECT permission (get staffId, buId)
    API->>Chat: GET /api/workspaces/by-bu/{buId}
    Chat-->>API: {id: workspace_id}
    API->>Chat: DELETE /api/workspaces/{wsId}/members/{userId}
    Chat->>ChatDB: DELETE FROM chat.workspace_members
    Chat-->>API: 204 No Content
    API->>DB: DELETE FROM chat_permissions
    API-->>Admin: 200 OK
```

---

## 5. Role-Based Access Control (RBAC)

### 5.1 Role Hierarchy

```mermaid
graph TD
    Owner["Owner<br/>สิทธิ์ทั้งหมด"]
    Admin["Admin<br/>จัดการ Staff + BU"]
    Staff["Staff<br/>ดูข้อมูล + แก้ไขตัวเอง"]

    Owner --> Admin
    Admin --> Staff
```

### 5.2 Permission Matrix

| Action | Owner | Admin | Staff |
|--------|:-----:|:-----:|:-----:|
| สร้าง Business Unit | ✅ | ✅ | ❌ |
| สร้าง Staff | ✅ | ✅ | ❌ |
| แก้ไข Staff Profile | ✅ | ✅ | เฉพาะตัวเอง |
| Reset Password ให้ Staff | ✅ | ✅ | ❌ |
| Set Password ให้ Staff | ✅ | ✅ | ❌ |
| เปลี่ยน Password ตัวเอง | ✅ | ✅ | ✅ |
| Grant/Revoke Chat Perms | ✅ | ❌ | ❌ |
| ดู Staff List | ✅ | ✅ | ✅ |
| ดู BU List | ✅ | ✅ | ✅ |

### 5.3 Implementation (MediatR Pipeline)

```mermaid
sequenceDiagram
    participant Endpoint
    participant AuthorizeBehavior
    participant TenantBehavior
    participant ValidationBehavior
    participant Handler

    Endpoint->>AuthorizeBehavior: Send(command)
    AuthorizeBehavior->>AuthorizeBehavior: Check JWT role claim<br/>against command.AllowedRoles
    alt Role not allowed
        AuthorizeBehavior-->>Endpoint: 403 Forbidden
    else Role allowed
        AuthorizeBehavior->>TenantBehavior: next()
        TenantBehavior->>TenantBehavior: SetTenant(companyId)
        TenantBehavior->>ValidationBehavior: next()
        ValidationBehavior->>ValidationBehavior: Validate request
        ValidationBehavior->>Handler: next()
        Handler-->>Endpoint: Result
    end
```

**MediatR Pipeline Order:**
1. `AuthorizeBehavior` — ตรวจ role (เฉพาะ commands ที่ implement `IAuthorizeRole`)
2. `TenantBehavior` — ตั้ง tenant filter (เฉพาะ commands ที่ implement `ITenantScoped`)
3. `ValidationBehavior` — validate ด้วย FluentValidation

---

## 6. Authentication Flow

### 6.1 Login + JWT Flow

```mermaid
sequenceDiagram
    participant Browser
    participant NextJS as Next.js BFF
    participant API as .NET API
    participant DB as PostgreSQL

    Browser->>NextJS: POST /api/auth/login<br/>{username, password}
    NextJS->>API: Forward request (proxy)
    API->>DB: SELECT user WHERE username = ?
    API->>API: BCrypt.Verify(password, hash)
    API->>API: JwtService.Generate(userId, companyId, role)
    API-->>NextJS: 200 + Set-Cookie: auth_token=JWT<br/>{userId, role, mustChangePassword}
    NextJS-->>Browser: Forward response + cookie
    Browser->>Browser: Store role in Zustand (localStorage)
```

### 6.2 Cookie Configuration

| Property | Value | หมายเหตุ |
|----------|-------|----------|
| Name | `auth_token` | |
| HttpOnly | `true` | ป้องกัน XSS |
| SameSite | `Strict` | ป้องกัน CSRF |
| Secure | `false` | สำหรับ local dev (ควรเป็น `true` ใน production) |
| MaxAge | 24 hours | |

### 6.3 Password Management Flow

```mermaid
flowchart TD
    A[Company Onboard] -->|auto-generate password| B[Owner Login]
    B -->|mustChangePassword = true| C[Force Change Password]
    C -->|New password set| D[Dashboard]

    E[Owner/Admin creates Staff] -->|auto-generate password| F[Staff Login]
    F -->|mustChangePassword = true| G[Force Change Password]
    G -->|New password set| H[Dashboard]

    I[Owner/Admin] -->|Reset Password| J[New random password generated]
    J -->|mustChangePassword = true| K[Staff must change on next login]

    L[Owner/Admin] -->|Set Password| M[Specific password set]
    M -->|mustChangePassword = true| N[Staff must change on next login]
```

---

## 7. API Endpoints

### 7.1 Public Endpoints (ไม่ต้อง Authentication)

| Method | Route | หน้าที่ |
|--------|-------|--------|
| POST | `/api/companies/onboard` | สร้างบริษัท + Owner account |
| POST | `/api/auth/login` | เข้าสู่ระบบ |
| POST | `/api/auth/logout` | ออกจากระบบ |

### 7.2 Authenticated Endpoints (ต้อง Login)

| Method | Route | Role ที่อนุญาต | หน้าที่ |
|--------|-------|---------------|--------|
| POST | `/api/auth/change-password` | ทุก role | เปลี่ยน password ตัวเอง |
| POST | `/api/business-units` | Owner, Admin | สร้าง Business Unit |
| GET | `/api/business-units` | ทุก role | ดูรายการ BU |
| POST | `/api/staff` | Owner, Admin | สร้าง Staff |
| GET | `/api/staff` | ทุก role | ดูรายการ Staff |
| GET | `/api/staff/me` | ทุก role | ดู Staff Profile ตัวเอง |
| GET | `/api/staff/{id}` | ทุก role | ดูรายละเอียด Staff |
| PUT | `/api/staff/{id}/bu/{buId}` | ทุก role | แก้ไข BU-scoped data |
| POST | `/api/staff/{id}/reset-password` | Owner, Admin | Reset password ให้ staff |
| PUT | `/api/staff/{id}/password` | Owner, Admin | Set password ให้ staff |
| POST | `/api/chat-permissions` | Owner | Grant chat permission |
| DELETE | `/api/chat-permissions/{id}` | Owner | Revoke chat permission |
| GET | `/api/business-units/{buId}/chat-permissions` | ทุก role | ดู permissions ของ BU |

### 7.3 Go Chat Service Internal Endpoints

| Method | Route | หน้าที่ |
|--------|-------|--------|
| GET | `/api/workspaces/by-bu/:buId` | Lookup workspace จาก BU ID |
| GET | `/api/workspaces/:id` | ดูรายละเอียด workspace |
| GET | `/api/workspaces/:id/members` | ดูสมาชิก workspace |
| POST | `/api/workspaces/:id/members` | เพิ่มสมาชิก |
| DELETE | `/api/workspaces/:id/members/:uid` | ลบสมาชิก |

**หมายเหตุ:** Chat Service endpoints ไม่มี authentication — อาศัย network isolation (ไม่เปิดให้ frontend เข้าถึงตรง)

---

## 8. Company Onboarding Flow

```mermaid
sequenceDiagram
    participant User as ผู้ใช้ใหม่
    participant Web as Next.js
    participant API as .NET API
    participant DB as PostgreSQL
    participant NATS as NATS JetStream
    participant Chat as Go Chat Service

    User->>Web: กรอก Company Name, Address, Contact
    Web->>API: POST /api/companies/onboard
    API->>DB: ตรวจชื่อซ้ำ
    API->>DB: INSERT company
    API->>DB: INSERT business_unit (Default, is_default=true)
    API->>DB: INSERT user (Owner, auto-generated password)
    API->>NATS: Publish bu.created (with owner_user_id)
    NATS->>Chat: Deliver event
    Chat->>DB: INSERT chat.workspaces
    Chat->>DB: INSERT chat.workspace_members (Owner as admin)
    API-->>Web: {username, defaultPassword}
    Web-->>User: แสดง username + password
    User->>Web: Login → Force Change Password → Dashboard
```
