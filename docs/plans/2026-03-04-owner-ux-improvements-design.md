# Owner UX Improvements Design

**Date:** 2026-03-04
**Scope:** Owner role — TopNav, Sidebar, BU Management, Global Staff

---

## 1. TopNav — Company Name + User Name

**Problem:** TopNav shows hardcoded "MVP Platform" and no user identity.

**Solution:** Add `companyName`, `firstName`, `lastName` to login response.

- **Backend:** Expand `LoginResponse` to include `companyName`, `firstName`, `lastName` by joining `companies` and `staff_profiles` tables in login handler.
- **Auth Store:** Add `companyName`, `firstName`, `lastName` fields + update `setAuth()`.
- **TopNav:**
  - Left: Display `companyName` instead of "MVP Platform"
  - Right: Display `firstName lastName` before Sign Out button

---

## 2. Sidebar Bug — Owner Must See All Menus

**Problem:** Clicking Global menu items (no buId in URL) causes `activeBuId` to be `undefined`, hiding BU-scoped menus.

**Solution:** Persist `activeBuId` in auth store with fallback logic.

- **Auth Store:** Add `activeBuId` + `setActiveBuId()` (persisted via Zustand persist).
- **DynamicSidebar:** When URL has no buId (Global pages), fallback to `activeBuId` from store. Owner always sees BU-scoped menus if at least 1 BU exists.
- **BuSwitcher:** On BU change, update `activeBuId` in store.
- **Login flow:** Set `activeBuId` to first BU after login.
- **Rename:** BU with `isDefault: true` displays as "Head Quarter" instead of "default".

---

## 3. BU Management — Instant Dropdown Update

**Problem:** After adding a BU, the BuSwitcher dropdown doesn't reflect the new BU.

**Solution:** Re-fetch `buAssignments` after successful BU creation.

- After `POST /business-units` succeeds, call `GET /staff/me/bu-assignments`.
- Update `buAssignments` in auth store.
- BuSwitcher reads from store and updates automatically.

---

## 4. Global Staff — List Page Redesign

**Problem:** Current list shows minimal info (name, role, buCount, View button).

**Redesigned row layout:**

```
┌──────────────────────────────────────────────────────┐
│ สมชาย ใจดี       | Admin        | [Edit] [Delete]    │
│ 🟢 Head Quarter  🔴 สาขา กรุงเทพ  🟢 สาขา เชียงใหม่   │
└──────────────────────────────────────────────────────┘
```

- **Row 1:** Full name, role, Edit button, Delete button
- **Row 2:** BU names as badges/pills with chat access status (green = has chat, gray/red = no chat)

**Backend changes:**
- `DELETE /api/staff/{id}` — Hard delete staff (cascade: user, staff_bu, chat_permissions)
- Expand `GET /api/staff` response to include chat permission status per BU in `StaffBuDto`

---

## 5. Global Staff — Add/Edit Staff Page

**Problem:** Add form only supports 1 initial BU. Edit page uses tabs. No BU management or chat access toggle.

**Solution:** Single-page form with profile fields + BU assignment table below.

### Add Staff (`/company/staff/new`)

```
┌─────────────────────────────────────────────┐
│ First Name: [___________]                   │
│ Last Name:  [___________]                   │
│ Role:       [Admin ▼]                       │
│                                             │
│ ── BU Assignments ──────────────────────    │
│ [Dropdown: เลือก BU ▼]  [+ Add]             │
│ ┌──────────────┬─────────────┬──────────┐   │
│ │ BU Name      │ Chat Access │ Actions  │   │
│ ├──────────────┼─────────────┼──────────┤   │
│ │ Head Quarter │ [Toggle]    │ [Remove] │   │
│ └──────────────┴─────────────┴──────────┘   │
│                                             │
│              [Save Staff]                   │
└─────────────────────────────────────────────┘
```

### Edit Staff (`/company/staff/[id]`)

Same as Add but pre-loaded. BU add/remove and chat toggle execute immediately (no Save needed). Profile changes require Save. Password section (Reset/Set) below BU table.

### Backend endpoints needed

| Method | Path | Purpose | Status |
|--------|------|---------|--------|
| `PUT` | `/api/staff/{id}` | Update firstName, lastName | **New** |
| `POST` | `/api/staff/{staffId}/bu/{buId}` | Add BU assignment to staff | **New** |
| `DELETE` | `/api/staff/{staffId}/bu/{buId}` | Remove BU assignment from staff | **New** |
| `DELETE` | `/api/staff/{id}` | Hard delete staff | **New** |
| `POST` | `/api/chat-permissions` | Grant chat access (per BU) | Exists |
| `DELETE` | `/api/chat-permissions/{id}` | Revoke chat access | Exists |

### Save flow

- **Add:** Create staff → assign BUs one by one → grant chat if toggled on
- **Edit:** Profile update via Save button. BU add/remove + chat toggle are real-time (immediate API calls on click).
