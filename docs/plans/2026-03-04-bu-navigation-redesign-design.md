# BU Navigation Redesign — Design

**Goal:** Replace BU dropdown with a BU Dashboard page, restructure sidebar menus by role, add Settings drilldown for Owner, remove BU Access Control page.

**Why:** Current dropdown-based BU switching is confusing for users. A dedicated BU Dashboard (card grid) provides clearer navigation. Settings drilldown reduces menu clutter for Owner.

---

## Menu Structure

### Owner (multi-BU)

```
BU Dashboard
─── after selecting BU ───
  BU Staff
  Chat
───────────────────────
My Profile
Settings ▾ (default expanded)
  ├ Company Settings
  ├ BU Management
  └ Global Staff
```

### Owner (single-BU)

```
BU Staff        ← direct, no BU Dashboard
Chat
My Profile
Settings ▾
  ├ Company Settings
  ├ BU Management
  └ Global Staff
```

### Admin/Staff (multi-BU)

```
BU Dashboard
─── after selecting BU ───
  BU Staff
  Chat
───────────────────────
My Profile
```

### Admin/Staff (single-BU)

```
BU Staff
Chat
My Profile
```

---

## BU Dashboard Page

- Route: `/bu/dashboard`
- UI: Card grid (3 cols desktop, 1 col mobile), same style as current BU Access Control page
- Each card: BU name, user's role in that BU
- Click → `setActiveBuId(buId)` → sidebar shows BU Staff/Chat menus

---

## TopNav Changes

Remove BuSwitcher component. Layout becomes:

```
[Company Name]                    [FirstName LastName] [Sign Out]
```

---

## Login Flow

```
Login → Fetch BU assignments →
  ├─ mustChangePassword     → /change-password
  ├─ multi-BU (any role)    → /bu/dashboard
  ├─ single-BU (any role)   → /bu/{buId}/staff
  └─ no BU assignments      → /bu/management (Owner) or error
```

---

## BU Staff Permission Matrix

| Action | Owner | Admin | Staff |
|--------|-------|-------|-------|
| View staff list (BU-scoped) | ✓ | ✓ | ✓ (name only) |
| Edit name | ✓ | ✗ | ✗ |
| Edit role | ✓ | ✗ | ✗ |
| Edit email | ✓ | ✓ | ✗ |
| Reset/set password | ✓ | ✓ | ✗ |
| Delete staff | ✓ | ✗ | ✗ |
| Manage BU assignments | ✓ | ✗ | ✗ |
| Manage chat access | ✓ | ✗ | ✗ |

---

## What Changes

**Remove:**
- `BuSwitcher.tsx` component
- `/company/access-control/page.tsx` and route

**Modify:**
- `DynamicSidebar.tsx` — new menu structure with Settings drilldown
- `TopNav.tsx` — remove BuSwitcher
- Login page — new routing logic
- Change-password page — new routing logic
- `/bu/[buId]/staff/page.tsx` — permission-based UI (Staff sees read-only name list)

**Create:**
- `/bu/dashboard/page.tsx` — BU Dashboard card grid

**Keep unchanged:**
- All backend endpoints (no API changes needed)
- Auth store structure (activeBuId, buAssignments already exist)
- Global Staff pages (company/staff/*)
