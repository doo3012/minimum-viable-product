# BU Navigation Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace BU dropdown with BU Dashboard page, restructure sidebar by role with Settings drilldown, update login flow routing, remove BU Access Control page.

**Architecture:** Frontend-only changes. Use existing `/api/staff` endpoint for BU-scoped staff list (filter client-side by BU). Role-based sidebar menus via conditional rendering. Settings drilldown as collapsible section in sidebar.

**Tech Stack:** Next.js 16 App Router, React 19, Zustand, TanStack Query, Tailwind CSS, SweetAlert2

---

### Task 1: Create BU Dashboard Page

**Files:**
- Create: `apps/web/src/app/(app)/bu/dashboard/page.tsx`
- Modify: `apps/web/src/app/(app)/bu/page.tsx` (change redirect target)

**Step 1: Create the BU Dashboard page**

Create `apps/web/src/app/(app)/bu/dashboard/page.tsx`:

```tsx
'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';

export default function BuDashboardPage() {
  const { buAssignments, setActiveBuId } = useAuthStore();
  const router = useRouter();

  const handleSelect = (buId: string) => {
    setActiveBuId(buId);
    router.push(`/bu/${buId}/staff`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Business Units</h1>
      <p className="text-gray-500">Select a business unit to manage.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {buAssignments.map((bu) => (
          <button
            key={bu.buId}
            onClick={() => handleSelect(bu.buId)}
            className="block text-left bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <h2 className="text-base font-semibold text-gray-800">{bu.buName}</h2>
            <p className="text-sm text-gray-500 mt-1">{bu.role}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Update `/bu/page.tsx` redirect**

Change the redirect in `apps/web/src/app/(app)/bu/page.tsx` from `/bu/management` to `/bu/dashboard`:

```tsx
import { redirect } from 'next/navigation';

export default function BuIndexPage() {
  redirect('/bu/dashboard');
}
```

**Step 3: Verify**

Open http://localhost:3000/bu/dashboard — should show card grid of BU assignments. Click a card — should navigate to `/bu/{buId}/staff`.

**Step 4: Commit**

```bash
git add apps/web/src/app/\(app\)/bu/dashboard/page.tsx apps/web/src/app/\(app\)/bu/page.tsx
git commit -m "feat: add BU Dashboard page with card grid"
```

---

### Task 2: Redesign DynamicSidebar with Role-Based Menus and Settings Drilldown

**Files:**
- Modify: `apps/web/src/components/DynamicSidebar.tsx`

**Step 1: Rewrite DynamicSidebar**

Replace the entire file with the new role-based menu structure:

```tsx
'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MenuItem {
  label: string;
  href: string;
}

interface MenuSection {
  items: MenuItem[];
  separator?: boolean;  // show divider after this section
}

export function DynamicSidebar({ activeBuId }: { activeBuId?: string }) {
  const { globalRole, buAssignments, activeBuId: storedBuId } = useAuthStore();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(true);

  const isOwner = globalRole === 'Owner';
  const isMultiBu = buAssignments.length > 1;
  const effectiveBuId = activeBuId || storedBuId || buAssignments[0]?.buId;

  const sections: MenuSection[] = [];

  // BU Dashboard (multi-BU only)
  if (isMultiBu) {
    sections.push({
      items: [{ label: 'BU Dashboard', href: '/bu/dashboard' }],
      separator: !!effectiveBuId,
    });
  }

  // BU-scoped items (when a BU is selected or single-BU)
  if (effectiveBuId) {
    sections.push({
      items: [
        { label: 'BU Staff', href: `/bu/${effectiveBuId}/staff` },
        { label: 'Chat', href: `/bu/${effectiveBuId}/chat` },
      ],
      separator: true,
    });
  }

  // Personal
  sections.push({
    items: [{ label: 'My Profile', href: '/profile' }],
  });

  const settingsItems: MenuItem[] = isOwner
    ? [
        { label: 'Company Settings', href: '/company/settings' },
        { label: 'BU Management', href: '/bu/management' },
        { label: 'Global Staff', href: '/company/staff' },
      ]
    : [];

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col border-r border-gray-700 min-h-0">
      <nav className="flex-1 py-4 overflow-y-auto">
        {sections.map((section, si) => (
          <div key={si}>
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block px-6 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-gray-700 text-white border-l-2 border-blue-400'
                      : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            {section.separator && (
              <div className="my-2 mx-4 border-t border-gray-700" />
            )}
          </div>
        ))}

        {/* Settings drilldown (Owner only) */}
        {settingsItems.length > 0 && (
          <div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="w-full flex items-center justify-between px-6 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition"
            >
              <span>Settings</span>
              <span className="text-xs">{settingsOpen ? '▾' : '▸'}</span>
            </button>
            {settingsOpen &&
              settingsItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block pl-10 pr-6 py-2 text-sm transition ${
                      isActive
                        ? 'bg-gray-700 text-white border-l-2 border-blue-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </div>
        )}
      </nav>
    </aside>
  );
}
```

**Key changes from current sidebar:**
- Removed BU Access Control menu item
- Removed BU Dashboard (per-BU) menu item — replaced with top-level BU Dashboard
- Added Settings collapsible section for Owner (default expanded)
- BU Staff visible to all roles (was Admin-only), Chat visible when hasChatAccess or Owner
- Multi-BU users see "BU Dashboard" at top; single-BU users skip it

**Step 2: Verify**

- Owner with multi-BU: should see BU Dashboard, then BU Staff/Chat after selecting BU, then My Profile, then Settings with 3 sub-items
- Owner with single-BU: should see BU Staff, Chat, My Profile, Settings
- Admin/Staff: should see BU Dashboard (if multi-BU) or BU Staff/Chat (if single-BU), then My Profile, no Settings

**Step 3: Commit**

```bash
git add apps/web/src/components/DynamicSidebar.tsx
git commit -m "feat: redesign sidebar with role-based menus and Settings drilldown"
```

---

### Task 3: Remove BuSwitcher from TopNav

**Files:**
- Modify: `apps/web/src/components/TopNav.tsx`
- Delete: `apps/web/src/components/BuSwitcher.tsx`
- Modify: `apps/web/src/components/AppShell.tsx` (remove activeBuId prop from TopNav)

**Step 1: Update TopNav**

Remove the BuSwitcher import and usage. Remove `activeBuId` prop since it's no longer needed:

```tsx
'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function TopNav() {
  const { clearAuth, companyName, firstName, lastName } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    router.push('/login');
  };

  return (
    <header className="h-14 bg-gray-900 text-white flex items-center justify-between px-6 border-b border-gray-700">
      <div className="font-semibold text-lg">{companyName || 'MVP Platform'}</div>
      <div className="flex items-center gap-4">
        {firstName && (
          <span className="text-sm text-gray-300">
            {firstName} {lastName}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-300 hover:text-white transition"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
```

**Step 2: Update AppShell**

Remove `activeBuId` prop from `TopNav` call in `apps/web/src/components/AppShell.tsx`:

```tsx
'use client';

import { TopNav } from './TopNav';
import { DynamicSidebar } from './DynamicSidebar';

export function AppShell({
  activeBuId,
  children,
}: {
  activeBuId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopNav />
      <div className="flex flex-1 min-h-0">
        <DynamicSidebar activeBuId={activeBuId} />
        <main className="flex-1 bg-gray-50 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
```

**Step 3: Delete BuSwitcher.tsx**

```bash
rm apps/web/src/components/BuSwitcher.tsx
```

**Step 4: Verify**

TopNav should show `[Company Name]` on left and `[FirstName LastName] [Sign Out]` on right. No dropdown.

**Step 5: Commit**

```bash
git add apps/web/src/components/TopNav.tsx apps/web/src/components/AppShell.tsx
git add apps/web/src/components/BuSwitcher.tsx  # stages the deletion
git commit -m "feat: remove BuSwitcher from TopNav, simplify layout"
```

---

### Task 4: Update Login Flow Routing

**Files:**
- Modify: `apps/web/src/app/(public)/login/page.tsx`
- Modify: `apps/web/src/app/(public)/change-password/page.tsx`

**Step 1: Update login page routing logic**

In `apps/web/src/app/(public)/login/page.tsx`, change the `onSuccess` handler to route based on BU count:

Find the current routing block (after `setBuAssignments`):
```typescript
const firstBu = buRes.data[0];
if (firstBu) {
  setActiveBuId(firstBu.buId);
  router.push(`/bu/${firstBu.buId}/dashboard`);
} else {
  router.push('/bu/management');
}
```

Replace with:
```typescript
if (buRes.data.length > 1) {
  // multi-BU → BU Dashboard
  router.push('/bu/dashboard');
} else if (buRes.data.length === 1) {
  // single-BU → directly to BU Staff
  setActiveBuId(buRes.data[0].buId);
  router.push(`/bu/${buRes.data[0].buId}/staff`);
} else {
  // no BU → BU Management (Owner) or error
  router.push(globalRole === 'Owner' ? '/bu/management' : '/login');
}
```

Note: The `globalRole` variable is already destructured from `useAuthStore()` at the top — but currently only `setAuth`, `setBuAssignments`, `setActiveBuId` are destructured. Add `globalRole` to the destructuring for the `else` branch:

```typescript
const { setAuth, setBuAssignments, setActiveBuId, globalRole } = useAuthStore();
```

Wait — `globalRole` isn't set until `setAuth` is called (which happens earlier in `onSuccess`). But since Zustand state updates are synchronous within the same handler, reading from the destructured variable won't reflect the new state. Instead, use the `role` variable from `res.data`:

```typescript
const resolvedRole = role === 'Owner' ? 'Owner' : 'User';
// ...later...
router.push(resolvedRole === 'Owner' ? '/bu/management' : '/login');
```

Actually, `globalRole` is already computed as `const globalRole = role === 'Owner' ? 'Owner' : 'User'` on line 27. But this shadows the destructured one. Better to just use the local variable which is already available. So the routing logic should use the local `globalRole` variable that already exists at line 27.

**Step 2: Update change-password page routing**

In `apps/web/src/app/(public)/change-password/page.tsx`, find the same routing pattern and apply identical changes:

```typescript
if (buRes.data.length > 1) {
  router.push('/bu/dashboard');
} else if (buRes.data.length === 1) {
  setActiveBuId(buRes.data[0].buId);
  router.push(`/bu/${buRes.data[0].buId}/staff`);
} else {
  const role = store.globalRole;
  router.push(role === 'Owner' ? '/bu/management' : '/login');
}
```

**Step 3: Verify**

- Login as Owner with 2+ BUs → should go to `/bu/dashboard`
- Login as Owner with 1 BU → should go to `/bu/{buId}/staff`
- Login with mustChangePassword → change password → same routing as above

**Step 4: Commit**

```bash
git add apps/web/src/app/\(public\)/login/page.tsx apps/web/src/app/\(public\)/change-password/page.tsx
git commit -m "feat: update login flow to route based on BU count"
```

---

### Task 5: Redesign BU Staff Page with Permission-Based UI

**Files:**
- Modify: `apps/web/src/app/(app)/bu/[buId]/staff/page.tsx`

**Step 1: Rewrite BU Staff page**

The page currently calls `/business-units/${buId}/staff` (which doesn't exist as a backend endpoint). Change it to use `/api/staff` (global staff list, which is tenant-scoped) and filter by BU on the client.

The permission matrix from the design:
- **Owner**: sees all columns (Name, Role, Email), can click to edit
- **Admin**: sees Name, Email columns, can reset password
- **Staff**: sees Name only (read-only list)

```tsx
'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import Link from 'next/link';

interface StaffBuDto {
  buId: string;
  buName: string;
  email: string;
  hasChatAccess: boolean;
}

interface StaffDto {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
  role: string;
  buCount: number;
  buAssignments: StaffBuDto[];
}

export default function BuStaffPage({
  params,
}: {
  params: Promise<{ buId: string }>;
}) {
  const { buId } = use(params);
  const { globalRole, buAssignments } = useAuthStore();
  const activeBu = buAssignments.find((b) => b.buId === buId);
  const buRole = activeBu?.role;

  const isOwner = globalRole === 'Owner';
  const isAdmin = buRole === 'Admin' || isOwner;

  const { data, isLoading, isError } = useQuery<StaffDto[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data),
  });

  // Filter staff to only those assigned to this BU
  const buStaff = data?.filter((s) =>
    s.buAssignments.some((b) => b.buId === buId)
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        {activeBu?.buName ?? 'Business Unit'} — Staff
      </h1>

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && <p className="text-red-500">Failed to load staff.</p>}

      {buStaff && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                {isOwner && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                )}
                {isAdmin && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                )}
                {isOwner && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {buStaff.map((staff) => {
                const buAssignment = staff.buAssignments.find((b) => b.buId === buId);
                return (
                  <tr key={staff.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {staff.firstName} {staff.lastName}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-gray-700">{staff.role}</td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-700">
                        {buAssignment?.email ?? '—'}
                      </td>
                    )}
                    {isOwner && (
                      <td className="px-4 py-3">
                        <Link
                          href={`/company/staff/${staff.id}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Edit
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
              {buStaff.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No staff assigned to this business unit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

- Login as Owner → go to BU Staff → should see Name, Role, Email, Actions columns
- Login as Admin → go to BU Staff → should see Name, Email columns
- Login as Staff → go to BU Staff → should see Name column only

**Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/bu/\[buId\]/staff/page.tsx
git commit -m "feat: BU Staff page with role-based permission UI"
```

---

### Task 6: Remove BU Access Control Page

**Files:**
- Delete: `apps/web/src/app/(app)/company/access-control/page.tsx`

**Step 1: Delete the file**

```bash
rm apps/web/src/app/\(app\)/company/access-control/page.tsx
```

**Step 2: Verify**

Navigate to `/company/access-control` — should show 404. The sidebar no longer has a link to it (removed in Task 2).

**Step 3: Commit**

```bash
git add apps/web/src/app/\(app\)/company/access-control/page.tsx
git commit -m "feat: remove BU Access Control page (replaced by BU Staff permissions)"
```

---

### Task 7: Fix Chat Menu Visibility in Sidebar

**Files:**
- Modify: `apps/web/src/components/DynamicSidebar.tsx` (if not already handled in Task 2)

**Step 1: Verify Chat visibility logic**

In the sidebar from Task 2, the Chat menu item is shown unconditionally when a BU is selected. Update to check `hasChatAccess` or Owner role:

In the BU-scoped items section, change:
```typescript
{ label: 'Chat', href: `/bu/${effectiveBuId}/chat` },
```

To only include Chat when user has access:
```typescript
const activeBu = buAssignments.find((b) => b.buId === effectiveBuId);
const hasChatAccess = activeBu?.hasChatAccess ?? false;

// In the BU-scoped section:
const buItems: MenuItem[] = [
  { label: 'BU Staff', href: `/bu/${effectiveBuId}/staff` },
];
if (hasChatAccess || isOwner) {
  buItems.push({ label: 'Chat', href: `/bu/${effectiveBuId}/chat` });
}
sections.push({ items: buItems, separator: true });
```

**Step 2: Verify**

- User with chat access → Chat menu visible
- User without chat access (and not Owner) → Chat menu hidden
- Owner → Chat menu always visible

**Step 3: Commit**

```bash
git add apps/web/src/components/DynamicSidebar.tsx
git commit -m "fix: show Chat menu only when user has chat access or is Owner"
```

---

### Task 8: End-to-End Verification

**Step 1: Test full flow as Owner (multi-BU)**

1. Login → should redirect to `/bu/dashboard`
2. See card grid of BUs with role badges
3. Click a BU → sidebar shows BU Staff + Chat, navigates to `/bu/{buId}/staff`
4. BU Staff page shows all columns (Name, Role, Email, Actions)
5. Sidebar shows BU Dashboard, separator, BU Staff, Chat, separator, My Profile, Settings (expanded: Company Settings, BU Management, Global Staff)
6. No BuSwitcher in TopNav
7. Click BU Dashboard in sidebar → back to card grid

**Step 2: Test as Owner (single-BU)**

1. Login → should redirect to `/bu/{buId}/staff` directly
2. Sidebar: BU Staff, Chat, separator, My Profile, Settings (expanded)
3. No BU Dashboard menu item

**Step 3: Test as Staff (single-BU)**

1. Login → should redirect to `/bu/{buId}/staff`
2. BU Staff page shows Name column only
3. Sidebar: BU Staff, My Profile (no Settings, no Chat if no chat access)

**Step 4: Verify removed pages**

1. `/company/access-control` → 404
2. No BU Access Control in sidebar

**Step 5: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: end-to-end verification fixes"
```
