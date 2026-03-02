# การปรับปรุงระบบ MVP SaaS Platform — Design Document

## เป้าหมาย

ปรับปรุงระบบที่มีอยู่ให้ครบถ้วนตาม Business Requirements โดยแก้ไข 6 ส่วนหลัก:
1. เพิ่ม Role-Based Access Control (RBAC) ทั้ง API และ Frontend
2. แก้ไข Staff DTO ให้ส่งข้อมูล Role และ BU Count
3. Sync Chat Permission กับ Go Chat Service
4. เพิ่มระบบจัดการ Profile และ Password
5. แก้ไข Bug ที่พบจาก Audit (tenant filter, docker port, validation)
6. เขียน System Design Document ภาษาไทย

---

## A. Role-Based Authorization

### สถานะปัจจุบัน
- ทุก endpoint ใช้แค่ `.RequireAuthorization()` (ตรวจแค่ว่า login แล้ว)
- ไม่มี role check เลย — Staff ธรรมดาสามารถสร้าง BU, สร้าง Staff, Grant/Revoke chat permissions

### แนวทางแก้ไข

#### API: MediatR Authorization Behavior
- สร้าง `AuthorizeBehavior<TRequest, TResponse>` เป็น MediatR pipeline behavior
- สร้าง `[AuthorizeRole("Owner", "Admin")]` attribute สำหรับติดบน Command/Query
- Pipeline อ่าน `role` claim จาก JWT → ตรวจสอบกับ attribute → reject ด้วย 403 ถ้าไม่มีสิทธิ์

#### Permission Matrix

| Action | Owner | Admin | Staff |
|--------|-------|-------|-------|
| สร้าง Business Unit | ✅ | ✅ | ❌ |
| สร้าง Staff | ✅ | ✅ | ❌ |
| แก้ไข Staff Profile | ✅ | ✅ | เฉพาะตัวเอง |
| Reset Password ให้ Staff | ✅ | ✅ | ❌ |
| Set Password ให้ Staff | ✅ | ✅ | ❌ |
| เปลี่ยน Password ตัวเอง | ✅ | ✅ | ✅ |
| Grant/Revoke Chat Perms | ✅ | ❌ | ❌ |
| ดู Staff List | ✅ | ✅ | ✅ |
| ดู BU List | ✅ | ✅ | ✅ |

#### Frontend: Role Guards
- เพิ่ม role guard บนหน้า `/staff/new` (Owner/Admin เท่านั้น)
- เพิ่ม role guard บนหน้า `/business-units/new` (Owner/Admin เท่านั้น)
- ซ่อนปุ่ม "New Business Unit" สำหรับ Staff role
- Staff detail page: ถ้าเป็น Staff role ให้แก้ไขได้เฉพาะ profile ตัวเอง

---

## B. Staff DTO Fix

### สถานะปัจจุบัน
- `StaffDto` = `(Id, FirstName, LastName, UserId, BuAssignments)` — ไม่มี Role, ไม่มี BuCount
- Frontend คาดหวัง `role` และ `buCount` → แสดงเป็นค่าว่าง

### แนวทางแก้ไข
- เพิ่ม `Role` field ใน `StaffDto` โดย join กับ `User` table ผ่าน `StaffProfile.UserId`
- เพิ่ม `BuCount` computed field = `StaffBus.Count()`
- แก้ทั้ง `ListStaffHandler` และ `GetStaffHandler`

---

## C. Chat Permission ↔ Chat Service Sync

### สถานะปัจจุบัน
- `.NET API` เก็บ `main.chat_permissions` (ใครควรเข้า chat ได้)
- `Go Chat Service` เก็บ `chat.workspace_members` (ใครเข้า chat ได้จริง)
- ไม่มี sync — Grant permission ใน .NET ไม่ได้เพิ่ม member ใน Go service
- BU creation ส่ง `owner_user_id = Guid.Empty` ไปยัง NATS

### แนวทางแก้ไข

#### Go Chat Service: เพิ่ม endpoint
- `GET /api/workspaces/by-bu/:buId` — lookup workspace จาก BU ID (ใช้ `GetByBuID` ที่มีอยู่แล้วใน repository)

#### .NET API: HTTP Client เรียก Chat Service
- สร้าง `IChatServiceClient` interface + `ChatServiceClient` implementation
- ใช้ `HttpClient` เรียก Go Chat Service
- **Grant Permission**: หลังบันทึก `ChatPermission` → เรียก `GET /api/workspaces/by-bu/{buId}` เพื่อหา workspace ID → เรียก `POST /api/workspaces/{wsId}/members` เพื่อเพิ่ม member
- **Revoke Permission**: ก่อนลบ `ChatPermission` → ดึง staffId + buId → lookup workspace → เรียก `DELETE /api/workspaces/{wsId}/members/{userId}`

#### แก้ BU Creation
- `CreateBuHandler`: ดึง `userId` จาก JWT claim แทนที่จะใช้ `Guid.Empty`

---

## D. Profile & Password Management

### สถานะปัจจุบัน
- ไม่มีหน้า "My Profile"
- Password change มีแค่สำหรับตัวเอง (forced change หลัง login ครั้งแรก)
- ไม่สามารถ reset/set password ให้ staff ได้

### แนวทางแก้ไข

#### API Endpoints ใหม่
1. `GET /api/staff/me` — ดึง StaffProfile ของ user ที่ login อยู่ (lookup ผ่าน UserId จาก JWT)
2. `PUT /api/staff/{id}` — แก้ไข profile (มีอยู่แล้ว แต่ต้องเพิ่ม role check)
3. `POST /api/staff/{id}/reset-password` — Owner/Admin reset password ให้ staff → auto-generate password, set `mustChangePassword = true`, return new password
4. `PUT /api/staff/{id}/password` — Owner/Admin set password ให้ staff โดยตรง → set `mustChangePassword = true`

#### Frontend
- เพิ่มลิงก์ "My Profile" ใน Sidebar → เรียก `GET /api/staff/me` แล้ว redirect ไป `/staff/:id`
- เพิ่มปุ่ม "Reset Password" และ "Set Password" ในหน้า Staff Detail (แสดงเฉพาะ Owner/Admin)
- Reset Password: กดปุ่ม → เรียก API → แสดง password ใหม่ใน SweetAlert2
- Set Password: form กรอก password ใหม่ → เรียก API

---

## E. Bug Fixes จาก Audit

### E1. Tenant Query Filters
- เพิ่ม `HasQueryFilter` สำหรับ `ChatPermission` — filter ด้วย company_id ผ่าน join กับ `StaffProfile` หรือ `BusinessUnit`
- เพิ่ม `HasQueryFilter` สำหรับ `StaffBu` — filter ผ่าน join

### E2. Docker Compose Port Fix
- แก้ `chat` service `DATABASE_URL` จาก port `5431` เป็น `5432` (container-to-container)

### E3. Validation
- เพิ่ม validation สำหรับ `Role` ใน `CreateStaffCommand` — ต้องเป็น "Admin" หรือ "Staff" เท่านั้น
- เพิ่ม uniqueness check สำหรับ username ใน `CreateStaffHandler`
- เพิ่ม password strength validation ใน `ChangePasswordHandler` (min 8 chars)

### E4. ChatPermission Tenant Isolation
- เพิ่ม `CompanyId` column ใน `ChatPermission` entity (หรือ join filter ผ่าน BU)
- ทางเลือก: ใช้ join filter `ChatPermission → BusinessUnit.CompanyId` แทนการเพิ่ม column ใหม่
  - เลือก approach นี้เพราะไม่ต้องเปลี่ยน schema

---

## F. System Design Document

### เนื้อหา
เขียนเป็น Markdown + Mermaid diagrams ภาษาไทย ครอบคลุม:

1. **ภาพรวมสถาปัตยกรรม** (Architecture Overview)
   - C4 Context diagram
   - Service topology

2. **Database Schema** (ER Diagram)
   - Schema `main` (ของ .NET API)
   - Schema `chat` (ของ Go Chat Service)
   - ความสัมพันธ์ระหว่าง table

3. **Multi-Tenancy Strategy**
   - Row-level isolation ด้วย `company_id`
   - EF Core Query Filters
   - JWT claims propagation

4. **Inter-Service Communication**
   - NATS JetStream event flow
   - HTTP sync calls (Chat Permission ↔ Chat Service)
   - Sequence diagrams

5. **Role-Based Access Control**
   - Role hierarchy
   - Permission matrix
   - Implementation strategy (MediatR pipeline)

6. **Authentication Flow**
   - JWT generation/validation
   - Cookie-based auth
   - Password management flow

---

## Tech Stack (ไม่เปลี่ยนแปลง)

| Layer | Technology |
|-------|-----------|
| API | .NET 10, Minimal APIs, MediatR, EF Core, FluentValidation |
| Chat | Go 1.25, Echo v4, pgx, NATS JetStream |
| Frontend | Next.js 16, React 19, TanStack Query/Table, Zustand, Zod |
| Database | PostgreSQL 16 |
| Messaging | NATS JetStream |
| Container | Docker Compose |
