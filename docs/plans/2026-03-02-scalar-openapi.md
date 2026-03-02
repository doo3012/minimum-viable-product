# Scalar / OpenAPI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** เปิดใช้งาน OpenAPI spec และ Scalar UI บน .NET 10 Minimal API ทุก environment พร้อม metadata ครบทุก endpoint

**Architecture:** Wire `AddOpenApi()` + `MapScalarApiReference()` ใน Program.cs แล้วเพิ่ม `.WithName()` / `.WithTags()` / `.Produces<T>()` chain ที่ endpoint แต่ละตัว ทั้ง 14 endpoint ใน 5 groups

**Tech Stack:** `Microsoft.AspNetCore.OpenApi` v10 (built-in), `Scalar.AspNetCore` v2 — ทั้งคู่ติดตั้งไว้แล้วใน Api.csproj

---

### Task 1: Wire OpenAPI + Scalar ใน Program.cs

**Files:**
- Modify: `apps/api/Api/Program.cs`

**Step 1: เพิ่ม `AddOpenApi()` ใน builder section**

ใน [Program.cs](../../apps/api/Api/Program.cs) เพิ่มหลัง `builder.Services.AddAuthorization();`:

```csharp
builder.Services.AddOpenApi();
```

**Step 2: เพิ่ม `MapOpenApi()` และ `MapScalarApiReference()` ใน app section**

เพิ่มหลัง `app.UseAuthorization();`:

```csharp
app.MapOpenApi();
app.MapScalarApiReference();
```

**Step 3: Build เพื่อตรวจสอบ**

```bash
cd apps/api
dotnet build Api
```

Expected: `Build succeeded. 0 Error(s)`

**Step 4: Run และเปิด Scalar UI**

```bash
dotnet run --project Api
```

เปิด `http://localhost:5000/scalar/v1` — ควรเห็น Scalar UI พร้อม endpoint list (แต่ยังไม่มี name/tag/produces)

**Step 5: Commit**

```bash
git add apps/api/Api/Program.cs
git commit -m "feat(api): wire OpenAPI and Scalar UI"
```

---

### Task 2: Metadata — Auth endpoints

**Files:**
- Modify: `apps/api/Api/Features/Auth/Login/LoginEndpoint.cs`
- Modify: `apps/api/Api/Features/Auth/ChangePassword/ChangePasswordEndpoint.cs`

**Step 1: แก้ไข LoginEndpoint.cs**

แทนที่เนื้อหาทั้งไฟล์ด้วย:

```csharp
using MediatR;
namespace Api.Features.Auth.Login;

public static class LoginEndpoint
{
    public static void MapLogin(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", async (
            LoginRequest req, IMediator mediator,
            HttpContext ctx, CancellationToken ct) =>
        {
            try {
                var result = await mediator.Send(new LoginCommand(req.Username, req.Password), ct);
                ctx.Response.Cookies.Append("auth_token", result.Token, new CookieOptions {
                    HttpOnly = true, SameSite = SameSiteMode.Strict,
                    Secure = false,
                    Expires = DateTimeOffset.UtcNow.AddHours(24)
                });
                return Results.Ok(new {
                    result.UserId, result.Role, result.MustChangePassword
                });
            }
            catch (UnauthorizedAccessException) {
                return Results.Unauthorized();
            }
        })
        .WithName("Login")
        .WithTags("Auth")
        .Produces(200)
        .Produces(401);

        app.MapPost("/api/auth/logout", (HttpContext ctx) => {
            ctx.Response.Cookies.Delete("auth_token");
            return Results.Ok();
        })
        .WithName("Logout")
        .WithTags("Auth")
        .Produces(200);
    }
}
public record LoginRequest(string Username, string Password);
```

**Step 2: แก้ไข ChangePasswordEndpoint.cs**

```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.Auth.ChangePassword;

public static class ChangePasswordEndpoint
{
    public static void MapChangePassword(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/change-password", async (
            ChangePasswordRequest req, IMediator mediator,
            ClaimsPrincipal user, CancellationToken ct) =>
        {
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user.FindFirst("sub")!.Value);
            await mediator.Send(new ChangePasswordCommand(userId, req.NewPassword), ct);
            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("ChangePassword")
        .WithTags("Auth")
        .Produces(200)
        .Produces(401);
    }
}
public record ChangePasswordRequest(string NewPassword);
```

**Step 3: Build**

```bash
dotnet build apps/api/Api
```

Expected: `Build succeeded. 0 Error(s)`

**Step 4: Commit**

```bash
git add apps/api/Api/Features/Auth/Login/LoginEndpoint.cs
git add apps/api/Api/Features/Auth/ChangePassword/ChangePasswordEndpoint.cs
git commit -m "feat(api): add OpenAPI metadata to Auth endpoints"
```

---

### Task 3: Metadata — Companies endpoint

**Files:**
- Modify: `apps/api/Api/Features/Companies/Onboard/OnboardEndpoint.cs`

**Step 1: แก้ไข OnboardEndpoint.cs**

```csharp
using MediatR;
namespace Api.Features.Companies.Onboard;

public static class OnboardEndpoint
{
    public static void MapOnboard(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/companies/onboard", async (
            OnboardRequest req,
            IMediator mediator,
            CancellationToken ct) =>
        {
            var result = await mediator.Send(
                new OnboardCommand(req.CompanyName, req.Address, req.ContactNumber), ct);
            return Results.Ok(result);
        })
        .WithName("OnboardCompany")
        .WithTags("Companies")
        .Produces<OnboardResult>(200);
    }
}

public record OnboardRequest(string CompanyName, string Address, string ContactNumber);
```

**Step 2: Build**

```bash
dotnet build apps/api/Api
```

Expected: `Build succeeded. 0 Error(s)`

**Step 3: Commit**

```bash
git add apps/api/Api/Features/Companies/Onboard/OnboardEndpoint.cs
git commit -m "feat(api): add OpenAPI metadata to Companies endpoints"
```

---

### Task 4: Metadata — BusinessUnits endpoints

**Files:**
- Modify: `apps/api/Api/Features/BusinessUnits/Create/CreateBuEndpoint.cs`
- Modify: `apps/api/Api/Features/BusinessUnits/List/ListBuEndpoint.cs`

**Step 1: แก้ไข CreateBuEndpoint.cs**

```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.BusinessUnits.Create;

public static class CreateBuEndpoint
{
    public static void MapCreateBu(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/business-units", async (
            CreateBuRequest req, IMediator mediator,
            ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new CreateBuCommand(req.Name) { CompanyId = companyId };
            var id = await mediator.Send(cmd, ct);
            return Results.Created($"/api/business-units/{id}", new { id });
        })
        .RequireAuthorization()
        .WithName("CreateBusinessUnit")
        .WithTags("BusinessUnits")
        .Produces(201)
        .Produces(401);
    }
}
public record CreateBuRequest(string Name);
```

**Step 2: แก้ไข ListBuEndpoint.cs**

```csharp
using MediatR;
using System.Security.Claims;
using Api.Features.BusinessUnits.List;
namespace Api.Features.BusinessUnits.List;

public static class ListBuEndpoint
{
    public static void MapListBu(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/business-units", async (
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var result = await mediator.Send(new ListBuQuery(), ct);
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("ListBusinessUnits")
        .WithTags("BusinessUnits")
        .Produces<IEnumerable<BusinessUnitDto>>(200)
        .Produces(401);
    }
}
```

**Step 3: Build**

```bash
dotnet build apps/api/Api
```

Expected: `Build succeeded. 0 Error(s)`

**Step 4: Commit**

```bash
git add apps/api/Api/Features/BusinessUnits/Create/CreateBuEndpoint.cs
git add apps/api/Api/Features/BusinessUnits/List/ListBuEndpoint.cs
git commit -m "feat(api): add OpenAPI metadata to BusinessUnits endpoints"
```

---

### Task 5: Metadata — Staff endpoints

**Files:**
- Modify: `apps/api/Api/Features/Staff/Create/CreateStaffEndpoint.cs`
- Modify: `apps/api/Api/Features/Staff/List/ListStaffEndpoint.cs`
- Modify: `apps/api/Api/Features/Staff/GetById/GetStaffEndpoint.cs`
- Modify: `apps/api/Api/Features/Staff/UpdateBuScoped/UpdateBuScopedEndpoint.cs`

**Step 1: แก้ไข CreateStaffEndpoint.cs**

```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.Create;

public static class CreateStaffEndpoint
{
    public static void MapCreateStaff(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/staff", async (
            CreateStaffRequest req, IMediator mediator,
            ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new CreateStaffCommand(
                req.FirstName, req.LastName, req.Role, req.BuId, req.Email)
            { CompanyId = companyId };
            var id = await mediator.Send(cmd, ct);
            return Results.Created($"/api/staff/{id}", new { id });
        })
        .RequireAuthorization()
        .WithName("CreateStaff")
        .WithTags("Staff")
        .Produces(201)
        .Produces(401);
    }
}
public record CreateStaffRequest(
    string FirstName, string LastName, string Role, Guid BuId, string Email);
```

**Step 2: แก้ไข ListStaffEndpoint.cs**

```csharp
using MediatR;
using Api.Features.Staff.List;
namespace Api.Features.Staff.List;

public static class ListStaffEndpoint
{
    public static void MapListStaff(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/staff", async (IMediator mediator, CancellationToken ct) =>
            Results.Ok(await mediator.Send(new ListStaffQuery(), ct))
        )
        .RequireAuthorization()
        .WithName("ListStaff")
        .WithTags("Staff")
        .Produces<IEnumerable<StaffDto>>(200)
        .Produces(401);
    }
}
```

**Step 3: แก้ไข GetStaffEndpoint.cs**

```csharp
using MediatR;
using Api.Features.Staff.List;
namespace Api.Features.Staff.GetById;

public static class GetStaffEndpoint
{
    public static void MapGetStaff(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/staff/{id:guid}", async (Guid id, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetStaffQuery(id), ct);
            return result is null ? Results.NotFound() : Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("GetStaff")
        .WithTags("Staff")
        .Produces<StaffDto>(200)
        .Produces(404)
        .Produces(401);
    }
}
```

**Step 4: แก้ไข UpdateBuScopedEndpoint.cs**

```csharp
using MediatR;
namespace Api.Features.Staff.UpdateBuScoped;

public static class UpdateBuScopedEndpoint
{
    public static void MapUpdateBuScoped(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/staff/{staffId:guid}/bu/{buId:guid}", async (
            Guid staffId, Guid buId,
            UpdateBuScopedRequest req, IMediator mediator, CancellationToken ct) =>
        {
            await mediator.Send(new UpdateBuScopedCommand(staffId, buId, req.Email), ct);
            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("UpdateStaffBuScoped")
        .WithTags("Staff")
        .Produces(200)
        .Produces(401);
    }
}
public record UpdateBuScopedRequest(string Email);
```

**Step 5: Build**

```bash
dotnet build apps/api/Api
```

Expected: `Build succeeded. 0 Error(s)`

**Step 6: Commit**

```bash
git add apps/api/Api/Features/Staff/Create/CreateStaffEndpoint.cs
git add apps/api/Api/Features/Staff/List/ListStaffEndpoint.cs
git add apps/api/Api/Features/Staff/GetById/GetStaffEndpoint.cs
git add apps/api/Api/Features/Staff/UpdateBuScoped/UpdateBuScopedEndpoint.cs
git commit -m "feat(api): add OpenAPI metadata to Staff endpoints"
```

---

### Task 6: Metadata — ChatPermissions endpoints

**Files:**
- Modify: `apps/api/Api/Features/ChatPermissions/Grant/GrantPermissionEndpoint.cs`
- Modify: `apps/api/Api/Features/ChatPermissions/Revoke/RevokePermissionEndpoint.cs`
- Modify: `apps/api/Api/Features/ChatPermissions/ListByBu/ListByBuEndpoint.cs`

**Step 1: แก้ไข GrantPermissionEndpoint.cs**

```csharp
using MediatR;
namespace Api.Features.ChatPermissions.Grant;

public static class GrantPermissionEndpoint
{
    public static void MapGrantPermission(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/chat-permissions", async (
            GrantPermissionRequest req, IMediator mediator, CancellationToken ct) =>
        {
            try {
                var id = await mediator.Send(new GrantPermissionCommand(req.StaffId, req.BuId), ct);
                return Results.Created($"/api/chat-permissions/{id}", new { id });
            }
            catch (InvalidOperationException ex) {
                return Results.Conflict(new { error = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("GrantChatPermission")
        .WithTags("ChatPermissions")
        .Produces(201)
        .Produces(409)
        .Produces(401);
    }
}
public record GrantPermissionRequest(Guid StaffId, Guid BuId);
```

**Step 2: แก้ไข RevokePermissionEndpoint.cs**

```csharp
using MediatR;
namespace Api.Features.ChatPermissions.Revoke;

public static class RevokePermissionEndpoint
{
    public static void MapRevokePermission(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/chat-permissions/{id:guid}", async (
            Guid id, IMediator mediator, CancellationToken ct) =>
        {
            try {
                await mediator.Send(new RevokePermissionCommand(id), ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        })
        .RequireAuthorization()
        .WithName("RevokeChatPermission")
        .WithTags("ChatPermissions")
        .Produces(200)
        .Produces(404)
        .Produces(401);
    }
}
```

**Step 3: แก้ไข ListByBuEndpoint.cs**

```csharp
using MediatR;
using Api.Features.ChatPermissions.ListByBu;
namespace Api.Features.ChatPermissions.ListByBu;

public static class ListByBuEndpoint
{
    public static void MapListPermissionsByBu(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/business-units/{buId:guid}/chat-permissions", async (
            Guid buId, IMediator mediator, CancellationToken ct) =>
            Results.Ok(await mediator.Send(new ListByBuQuery(buId), ct))
        )
        .RequireAuthorization()
        .WithName("ListChatPermissionsByBu")
        .WithTags("ChatPermissions")
        .Produces<IEnumerable<ChatPermissionDto>>(200)
        .Produces(401);
    }
}
```

**Step 4: Build**

```bash
dotnet build apps/api/Api
```

Expected: `Build succeeded. 0 Error(s)`

**Step 5: Commit**

```bash
git add apps/api/Api/Features/ChatPermissions/Grant/GrantPermissionEndpoint.cs
git add apps/api/Api/Features/ChatPermissions/Revoke/RevokePermissionEndpoint.cs
git add apps/api/Api/Features/ChatPermissions/ListByBu/ListByBuEndpoint.cs
git commit -m "feat(api): add OpenAPI metadata to ChatPermissions endpoints"
```

---

### Task 7: Verify Scalar UI แสดงผลครบถ้วน

**Step 1: Run api**

```bash
cd apps/api
dotnet run --project Api
```

**Step 2: ตรวจสอบ Scalar UI**

เปิด `http://localhost:5000/scalar/v1`

คาดว่าจะเห็น:
- 5 groups: Auth, Companies, BusinessUnits, Staff, ChatPermissions
- 14 endpoints พร้อม name และ response codes
- Schema ของ request/response body

**Step 3: ตรวจสอบ OpenAPI JSON**

เปิด `http://localhost:5000/openapi/v1.json` — ควรได้ JSON spec ครบถ้วน
