# Owner UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve Owner experience with company/user name display, sidebar fix, BU refresh, and Global Staff management redesign.

**Architecture:** Expand .NET login response, add new staff/BU endpoints (VSA + MediatR), update Zustand auth store, redesign Next.js pages.

**Tech Stack:** .NET 10 Minimal APIs, MediatR CQRS, EF Core 10, Next.js 16, React 19, Zustand, TanStack Query, Tailwind CSS 4

---

## Task 1: Backend — Expand Login Response

**Files:**
- Modify: `apps/api/Api/Features/Auth/Login/LoginCommand.cs`
- Modify: `apps/api/Api/Features/Auth/Login/LoginHandler.cs`
- Modify: `apps/api/Api/Features/Auth/Login/LoginEndpoint.cs`

**Step 1: Update LoginResult record**

In `LoginCommand.cs`, add `CompanyName`, `FirstName`, `LastName`:

```csharp
using MediatR;
namespace Api.Features.Auth.Login;
public record LoginCommand(string Username, string Password) : IRequest<LoginResult>;
public record LoginResult(
    string Token, bool MustChangePassword, Guid UserId, string Role,
    string CompanyName, string FirstName, string LastName);
```

**Step 2: Update LoginHandler to join Company and StaffProfile**

In `LoginHandler.cs`, after verifying credentials, fetch company name and staff profile:

```csharp
using Api.Common.Jwt;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Auth.Login;
public class LoginHandler(AppDbContext db, JwtService jwt)
    : IRequestHandler<LoginCommand, LoginResult>
{
    public async Task<LoginResult> Handle(LoginCommand cmd, CancellationToken ct)
    {
        var user = await db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Username == cmd.Username, ct)
            ?? throw new UnauthorizedAccessException("Invalid credentials");

        if (!BCrypt.Net.BCrypt.Verify(cmd.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials");

        var companyName = await db.Companies
            .Where(c => c.Id == user.CompanyId)
            .Select(c => c.Name)
            .FirstOrDefaultAsync(ct) ?? "";

        var staff = await db.StaffProfiles
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == user.Id, ct);

        var token = jwt.Generate(user.Id, user.CompanyId, user.Role);
        return new LoginResult(
            token, user.MustChangePassword, user.Id, user.Role,
            companyName, staff?.FirstName ?? "", staff?.LastName ?? "");
    }
}
```

**Step 3: Update LoginEndpoint to return new fields**

In `LoginEndpoint.cs`, update the Ok response:

```csharp
return Results.Ok(new {
    result.UserId, result.Role, result.MustChangePassword,
    result.CompanyName, result.FirstName, result.LastName
});
```

**Step 4: Build and verify**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 5: Commit**

```bash
git add apps/api/Api/Features/Auth/Login/
git commit -m "feat(api): expand login response with companyName, firstName, lastName"
```

---

## Task 2: Frontend — Auth Store + Login Flow

**Files:**
- Modify: `apps/web/src/stores/authStore.ts`
- Modify: `apps/web/src/app/(public)/login/page.tsx`

**Step 1: Update auth store with new fields**

Replace `apps/web/src/stores/authStore.ts`:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BuAssignment {
  buId: string;
  buName: string;
  role: string;
  hasChatAccess: boolean;
}

interface AuthState {
  userId: string | null;
  globalRole: string | null;
  companyId: string | null;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  mustChangePassword: boolean;
  activeBuId: string | null;
  buAssignments: BuAssignment[];
  setAuth: (params: {
    userId: string;
    globalRole: string;
    mustChangePassword: boolean;
    companyName: string;
    firstName: string;
    lastName: string;
  }) => void;
  setBuAssignments: (assignments: BuAssignment[]) => void;
  setActiveBuId: (buId: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      globalRole: null,
      companyId: null,
      companyName: null,
      firstName: null,
      lastName: null,
      mustChangePassword: false,
      activeBuId: null,
      buAssignments: [],
      setAuth: ({ userId, globalRole, mustChangePassword, companyName, firstName, lastName }) =>
        set({ userId, globalRole, mustChangePassword, companyName, firstName, lastName }),
      setBuAssignments: (assignments) =>
        set({ buAssignments: assignments }),
      setActiveBuId: (buId) =>
        set({ activeBuId: buId }),
      clearAuth: () =>
        set({
          userId: null,
          globalRole: null,
          companyId: null,
          companyName: null,
          firstName: null,
          lastName: null,
          mustChangePassword: false,
          activeBuId: null,
          buAssignments: [],
        }),
    }),
    { name: 'auth-store' }
  )
);
```

**Step 2: Update login page to use new setAuth and set activeBuId**

In `apps/web/src/app/(public)/login/page.tsx`, update the `onSuccess` callback:

```typescript
onSuccess: async (res) => {
  const { userId, role, mustChangePassword, companyName, firstName, lastName } = res.data;
  const globalRole = role === 'Owner' ? 'Owner' : 'User';
  setAuth({ userId, globalRole, mustChangePassword, companyName, firstName, lastName });

  if (mustChangePassword) {
    router.push('/change-password');
    return;
  }

  // Fetch BU assignments
  try {
    const buRes = await api.get('/staff/me/bu-assignments');
    setBuAssignments(buRes.data);
    const firstBu = buRes.data[0];
    if (firstBu) {
      setActiveBuId(firstBu.buId);
      router.push(`/bu/${firstBu.buId}/dashboard`);
    } else {
      router.push('/bu/management');
    }
  } catch {
    router.push('/bu/management');
  }
},
```

Also update destructuring at top of component:

```typescript
const { setAuth, setBuAssignments, setActiveBuId } = useAuthStore();
```

**Step 3: Verify frontend compiles**

Run: `cd apps/web && npx next build --no-lint`
Expected: Build succeeds (or use `npm run dev` to check for errors)

**Step 4: Commit**

```bash
git add apps/web/src/stores/authStore.ts apps/web/src/app/\(public\)/login/page.tsx
git commit -m "feat(web): add companyName, firstName, lastName, activeBuId to auth store"
```

---

## Task 3: Frontend — TopNav Company Name + User Name

**Files:**
- Modify: `apps/web/src/components/TopNav.tsx`

**Step 1: Update TopNav to show company name and user name**

Replace `apps/web/src/components/TopNav.tsx`:

```typescript
'use client';

import { useAuthStore } from '@/stores/authStore';
import { BuSwitcher } from './BuSwitcher';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function TopNav({ activeBuId }: { activeBuId?: string }) {
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
      <BuSwitcher activeBuId={activeBuId} />
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

**Step 2: Commit**

```bash
git add apps/web/src/components/TopNav.tsx
git commit -m "feat(web): display company name and user name in TopNav"
```

---

## Task 4: Frontend — Sidebar Bug Fix (activeBuId Fallback)

**Files:**
- Modify: `apps/web/src/components/DynamicSidebar.tsx`
- Modify: `apps/web/src/components/BuSwitcher.tsx`

**Step 1: Update DynamicSidebar to fallback to activeBuId from store**

Replace `apps/web/src/components/DynamicSidebar.tsx`:

```typescript
'use client';

import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarItem {
  label: string;
  href: string;
  show: boolean;
}

export function DynamicSidebar({ activeBuId }: { activeBuId?: string }) {
  const { globalRole, buAssignments, activeBuId: storedBuId } = useAuthStore();
  const pathname = usePathname();

  const isOwner = globalRole === 'Owner';

  // Fallback: if no activeBuId from URL (Global pages), use stored activeBuId
  const effectiveBuId = activeBuId || storedBuId || buAssignments[0]?.buId;

  const activeBu = buAssignments.find((b) => b.buId === effectiveBuId);
  const buRole = activeBu?.role;
  const isAdmin = buRole === 'Admin' || isOwner;
  const hasChatAccess = activeBu?.hasChatAccess ?? false;

  const items: SidebarItem[] = [
    // Global (Owner only)
    { label: 'Company Settings', href: '/company/settings', show: isOwner },
    { label: 'BU Management', href: '/bu/management', show: isOwner },
    { label: 'Global Staff', href: '/company/staff', show: isOwner },
    { label: 'BU Access Control', href: '/company/access-control', show: isOwner },

    // BU-scoped (show when effectiveBuId exists)
    ...(effectiveBuId
      ? [
          { label: 'Dashboard', href: `/bu/${effectiveBuId}/dashboard`, show: true },
          { label: 'BU Staff', href: `/bu/${effectiveBuId}/staff`, show: isAdmin },
          { label: 'Chat', href: `/bu/${effectiveBuId}/chat`, show: hasChatAccess || isOwner },
        ]
      : []),

    // Personal
    { label: 'My Profile', href: '/profile', show: true },
  ];

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col border-r border-gray-700 min-h-0">
      <nav className="flex-1 py-4 overflow-y-auto">
        {items
          .filter((item) => item.show)
          .map((item) => {
            const isActive = pathname === item.href;
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
      </nav>
    </aside>
  );
}
```

**Step 2: Update BuSwitcher to sync activeBuId to store**

Replace `apps/web/src/components/BuSwitcher.tsx`:

```typescript
'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';

export function BuSwitcher({ activeBuId }: { activeBuId?: string }) {
  const { buAssignments, activeBuId: storedBuId, setActiveBuId } = useAuthStore();
  const router = useRouter();

  if (buAssignments.length === 0) return null;

  const effectiveBuId = activeBuId || storedBuId || buAssignments[0]?.buId;

  const handleChange = (buId: string) => {
    setActiveBuId(buId);
    router.push(`/bu/${buId}/dashboard`);
  };

  if (buAssignments.length === 1) {
    return (
      <span className="text-sm text-gray-300">{buAssignments[0].buName}</span>
    );
  }

  return (
    <select
      value={effectiveBuId || ''}
      onChange={(e) => handleChange(e.target.value)}
      className="bg-gray-800 text-white text-sm rounded px-3 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {buAssignments.map((bu) => (
        <option key={bu.buId} value={bu.buId}>
          {bu.buName}
        </option>
      ))}
    </select>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/components/DynamicSidebar.tsx apps/web/src/components/BuSwitcher.tsx
git commit -m "fix(web): sidebar bug — persist activeBuId so Owner sees all menus on Global pages"
```

---

## Task 5: Frontend — BU Management Refresh BuSwitcher After Create

**Files:**
- Modify: `apps/web/src/app/(app)/bu/management/page.tsx`

**Step 1: Re-fetch buAssignments after BU creation**

In `apps/web/src/app/(app)/bu/management/page.tsx`, update the `createMutation.onSuccess`:

Add to imports/destructuring at top:
```typescript
const { globalRole, setBuAssignments } = useAuthStore();
```

Update `onSuccess` in `createMutation`:
```typescript
onSuccess: async () => {
  await queryClient.invalidateQueries({ queryKey: ['business-units'] });

  // Refresh BU assignments so BuSwitcher updates immediately
  try {
    const buRes = await api.get('/staff/me/bu-assignments');
    setBuAssignments(buRes.data);
  } catch {}

  await Swal.fire('Created!', 'Business unit has been created.', 'success');
  reset();
  setShowForm(false);
},
```

Also update the `isDefault` column to show "Head Quarter":
```typescript
col.accessor('isDefault', {
  header: 'Type',
  cell: (info) => (info.getValue() ? 'Head Quarter' : '—'),
}),
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/bu/management/page.tsx
git commit -m "feat(web): refresh BuSwitcher after BU creation, rename default to Head Quarter"
```

---

## Task 6: Backend — Delete Staff Endpoint

**Files:**
- Create: `apps/api/Api/Features/Staff/Delete/DeleteStaffCommand.cs`
- Create: `apps/api/Api/Features/Staff/Delete/DeleteStaffHandler.cs`
- Create: `apps/api/Api/Features/Staff/Delete/DeleteStaffEndpoint.cs`
- Modify: `apps/api/Api/Program.cs`

**Step 1: Create DeleteStaffCommand**

Create `apps/api/Api/Features/Staff/Delete/DeleteStaffCommand.cs`:

```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Delete;

public record DeleteStaffCommand(Guid StaffId) : IRequest, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
```

**Step 2: Create DeleteStaffHandler**

Create `apps/api/Api/Features/Staff/Delete/DeleteStaffHandler.cs`:

```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.Delete;

public class DeleteStaffHandler(AppDbContext db) : IRequestHandler<DeleteStaffCommand>
{
    public async Task Handle(DeleteStaffCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .Include(s => s.StaffBus)
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        // Delete chat permissions
        var chatPerms = await db.ChatPermissions
            .Where(cp => cp.StaffId == cmd.StaffId)
            .ToListAsync(ct);
        db.ChatPermissions.RemoveRange(chatPerms);

        // Delete BU assignments
        db.StaffBus.RemoveRange(staff.StaffBus);

        // Delete user account if linked
        if (staff.UserId.HasValue)
        {
            var user = await db.Users
                .FirstOrDefaultAsync(u => u.Id == staff.UserId, ct);
            if (user != null) db.Users.Remove(user);
        }

        // Delete staff profile
        db.StaffProfiles.Remove(staff);

        await db.SaveChangesAsync(ct);
    }
}
```

**Step 3: Create DeleteStaffEndpoint**

Create `apps/api/Api/Features/Staff/Delete/DeleteStaffEndpoint.cs`:

```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.Delete;

public static class DeleteStaffEndpoint
{
    public static void MapDeleteStaff(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/staff/{id:guid}", async (
            Guid id, IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new DeleteStaffCommand(id) { CompanyId = companyId };
            try
            {
                await mediator.Send(cmd, ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        }).RequireAuthorization()
          .WithName("DeleteStaff")
          .WithTags("Staff")
          .Produces(200)
          .Produces(404)
          .Produces(401)
          .Produces(403);
    }
}
```

**Step 4: Register endpoint in Program.cs**

In `apps/api/Api/Program.cs`, add after `app.MapSetPassword();` (line 141):

```csharp
app.MapDeleteStaff();
```

Add the using statement at the top of Program.cs if not auto-resolved:
```csharp
using Api.Features.Staff.Delete;
```

**Step 5: Build and verify**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add apps/api/Api/Features/Staff/Delete/ apps/api/Api/Program.cs
git commit -m "feat(api): add DELETE /api/staff/{id} endpoint for hard delete"
```

---

## Task 7: Backend — Update Staff Profile Endpoint

**Files:**
- Create: `apps/api/Api/Features/Staff/UpdateProfile/UpdateStaffProfileCommand.cs`
- Create: `apps/api/Api/Features/Staff/UpdateProfile/UpdateStaffProfileHandler.cs`
- Create: `apps/api/Api/Features/Staff/UpdateProfile/UpdateStaffProfileEndpoint.cs`
- Modify: `apps/api/Api/Program.cs`

**Step 1: Create UpdateStaffProfileCommand**

Create `apps/api/Api/Features/Staff/UpdateProfile/UpdateStaffProfileCommand.cs`:

```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.UpdateProfile;

public record UpdateStaffProfileCommand(
    Guid StaffId, string FirstName, string LastName
) : IRequest, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
```

**Step 2: Create UpdateStaffProfileHandler**

Create `apps/api/Api/Features/Staff/UpdateProfile/UpdateStaffProfileHandler.cs`:

```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.UpdateProfile;

public class UpdateStaffProfileHandler(AppDbContext db) : IRequestHandler<UpdateStaffProfileCommand>
{
    public async Task Handle(UpdateStaffProfileCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        staff.FirstName = cmd.FirstName;
        staff.LastName = cmd.LastName;
        await db.SaveChangesAsync(ct);
    }
}
```

**Step 3: Create UpdateStaffProfileEndpoint**

Create `apps/api/Api/Features/Staff/UpdateProfile/UpdateStaffProfileEndpoint.cs`:

```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.UpdateProfile;

public static class UpdateStaffProfileEndpoint
{
    public static void MapUpdateStaffProfile(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/staff/{id:guid}", async (
            Guid id, UpdateStaffProfileRequest req,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new UpdateStaffProfileCommand(id, req.FirstName, req.LastName)
                { CompanyId = companyId };
            try
            {
                await mediator.Send(cmd, ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        }).RequireAuthorization()
          .WithName("UpdateStaffProfile")
          .WithTags("Staff")
          .Produces(200)
          .Produces(404)
          .Produces(401)
          .Produces(403);
    }
}
public record UpdateStaffProfileRequest(string FirstName, string LastName);
```

**Step 4: Register in Program.cs**

In `apps/api/Api/Program.cs`, add after `app.MapDeleteStaff();`:

```csharp
app.MapUpdateStaffProfile();
```

**Step 5: Build and verify**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add apps/api/Api/Features/Staff/UpdateProfile/ apps/api/Api/Program.cs
git commit -m "feat(api): add PUT /api/staff/{id} endpoint for profile update"
```

---

## Task 8: Backend — Add/Remove BU Assignment Endpoints

**Files:**
- Create: `apps/api/Api/Features/Staff/AddBu/AddStaffBuCommand.cs`
- Create: `apps/api/Api/Features/Staff/AddBu/AddStaffBuHandler.cs`
- Create: `apps/api/Api/Features/Staff/AddBu/AddStaffBuEndpoint.cs`
- Create: `apps/api/Api/Features/Staff/RemoveBu/RemoveStaffBuCommand.cs`
- Create: `apps/api/Api/Features/Staff/RemoveBu/RemoveStaffBuHandler.cs`
- Create: `apps/api/Api/Features/Staff/RemoveBu/RemoveStaffBuEndpoint.cs`
- Modify: `apps/api/Api/Program.cs`

**Step 1: Create AddStaffBuCommand**

Create `apps/api/Api/Features/Staff/AddBu/AddStaffBuCommand.cs`:

```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.AddBu;

public record AddStaffBuCommand(Guid StaffId, Guid BuId) : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
```

**Step 2: Create AddStaffBuHandler**

Create `apps/api/Api/Features/Staff/AddBu/AddStaffBuHandler.cs`:

```csharp
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.AddBu;

public class AddStaffBuHandler(AppDbContext db) : IRequestHandler<AddStaffBuCommand, Guid>
{
    public async Task<Guid> Handle(AddStaffBuCommand cmd, CancellationToken ct)
    {
        var exists = await db.StaffBus
            .AnyAsync(sb => sb.StaffId == cmd.StaffId && sb.BuId == cmd.BuId, ct);
        if (exists)
            throw new InvalidOperationException("Staff is already assigned to this BU");

        var staffBu = new StaffBu
        {
            Id = Guid.NewGuid(),
            StaffId = cmd.StaffId,
            BuId = cmd.BuId,
            Email = "",
            Role = "Staff",
            CreatedAt = DateTime.UtcNow
        };
        db.StaffBus.Add(staffBu);
        await db.SaveChangesAsync(ct);
        return staffBu.Id;
    }
}
```

**Step 3: Create AddStaffBuEndpoint**

Create `apps/api/Api/Features/Staff/AddBu/AddStaffBuEndpoint.cs`:

```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.AddBu;

public static class AddStaffBuEndpoint
{
    public static void MapAddStaffBu(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/staff/{staffId:guid}/bu/{buId:guid}", async (
            Guid staffId, Guid buId,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new AddStaffBuCommand(staffId, buId) { CompanyId = companyId };
            try
            {
                var id = await mediator.Send(cmd, ct);
                return Results.Created($"/api/staff/{staffId}/bu/{buId}", new { id });
            }
            catch (InvalidOperationException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }
        }).RequireAuthorization()
          .WithName("AddStaffBu")
          .WithTags("Staff")
          .Produces(201)
          .Produces(409)
          .Produces(401)
          .Produces(403);
    }
}
```

**Step 4: Create RemoveStaffBuCommand**

Create `apps/api/Api/Features/Staff/RemoveBu/RemoveStaffBuCommand.cs`:

```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.RemoveBu;

public record RemoveStaffBuCommand(Guid StaffId, Guid BuId) : IRequest, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
```

**Step 5: Create RemoveStaffBuHandler**

Create `apps/api/Api/Features/Staff/RemoveBu/RemoveStaffBuHandler.cs`:

```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.RemoveBu;

public class RemoveStaffBuHandler(AppDbContext db) : IRequestHandler<RemoveStaffBuCommand>
{
    public async Task Handle(RemoveStaffBuCommand cmd, CancellationToken ct)
    {
        var staffBu = await db.StaffBus
            .FirstOrDefaultAsync(sb => sb.StaffId == cmd.StaffId && sb.BuId == cmd.BuId, ct)
            ?? throw new KeyNotFoundException("BU assignment not found");

        // Also remove chat permission for this BU if exists
        var chatPerm = await db.ChatPermissions
            .FirstOrDefaultAsync(cp => cp.StaffId == cmd.StaffId && cp.BuId == cmd.BuId, ct);
        if (chatPerm != null) db.ChatPermissions.Remove(chatPerm);

        db.StaffBus.Remove(staffBu);
        await db.SaveChangesAsync(ct);
    }
}
```

**Step 6: Create RemoveStaffBuEndpoint**

Create `apps/api/Api/Features/Staff/RemoveBu/RemoveStaffBuEndpoint.cs`:

```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.RemoveBu;

public static class RemoveStaffBuEndpoint
{
    public static void MapRemoveStaffBu(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/staff/{staffId:guid}/bu/{buId:guid}", async (
            Guid staffId, Guid buId,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new RemoveStaffBuCommand(staffId, buId) { CompanyId = companyId };
            try
            {
                await mediator.Send(cmd, ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        }).RequireAuthorization()
          .WithName("RemoveStaffBu")
          .WithTags("Staff")
          .Produces(200)
          .Produces(404)
          .Produces(401)
          .Produces(403);
    }
}
```

**Step 7: Register endpoints in Program.cs**

In `apps/api/Api/Program.cs`, add after `app.MapUpdateStaffProfile();`:

```csharp
app.MapAddStaffBu();
app.MapRemoveStaffBu();
```

**Step 8: Build and verify**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 9: Commit**

```bash
git add apps/api/Api/Features/Staff/AddBu/ apps/api/Api/Features/Staff/RemoveBu/ apps/api/Api/Program.cs
git commit -m "feat(api): add POST/DELETE /api/staff/{staffId}/bu/{buId} endpoints"
```

---

## Task 9: Backend — Expand Staff List with Chat Permission Status

**Files:**
- Modify: `apps/api/Api/Features/Staff/List/ListStaffQuery.cs`
- Modify: `apps/api/Api/Features/Staff/List/ListStaffHandler.cs` (find the actual handler file)

**Step 1: Update StaffBuDto to include hasChatAccess**

In `ListStaffQuery.cs`:

```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.List;

public record ListStaffQuery : IRequest<IEnumerable<StaffDto>>, ITenantScoped;

public record StaffBuDto(Guid BuId, string BuName, string Email, bool HasChatAccess);
public record StaffDto(
    Guid Id, string FirstName, string LastName, Guid? UserId,
    string Role, int BuCount,
    IEnumerable<StaffBuDto> BuAssignments);
```

**Step 2: Update the handler to include chat permissions**

Find the ListStaff handler file. It should query chat_permissions and join with BU assignments. Update the query to:

```csharp
var chatPermissions = await db.ChatPermissions.ToListAsync(ct);

// In the projection, for each staff BU:
BuAssignments = s.StaffBus.Select(sb => new StaffBuDto(
    sb.BuId,
    sb.Bu.Name,
    sb.Email,
    chatPermissions.Any(cp => cp.StaffId == s.Id && cp.BuId == sb.BuId)
))
```

Note: The exact implementation depends on the current handler code. Find the file at `apps/api/Api/Features/Staff/List/` and add the chat permission lookup.

**Step 3: Also update GetStaff (single staff) to include hasChatAccess in StaffBuDto**

Find `apps/api/Api/Features/Staff/Get/` handler and update it to use the same `StaffBuDto` with `HasChatAccess`.

**Step 4: Build and verify**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 5: Commit**

```bash
git add apps/api/Api/Features/Staff/
git commit -m "feat(api): include hasChatAccess per BU in staff list and detail responses"
```

---

## Task 10: Frontend — Global Staff List Page Redesign

**Files:**
- Modify: `apps/web/src/app/(app)/company/staff/page.tsx`

**Step 1: Rewrite the staff list page with 2-row layout**

Replace `apps/web/src/app/(app)/company/staff/page.tsx`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

interface StaffBuInfo {
  buId: string;
  buName: string;
  email: string;
  hasChatAccess: boolean;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  buCount: number;
  buAssignments: StaffBuInfo[];
}

export default function CompanyStaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { globalRole } = useAuthStore();

  const { data, isLoading, isError } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data),
    enabled: globalRole === 'Owner',
  });

  const deleteMutation = useMutation({
    mutationFn: (staffId: string) => api.delete(`/staff/${staffId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      Swal.fire('Deleted!', 'Staff member has been removed.', 'success');
    },
    onError: () => Swal.fire('Error', 'Failed to delete staff member.', 'error'),
  });

  const handleDelete = async (staff: StaffMember) => {
    const result = await Swal.fire({
      title: 'Delete Staff?',
      text: `Are you sure you want to delete ${staff.firstName} ${staff.lastName}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Delete',
    });
    if (result.isConfirmed) {
      deleteMutation.mutate(staff.id);
    }
  };

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can view the global staff directory.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Global Staff</h1>
        <button
          onClick={() => router.push('/company/staff/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          + New Staff
        </button>
      </div>

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && <p className="text-red-500">Failed to load staff.</p>}

      {data && (
        <div className="space-y-3">
          {data.map((staff) => (
            <div
              key={staff.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-4"
            >
              {/* Row 1: Name, Role, Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">
                    {staff.firstName} {staff.lastName}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {staff.role}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/company/staff/${staff.id}`)}
                    className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1 rounded border border-blue-200 hover:bg-blue-50 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(staff)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-red-600 hover:text-red-800 px-3 py-1 rounded border border-red-200 hover:bg-red-50 transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Row 2: BU badges with chat status */}
              {staff.buAssignments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {staff.buAssignments.map((bu) => (
                    <span
                      key={bu.buId}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                        bu.hasChatAccess
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          bu.hasChatAccess ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      {bu.buName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {data.length === 0 && (
            <p className="text-gray-500 text-center py-8">No staff members found.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/company/staff/page.tsx
git commit -m "feat(web): redesign Global Staff list with 2-row cards, BU badges, delete button"
```

---

## Task 11: Frontend — Edit Staff Page Redesign

**Files:**
- Modify: `apps/web/src/app/(app)/company/staff/[id]/page.tsx`

**Step 1: Rewrite the edit staff page with profile form + BU table**

Replace `apps/web/src/app/(app)/company/staff/[id]/page.tsx`:

```typescript
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Required').max(100),
  lastName: z.string().min(1, 'Required').max(100),
});
type ProfileData = z.infer<typeof profileSchema>;

interface StaffBuInfo {
  buId: string;
  buName: string;
  email: string;
  hasChatAccess: boolean;
}

interface StaffDetail {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  buAssignments: StaffBuInfo[];
}

interface BusinessUnit {
  id: string;
  name: string;
}

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { globalRole } = useAuthStore();
  const [selectedBuId, setSelectedBuId] = useState('');

  const { data, isLoading } = useQuery<StaffDetail>({
    queryKey: ['staff', id],
    queryFn: () => api.get(`/staff/${id}`).then((r) => r.data),
  });

  const { data: allBus } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    values: data ? { firstName: data.firstName, lastName: data.lastName } : undefined,
  });

  const updateProfile = useMutation({
    mutationFn: (d: ProfileData) => api.put(`/staff/${id}`, d),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      Swal.fire('Saved!', 'Profile updated.', 'success');
    },
    onError: () => Swal.fire('Error', 'Update failed.', 'error'),
  });

  const addBu = useMutation({
    mutationFn: (buId: string) => api.post(`/staff/${id}/bu/${buId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff', id] });
      setSelectedBuId('');
    },
    onError: () => Swal.fire('Error', 'Failed to add BU.', 'error'),
  });

  const removeBu = useMutation({
    mutationFn: (buId: string) => api.delete(`/staff/${id}/bu/${buId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', id] }),
    onError: () => Swal.fire('Error', 'Failed to remove BU.', 'error'),
  });

  const grantChat = useMutation({
    mutationFn: (buId: string) => api.post('/chat-permissions', { staffId: id, buId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', id] }),
    onError: () => Swal.fire('Error', 'Failed to grant chat access.', 'error'),
  });

  const revokeChat = useMutation({
    mutationFn: async (buId: string) => {
      // Need to find the permission ID first
      const permsRes = await api.get(`/business-units/${buId}/chat-permissions`);
      const perm = permsRes.data.find((p: { staffId: string }) => p.staffId === id);
      if (perm) await api.delete(`/chat-permissions/${perm.id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', id] }),
    onError: () => Swal.fire('Error', 'Failed to revoke chat access.', 'error'),
  });

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/staff/${id}/reset-password`),
    onSuccess: (res) => {
      Swal.fire('Password Reset', `New password: ${res.data.newPassword}`, 'success');
    },
    onError: () => Swal.fire('Error', 'Reset failed.', 'error'),
  });

  const setPasswordMutation = useMutation({
    mutationFn: (newPassword: string) => api.put(`/staff/${id}/password`, { newPassword }),
    onSuccess: () => Swal.fire('Saved!', 'Password has been set.', 'success'),
    onError: () => Swal.fire('Error', 'Set password failed.', 'error'),
  });

  // BUs not yet assigned to this staff
  const assignedBuIds = new Set(data?.buAssignments.map((b) => b.buId) ?? []);
  const availableBus = allBus?.filter((bu) => !assignedBuIds.has(bu.id)) ?? [];

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (!data) return <p className="text-red-500">Staff member not found.</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/company/staff')} className="text-gray-500 hover:text-gray-700 text-sm">
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {data.firstName} {data.lastName}
        </h1>
        <span className="text-sm bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{data.role}</span>
      </div>

      {/* Profile Form */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Profile</h2>
        <form
          onSubmit={handleSubmit((d) => updateProfile.mutate(d))}
          className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name</label>
              <input
                {...register('firstName')}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.firstName && (
                <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name</label>
              <input
                {...register('lastName')}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.lastName && (
                <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </section>

      {/* BU Assignments */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">BU Assignments</h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Add BU row */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-100">
            <select
              value={selectedBuId}
              onChange={(e) => setSelectedBuId(e.target.value)}
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select BU to add...</option>
              {availableBus.map((bu) => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </select>
            <button
              onClick={() => { if (selectedBuId) addBu.mutate(selectedBuId); }}
              disabled={!selectedBuId || addBu.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              + Add
            </button>
          </div>

          {/* BU table */}
          {data.buAssignments.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">BU Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Chat Access</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.buAssignments.map((bu) => (
                  <tr key={bu.buId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{bu.buName}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          bu.hasChatAccess
                            ? revokeChat.mutate(bu.buId)
                            : grantChat.mutate(bu.buId)
                        }
                        disabled={grantChat.isPending || revokeChat.isPending}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          bu.hasChatAccess ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            bu.hasChatAccess ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => removeBu.mutate(bu.buId)}
                        disabled={removeBu.isPending}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-sm text-center py-6">No BU assignments yet.</p>
          )}
        </div>
      </section>

      {/* Password Section */}
      {(globalRole === 'Owner' || globalRole === 'Admin') && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Password</h2>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Reset Password</h3>
              <p className="text-xs text-gray-500 mb-3">
                Generate a new random password. The staff member will be required to change it on next login.
              </p>
              <button
                onClick={() => resetPassword.mutate()}
                disabled={resetPassword.isPending}
                className="bg-orange-500 text-white px-4 py-2 rounded-md text-sm hover:bg-orange-600 disabled:opacity-50"
              >
                {resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
            <hr />
            <SetPasswordForm
              onSubmit={(pw) => setPasswordMutation.mutate(pw)}
              isPending={setPasswordMutation.isPending}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function SetPasswordForm({ onSubmit, isPending }: { onSubmit: (pw: string) => void; isPending: boolean }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Set Password</h3>
      <p className="text-xs text-gray-500 mb-3">
        Set a specific password for this staff member.
      </p>
      <div className="space-y-3">
        <input
          type="password"
          placeholder="New password (min 8 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => {
            if (pw.length < 8) {
              Swal.fire('Error', 'Password must be at least 8 characters.', 'error');
              return;
            }
            if (pw !== confirm) {
              Swal.fire('Error', 'Passwords do not match.', 'error');
              return;
            }
            onSubmit(pw);
            setPw('');
            setConfirm('');
          }}
          disabled={isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Setting...' : 'Set Password'}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/company/staff/\[id\]/page.tsx
git commit -m "feat(web): redesign edit staff page with profile form, BU table, chat toggle"
```

---

## Task 12: Frontend — New Staff Page Redesign

**Files:**
- Modify: `apps/web/src/app/(app)/company/staff/new/page.tsx`

**Step 1: Rewrite new staff page with BU assignment table**

Replace `apps/web/src/app/(app)/company/staff/new/page.tsx`:

```typescript
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.enum(['Admin', 'Staff'], { required_error: 'Role is required' }),
});
type FormData = z.infer<typeof schema>;

interface BusinessUnit {
  id: string;
  name: string;
}

interface PendingBu {
  buId: string;
  buName: string;
  chatAccess: boolean;
}

export default function NewStaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { globalRole } = useAuthStore();
  const [pendingBus, setPendingBus] = useState<PendingBu[]>([]);
  const [selectedBuId, setSelectedBuId] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { data: allBus } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
  });

  // BUs not yet added to pending list
  const assignedBuIds = new Set(pendingBus.map((b) => b.buId));
  const availableBus = allBus?.filter((bu) => !assignedBuIds.has(bu.id)) ?? [];

  const handleAddBu = () => {
    if (!selectedBuId) return;
    const bu = allBus?.find((b) => b.id === selectedBuId);
    if (!bu) return;
    setPendingBus((prev) => [...prev, { buId: bu.id, buName: bu.name, chatAccess: false }]);
    setSelectedBuId('');
  };

  const handleRemoveBu = (buId: string) => {
    setPendingBus((prev) => prev.filter((b) => b.buId !== buId));
  };

  const handleToggleChat = (buId: string) => {
    setPendingBus((prev) =>
      prev.map((b) => (b.buId === buId ? { ...b, chatAccess: !b.chatAccess } : b))
    );
  };

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (pendingBus.length === 0) {
        throw new Error('Please add at least one BU assignment.');
      }

      // Create staff with first BU (required by current API)
      const firstBu = pendingBus[0];
      const res = await api.post('/staff', {
        ...formData,
        buId: firstBu.buId,
        email: '',
      });
      const staffId = res.data.id;

      // Add remaining BUs
      for (let i = 1; i < pendingBus.length; i++) {
        await api.post(`/staff/${staffId}/bu/${pendingBus[i].buId}`);
      }

      // Grant chat access where toggled
      for (const bu of pendingBus) {
        if (bu.chatAccess) {
          await api.post('/chat-permissions', { staffId, buId: bu.buId });
        }
      }

      return staffId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      await Swal.fire('Created!', 'Staff member has been added.', 'success');
      router.push('/company/staff');
    },
    onError: (err: Error) => {
      Swal.fire('Error', err.message || 'Failed to create staff member.', 'error');
    },
  });

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can create staff.</p>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm">
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-gray-800">New Staff Member</h1>
      </div>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="space-y-8"
      >
        {/* Profile Section */}
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name</label>
              <input
                {...register('firstName')}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.firstName && (
                <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name</label>
              <input
                {...register('lastName')}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.lastName && (
                <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select
              {...register('role')}
              className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select role...</option>
              <option value="Admin">Admin</option>
              <option value="Staff">Staff</option>
            </select>
            {errors.role && (
              <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>
            )}
          </div>
        </section>

        {/* BU Assignments Section */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">BU Assignments</h2>
            <div className="flex items-center gap-3">
              <select
                value={selectedBuId}
                onChange={(e) => setSelectedBuId(e.target.value)}
                className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select BU to add...</option>
                {availableBus.map((bu) => (
                  <option key={bu.id} value={bu.id}>{bu.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddBu}
                disabled={!selectedBuId}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                + Add
              </button>
            </div>
          </div>

          {pendingBus.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">BU Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Chat Access</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingBus.map((bu) => (
                  <tr key={bu.buId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{bu.buName}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleChat(bu.buId)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          bu.chatAccess ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            bu.chatAccess ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleRemoveBu(bu.buId)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-sm text-center py-6">
              Add at least one BU assignment.
            </p>
          )}
        </section>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Staff'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-100 text-gray-700 px-5 py-2 rounded-md text-sm hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(app\)/company/staff/new/page.tsx
git commit -m "feat(web): redesign new staff page with BU assignment table and chat toggle"
```
