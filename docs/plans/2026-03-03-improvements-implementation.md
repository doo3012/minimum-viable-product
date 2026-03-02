# MVP Platform Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix authorization gaps, missing data, chat sync, profile/password management, and bugs found in audit. Then write System Design Document in Thai.

**Architecture:** Add MediatR AuthorizeBehavior for RBAC, fix StaffDto to include Role/BuCount, add HTTP client from .NET→Go for chat sync, add new API endpoints for password management, fix tenant filters and docker config. All changes follow existing vertical-slice pattern.

**Tech Stack:** .NET 10 Minimal APIs, MediatR, EF Core, Go/Echo, Next.js 16, React Query, Zustand, PostgreSQL, NATS JetStream, Docker Compose

---

### Task 1: Fix Docker Compose port bug + API postgres port

**Files:**
- Modify: `docker-compose.yml:36,55`

**Context:** The `api` and `chat` services use port `5431` in their DATABASE_URL, but container-to-container networking uses the internal port `5432`. Port `5431` is only the host-mapped port.

**Step 1: Fix the port values**

In `docker-compose.yml`, change these two lines:

```yaml
# api service (line 36) - change Port=5431 to Port=5432
ConnectionStrings__Postgres: "Host=postgres;Port=5432;Database=mvp;Username=postgres;Password=postgres"

# chat service (line 55) - change port 5431 to 5432
DATABASE_URL: "postgres://postgres:postgres@postgres:5432/mvp"
```

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "fix: correct postgres port for container-to-container networking"
```

---

### Task 2: Add AuthorizeRole attribute and AuthorizeBehavior

**Files:**
- Create: `apps/api/Api/Common/Interfaces/IAuthorizeRole.cs`
- Create: `apps/api/Api/Common/Behaviors/AuthorizeBehavior.cs`
- Create: `apps/api/Api/Common/Exceptions/ForbiddenException.cs`
- Modify: `apps/api/Api/Program.cs:37` (register behavior)

**Context:** Currently all endpoints only check `RequireAuthorization()` (is user authenticated). We need a MediatR pipeline that checks the user's `role` JWT claim against a required role list declared on each command/query.

**Step 1: Create the marker interface**

File: `apps/api/Api/Common/Interfaces/IAuthorizeRole.cs`
```csharp
namespace Api.Common.Interfaces;

public interface IAuthorizeRole
{
    string[] AllowedRoles { get; }
}
```

**Step 2: Create the ForbiddenException**

File: `apps/api/Api/Common/Exceptions/ForbiddenException.cs`
```csharp
namespace Api.Common.Exceptions;

public class ForbiddenException(string message = "Forbidden") : Exception(message);
```

**Step 3: Create AuthorizeBehavior**

File: `apps/api/Api/Common/Behaviors/AuthorizeBehavior.cs`
```csharp
using Api.Common.Exceptions;
using Api.Common.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Http;

namespace Api.Common.Behaviors;

public class AuthorizeBehavior<TRequest, TResponse>(
    IHttpContextAccessor httpContextAccessor)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IAuthorizeRole
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var role = httpContextAccessor.HttpContext?.User
            .FindFirst("role")?.Value;

        if (role == null || !request.AllowedRoles.Contains(role))
            throw new ForbiddenException();

        return await next();
    }
}
```

**Step 4: Register behavior in Program.cs**

In `apps/api/Api/Program.cs`, after the existing `cfg.AddOpenBehavior(typeof(TenantBehavior<,>));` line, add:

```csharp
cfg.AddOpenBehavior(typeof(AuthorizeBehavior<,>));
```

Also add the using:
```csharp
using Api.Common.Exceptions;
```

And add a global exception handler middleware before `app.Run();`:
```csharp
app.Use(async (context, next) =>
{
    try { await next(); }
    catch (ForbiddenException)
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsJsonAsync(new { error = "Forbidden" });
    }
    catch (KeyNotFoundException ex)
    {
        context.Response.StatusCode = 404;
        await context.Response.WriteAsJsonAsync(new { error = ex.Message });
    }
});
```

Note: Place this middleware **after** `app.UseAuthorization();` and **before** the endpoint mappings.

**Step 5: Commit**

```bash
git add apps/api/Api/Common/Interfaces/IAuthorizeRole.cs \
        apps/api/Api/Common/Behaviors/AuthorizeBehavior.cs \
        apps/api/Api/Common/Exceptions/ForbiddenException.cs \
        apps/api/Api/Program.cs
git commit -m "feat: add role-based authorization MediatR behavior"
```

---

### Task 3: Apply RBAC to existing commands/queries

**Files:**
- Modify: `apps/api/Api/Features/BusinessUnits/Create/CreateBuCommand.cs`
- Modify: `apps/api/Api/Features/Staff/Create/CreateStaffCommand.cs`
- Modify: `apps/api/Api/Features/ChatPermissions/Grant/GrantPermissionCommand.cs`
- Modify: `apps/api/Api/Features/ChatPermissions/Revoke/RevokePermissionCommand.cs`

**Context:** Per the permission matrix, these actions require specific roles:
- Create BU → Owner, Admin
- Create Staff → Owner, Admin
- Grant Chat Permission → Owner only
- Revoke Chat Permission → Owner only

**Step 1: Add IAuthorizeRole to CreateBuCommand**

File: `apps/api/Api/Features/BusinessUnits/Create/CreateBuCommand.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.BusinessUnits.Create;
public record CreateBuCommand(string Name) : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner", "Admin"];
}
```

**Step 2: Add IAuthorizeRole to CreateStaffCommand**

File: `apps/api/Api/Features/Staff/Create/CreateStaffCommand.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Create;

public record CreateStaffCommand(
    string FirstName, string LastName,
    string Role, Guid BuId, string Email)
    : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner", "Admin"];
}
```

**Step 3: Add IAuthorizeRole to GrantPermissionCommand**

File: `apps/api/Api/Features/ChatPermissions/Grant/GrantPermissionCommand.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.ChatPermissions.Grant;

public record GrantPermissionCommand(Guid StaffId, Guid BuId)
    : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public string[] AllowedRoles => ["Owner"];
}
```

**Step 4: Add IAuthorizeRole to RevokePermissionCommand**

File: `apps/api/Api/Features/ChatPermissions/Revoke/RevokePermissionCommand.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.ChatPermissions.Revoke;

public record RevokePermissionCommand(Guid PermissionId)
    : IRequest<Unit>, ITenantScoped, IAuthorizeRole
{
    public string[] AllowedRoles => ["Owner"];
}
```

**Step 5: Commit**

```bash
git add apps/api/Api/Features/BusinessUnits/Create/CreateBuCommand.cs \
        apps/api/Api/Features/Staff/Create/CreateStaffCommand.cs \
        apps/api/Api/Features/ChatPermissions/Grant/GrantPermissionCommand.cs \
        apps/api/Api/Features/ChatPermissions/Revoke/RevokePermissionCommand.cs
git commit -m "feat: apply RBAC roles to BU, Staff, and ChatPermission commands"
```

---

### Task 4: Add validation to CreateStaff (role enum + username uniqueness)

**Files:**
- Create: `apps/api/Api/Features/Staff/Create/CreateStaffValidator.cs`
- Modify: `apps/api/Api/Features/Staff/Create/CreateStaffHandler.cs`

**Context:** Currently `Role` is a free-form string and username has no uniqueness check.

**Step 1: Create FluentValidation validator**

File: `apps/api/Api/Features/Staff/Create/CreateStaffValidator.cs`
```csharp
using FluentValidation;
namespace Api.Features.Staff.Create;

public class CreateStaffValidator : AbstractValidator<CreateStaffCommand>
{
    public CreateStaffValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role)
            .Must(r => r is "Admin" or "Staff")
            .WithMessage("Role must be 'Admin' or 'Staff'");
        RuleFor(x => x.BuId).NotEmpty();
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}
```

**Step 2: Add username uniqueness check in CreateStaffHandler**

In `apps/api/Api/Features/Staff/Create/CreateStaffHandler.cs`, after generating the `slug` variable and before creating the User entity, add:

```csharp
var username = $"{slug}@staff";
var usernameExists = await db.Users.AnyAsync(u => u.Username == username, ct);
if (usernameExists)
    throw new InvalidOperationException($"Username '{username}' already exists");
```

And change `Username = $"{slug}@staff"` to `Username = username`.

Add `using Microsoft.EntityFrameworkCore;` at the top.

**Step 3: Update CreateStaffEndpoint to catch InvalidOperationException**

In `apps/api/Api/Features/Staff/Create/CreateStaffEndpoint.cs`, wrap the handler call:

```csharp
app.MapPost("/api/staff", async (
    CreateStaffRequest req, IMediator mediator,
    ClaimsPrincipal user, CancellationToken ct) =>
{
    var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
    var cmd = new CreateStaffCommand(
        req.FirstName, req.LastName, req.Role, req.BuId, req.Email)
    { CompanyId = companyId };
    try
    {
        var id = await mediator.Send(cmd, ct);
        return Results.Created($"/api/staff/{id}", new { id });
    }
    catch (InvalidOperationException ex)
    {
        return Results.Conflict(new { error = ex.Message });
    }
}).RequireAuthorization()
.WithName("CreateStaff")
.WithTags("Staff")
.Produces(201)
.Produces(409)
.Produces(401)
.Produces(403);
```

**Step 4: Commit**

```bash
git add apps/api/Api/Features/Staff/Create/
git commit -m "feat: add validation for staff creation (role enum + username uniqueness)"
```

---

### Task 5: Fix StaffDto — add Role and BuCount

**Files:**
- Modify: `apps/api/Api/Features/Staff/List/ListStaffQuery.cs`
- Modify: `apps/api/Api/Features/Staff/List/ListStaffHandler.cs`
- Modify: `apps/api/Api/Features/Staff/GetById/GetStaffHandler.cs`
- Modify: `apps/api/Api/Infrastructure/Persistence/Entities/StaffProfile.cs`
- Modify: `apps/api/Api/Infrastructure/Persistence/AppDbContext.cs`

**Context:** Frontend expects `role` and `buCount` in the staff list, and `role` in staff detail. Currently `StaffDto` only has `UserId` — no Role. We need to add a User navigation property to StaffProfile, then include User in queries.

**Step 1: Add User navigation property to StaffProfile**

File: `apps/api/Api/Infrastructure/Persistence/Entities/StaffProfile.cs`
```csharp
namespace Api.Infrastructure.Persistence.Entities;

public class StaffProfile
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public User? User { get; set; }
    public ICollection<StaffBu> StaffBus { get; set; } = [];
}
```

**Step 2: Update AppDbContext FK config**

In `apps/api/Api/Infrastructure/Persistence/AppDbContext.cs`, change the StaffProfile config:

```csharp
modelBuilder.Entity<StaffProfile>(e => {
    e.ToTable("staff_profiles");
    e.HasQueryFilter(s => !_currentTenantId.HasValue || s.CompanyId == _currentTenantId);
    e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId);
    e.HasMany(s => s.StaffBus).WithOne().HasForeignKey(sb => sb.StaffId);
});
```

Note: Changed from `e.HasOne<User>()` to `e.HasOne(s => s.User)` to use the new navigation property.

**Step 3: Update StaffDto to include Role and BuCount**

File: `apps/api/Api/Features/Staff/List/ListStaffQuery.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.List;

public record ListStaffQuery : IRequest<IEnumerable<StaffDto>>, ITenantScoped;

public record StaffBuDto(Guid BuId, string BuName, string Email);
public record StaffDto(
    Guid Id, string FirstName, string LastName, Guid? UserId,
    string Role, int BuCount,
    IEnumerable<StaffBuDto> BuAssignments);
```

**Step 4: Update ListStaffHandler**

File: `apps/api/Api/Features/Staff/List/ListStaffHandler.cs`
```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.List;

public class ListStaffHandler(AppDbContext db)
    : IRequestHandler<ListStaffQuery, IEnumerable<StaffDto>>
{
    public async Task<IEnumerable<StaffDto>> Handle(ListStaffQuery query, CancellationToken ct)
    {
        return await db.StaffProfiles
            .Include(s => s.User)
            .Include(s => s.StaffBus).ThenInclude(sb => sb.Bu)
            .Select(s => new StaffDto(
                s.Id, s.FirstName, s.LastName, s.UserId,
                s.User != null ? s.User.Role : "",
                s.StaffBus.Count,
                s.StaffBus.Select(b => new StaffBuDto(b.BuId, b.Bu.Name, b.Email))))
            .ToListAsync(ct);
    }
}
```

**Step 5: Update GetStaffHandler**

File: `apps/api/Api/Features/Staff/GetById/GetStaffHandler.cs`
```csharp
using Api.Features.Staff.List;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.GetById;

public class GetStaffHandler(AppDbContext db)
    : IRequestHandler<GetStaffQuery, StaffDto?>
{
    public async Task<StaffDto?> Handle(GetStaffQuery query, CancellationToken ct)
    {
        var s = await db.StaffProfiles
            .Include(s => s.User)
            .Include(s => s.StaffBus).ThenInclude(sb => sb.Bu)
            .FirstOrDefaultAsync(s => s.Id == query.StaffId, ct);
        if (s is null) return null;
        return new StaffDto(s.Id, s.FirstName, s.LastName, s.UserId,
            s.User?.Role ?? "",
            s.StaffBus.Count,
            s.StaffBus.Select(b => new StaffBuDto(b.BuId, b.Bu.Name, b.Email)));
    }
}
```

**Step 6: Commit**

```bash
git add apps/api/Api/Features/Staff/ \
        apps/api/Api/Infrastructure/Persistence/Entities/StaffProfile.cs \
        apps/api/Api/Infrastructure/Persistence/AppDbContext.cs
git commit -m "feat: add Role and BuCount to StaffDto"
```

---

### Task 6: Go Chat Service — add GetByBuID endpoint

**Files:**
- Modify: `apps/chat/internal/usecase/workspace_usecase.go`
- Modify: `apps/chat/internal/delivery/http/workspace_handler.go`
- Modify: `apps/chat/internal/delivery/http/router.go`

**Context:** The .NET API needs to look up a workspace by BU ID to sync chat permissions. The repo method `GetByBuID` already exists but isn't exposed via HTTP.

**Step 1: Add GetByBuID to use case interface and implementation**

In `apps/chat/internal/usecase/workspace_usecase.go`, add to the interface:

```go
type WorkspaceUseCase interface {
    Provision(ctx context.Context, buID uuid.UUID, name string, ownerID uuid.UUID) error
    AddMember(ctx context.Context, workspaceID, userID uuid.UUID) error
    RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error
    ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error)
    GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error)
    GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error)
}
```

Add the implementation:

```go
func (uc *workspaceUseCase) GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error) {
    return uc.wsRepo.GetByBuID(ctx, buID)
}
```

**Step 2: Add handler method**

In `apps/chat/internal/delivery/http/workspace_handler.go`, add:

```go
func (h *WorkspaceHandler) GetWorkspaceByBuID(c echo.Context) error {
    buID, err := uuid.Parse(c.Param("buId"))
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid bu_id")
    }
    ws, err := h.uc.GetByBuID(c.Request().Context(), buID)
    if err != nil {
        return echo.NewHTTPError(http.StatusNotFound, "workspace not found")
    }
    return c.JSON(http.StatusOK, ws)
}
```

**Step 3: Add route**

In `apps/chat/internal/delivery/http/router.go`:

```go
func RegisterRoutes(e *echo.Echo, wh *WorkspaceHandler) {
    api := e.Group("/api")
    ws := api.Group("/workspaces")
    ws.GET("/by-bu/:buId", wh.GetWorkspaceByBuID)
    ws.GET("/:id", wh.GetWorkspace)
    ws.GET("/:id/members", wh.ListMembers)
    ws.POST("/:id/members", wh.AddMember)
    ws.DELETE("/:id/members/:uid", wh.RemoveMember)
}
```

Note: The `by-bu` route must come BEFORE `/:id` to avoid `by-bu` being parsed as an ID.

**Step 4: Commit**

```bash
git add apps/chat/internal/
git commit -m "feat(chat): add GET /api/workspaces/by-bu/:buId endpoint"
```

---

### Task 7: .NET API — ChatServiceClient for syncing permissions

**Files:**
- Create: `apps/api/Api/Infrastructure/Chat/IChatServiceClient.cs`
- Create: `apps/api/Api/Infrastructure/Chat/ChatServiceClient.cs`
- Modify: `apps/api/Api/Program.cs` (register HttpClient)
- Modify: `apps/api/Api/Features/ChatPermissions/Grant/GrantPermissionHandler.cs`
- Modify: `apps/api/Api/Features/ChatPermissions/Revoke/RevokePermissionHandler.cs`

**Context:** Granting/revoking `chat_permissions` in the .NET API must sync with the Go Chat Service by calling its HTTP endpoints. We need to: lookup workspace by BU ID, then add/remove member.

**Step 1: Create IChatServiceClient**

File: `apps/api/Api/Infrastructure/Chat/IChatServiceClient.cs`
```csharp
namespace Api.Infrastructure.Chat;

public interface IChatServiceClient
{
    Task<Guid?> GetWorkspaceIdByBuIdAsync(Guid buId, CancellationToken ct = default);
    Task AddMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default);
    Task RemoveMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default);
}
```

**Step 2: Create ChatServiceClient**

File: `apps/api/Api/Infrastructure/Chat/ChatServiceClient.cs`
```csharp
using System.Net.Http.Json;
using System.Text.Json;

namespace Api.Infrastructure.Chat;

public class ChatServiceClient(HttpClient http) : IChatServiceClient
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
    };

    public async Task<Guid?> GetWorkspaceIdByBuIdAsync(Guid buId, CancellationToken ct = default)
    {
        var resp = await http.GetAsync($"/api/workspaces/by-bu/{buId}", ct);
        if (!resp.IsSuccessStatusCode) return null;
        var doc = await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
        return doc.GetProperty("ID").GetGuid();
    }

    public async Task AddMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default)
    {
        await http.PostAsJsonAsync(
            $"/api/workspaces/{workspaceId}/members",
            new { user_id = userId }, ct);
    }

    public async Task RemoveMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default)
    {
        await http.DeleteAsync(
            $"/api/workspaces/{workspaceId}/members/{userId}", ct);
    }
}
```

Note: The Go Echo JSON returns PascalCase field names from the struct (Go's default JSON serialization uses the struct field names). Check actual response shape and adjust property name if needed.

**Step 3: Register in Program.cs**

In `apps/api/Api/Program.cs`, add:

```csharp
using Api.Infrastructure.Chat;
```

After the `builder.Services.AddSingleton<INatsPublisher, NatsPublisher>();` line, add:

```csharp
builder.Services.AddHttpClient<IChatServiceClient, ChatServiceClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Chat:BaseUrl"] ?? "http://chat:8080");
});
```

**Step 4: Update GrantPermissionHandler to sync**

File: `apps/api/Api/Features/ChatPermissions/Grant/GrantPermissionHandler.cs`
```csharp
using Api.Infrastructure.Chat;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.ChatPermissions.Grant;

public class GrantPermissionHandler(AppDbContext db, IChatServiceClient chatClient)
    : IRequestHandler<GrantPermissionCommand, Guid>
{
    public async Task<Guid> Handle(GrantPermissionCommand cmd, CancellationToken ct)
    {
        var exists = await db.ChatPermissions
            .AnyAsync(p => p.StaffId == cmd.StaffId && p.BuId == cmd.BuId, ct);
        if (exists)
            throw new InvalidOperationException("Permission already granted");

        var permission = new ChatPermission {
            Id = Guid.NewGuid(),
            StaffId = cmd.StaffId,
            BuId = cmd.BuId,
            GrantedAt = DateTime.UtcNow
        };
        db.ChatPermissions.Add(permission);
        await db.SaveChangesAsync(ct);

        // Sync with Chat Service
        var staff = await db.StaffProfiles.FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct);
        if (staff?.UserId != null)
        {
            var wsId = await chatClient.GetWorkspaceIdByBuIdAsync(cmd.BuId, ct);
            if (wsId.HasValue)
                await chatClient.AddMemberAsync(wsId.Value, staff.UserId.Value, ct);
        }

        return permission.Id;
    }
}
```

**Step 5: Update RevokePermissionHandler to sync**

File: `apps/api/Api/Features/ChatPermissions/Revoke/RevokePermissionHandler.cs`
```csharp
using Api.Infrastructure.Chat;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.ChatPermissions.Revoke;

public class RevokePermissionHandler(AppDbContext db, IChatServiceClient chatClient)
    : IRequestHandler<RevokePermissionCommand, Unit>
{
    public async Task<Unit> Handle(RevokePermissionCommand cmd, CancellationToken ct)
    {
        var permission = await db.ChatPermissions
            .FirstOrDefaultAsync(p => p.Id == cmd.PermissionId, ct)
            ?? throw new KeyNotFoundException("Permission not found");

        // Sync with Chat Service before removing
        var staff = await db.StaffProfiles.FirstOrDefaultAsync(s => s.Id == permission.StaffId, ct);
        if (staff?.UserId != null)
        {
            var wsId = await chatClient.GetWorkspaceIdByBuIdAsync(permission.BuId, ct);
            if (wsId.HasValue)
                await chatClient.RemoveMemberAsync(wsId.Value, staff.UserId.Value, ct);
        }

        db.ChatPermissions.Remove(permission);
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
```

**Step 6: Commit**

```bash
git add apps/api/Api/Infrastructure/Chat/ \
        apps/api/Api/Features/ChatPermissions/ \
        apps/api/Api/Program.cs
git commit -m "feat: sync chat permissions with Go Chat Service via HTTP"
```

---

### Task 8: Fix BU creation — pass real owner_user_id

**Files:**
- Modify: `apps/api/Api/Features/BusinessUnits/Create/CreateBuCommand.cs`
- Modify: `apps/api/Api/Features/BusinessUnits/Create/CreateBuEndpoint.cs`
- Modify: `apps/api/Api/Features/BusinessUnits/Create/CreateBuHandler.cs`

**Context:** `CreateBuHandler` publishes NATS event with `owner_user_id = Guid.Empty`. The Go Chat Service creates a workspace member with that empty UUID. We need to pass the real user ID.

**Step 1: Add UserId to CreateBuCommand**

File: `apps/api/Api/Features/BusinessUnits/Create/CreateBuCommand.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.BusinessUnits.Create;
public record CreateBuCommand(string Name) : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public Guid UserId { get; set; }
    public string[] AllowedRoles => ["Owner", "Admin"];
}
```

**Step 2: Set UserId in endpoint**

File: `apps/api/Api/Features/BusinessUnits/Create/CreateBuEndpoint.cs`
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
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user.FindFirst("sub")!.Value);
            var cmd = new CreateBuCommand(req.Name)
            {
                CompanyId = companyId,
                UserId = userId
            };
            var id = await mediator.Send(cmd, ct);
            return Results.Created($"/api/business-units/{id}", new { id });
        })
        .RequireAuthorization()
        .WithName("CreateBusinessUnit")
        .WithTags("BusinessUnits")
        .Produces(201)
        .Produces(401)
        .Produces(403);
    }
}
public record CreateBuRequest(string Name);
```

**Step 3: Use UserId in handler**

In `apps/api/Api/Features/BusinessUnits/Create/CreateBuHandler.cs`, change the NATS publish:

```csharp
await nats.PublishAsync("bu.created", new {
    bu_id = bu.Id, bu_name = bu.Name,
    owner_user_id = cmd.UserId,
    company_id = bu.CompanyId
}, ct);
```

**Step 4: Commit**

```bash
git add apps/api/Api/Features/BusinessUnits/Create/
git commit -m "fix: pass real owner_user_id in BU creation NATS event"
```

---

### Task 9: Add password management API endpoints

**Files:**
- Create: `apps/api/Api/Features/Staff/ResetPassword/ResetPasswordCommand.cs`
- Create: `apps/api/Api/Features/Staff/ResetPassword/ResetPasswordHandler.cs`
- Create: `apps/api/Api/Features/Staff/ResetPassword/ResetPasswordEndpoint.cs`
- Create: `apps/api/Api/Features/Staff/SetPassword/SetPasswordCommand.cs`
- Create: `apps/api/Api/Features/Staff/SetPassword/SetPasswordHandler.cs`
- Create: `apps/api/Api/Features/Staff/SetPassword/SetPasswordEndpoint.cs`
- Modify: `apps/api/Api/Program.cs` (map new endpoints)

**Context:** Owner/Admin can: (1) reset staff password to auto-generated value, (2) set a specific password for staff. Both set `mustChangePassword = true`.

**Step 1: ResetPassword command**

File: `apps/api/Api/Features/Staff/ResetPassword/ResetPasswordCommand.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.ResetPassword;

public record ResetPasswordCommand(Guid StaffId)
    : IRequest<string>, ITenantScoped, IAuthorizeRole
{
    public string[] AllowedRoles => ["Owner", "Admin"];
}
```

**Step 2: ResetPassword handler**

File: `apps/api/Api/Features/Staff/ResetPassword/ResetPasswordHandler.cs`
```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.ResetPassword;

public class ResetPasswordHandler(AppDbContext db)
    : IRequestHandler<ResetPasswordCommand, string>
{
    public async Task<string> Handle(ResetPasswordCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        if (staff.User is null)
            throw new InvalidOperationException("Staff has no user account");

        var newPassword = $"Reset@{staff.FirstName}{Random.Shared.Next(100, 999)}";
        staff.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        staff.User.MustChangePassword = true;
        await db.SaveChangesAsync(ct);

        return newPassword;
    }
}
```

**Step 3: ResetPassword endpoint**

File: `apps/api/Api/Features/Staff/ResetPassword/ResetPasswordEndpoint.cs`
```csharp
using MediatR;
namespace Api.Features.Staff.ResetPassword;

public static class ResetPasswordEndpoint
{
    public static void MapResetPassword(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/staff/{id:guid}/reset-password", async (
            Guid id, IMediator mediator, CancellationToken ct) =>
        {
            try
            {
                var newPassword = await mediator.Send(new ResetPasswordCommand(id), ct);
                return Results.Ok(new { newPassword });
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("ResetStaffPassword")
        .WithTags("Staff")
        .Produces(200)
        .Produces(404)
        .Produces(401)
        .Produces(403);
    }
}
```

**Step 4: SetPassword command**

File: `apps/api/Api/Features/Staff/SetPassword/SetPasswordCommand.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.SetPassword;

public record SetPasswordCommand(Guid StaffId, string NewPassword)
    : IRequest<Unit>, ITenantScoped, IAuthorizeRole
{
    public string[] AllowedRoles => ["Owner", "Admin"];
}
```

**Step 5: SetPassword handler**

File: `apps/api/Api/Features/Staff/SetPassword/SetPasswordHandler.cs`
```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.SetPassword;

public class SetPasswordHandler(AppDbContext db)
    : IRequestHandler<SetPasswordCommand, Unit>
{
    public async Task<Unit> Handle(SetPasswordCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        if (staff.User is null)
            throw new InvalidOperationException("Staff has no user account");

        staff.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(cmd.NewPassword);
        staff.User.MustChangePassword = true;
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
```

**Step 6: SetPassword endpoint**

File: `apps/api/Api/Features/Staff/SetPassword/SetPasswordEndpoint.cs`
```csharp
using MediatR;
namespace Api.Features.Staff.SetPassword;

public static class SetPasswordEndpoint
{
    public static void MapSetPassword(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/staff/{id:guid}/password", async (
            Guid id, SetPasswordRequest req,
            IMediator mediator, CancellationToken ct) =>
        {
            try
            {
                await mediator.Send(new SetPasswordCommand(id, req.NewPassword), ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("SetStaffPassword")
        .WithTags("Staff")
        .Produces(200)
        .Produces(404)
        .Produces(401)
        .Produces(403);
    }
}
public record SetPasswordRequest(string NewPassword);
```

**Step 7: Register endpoints in Program.cs**

In `apps/api/Api/Program.cs`, add usings:

```csharp
using Api.Features.Staff.ResetPassword;
using Api.Features.Staff.SetPassword;
```

After `app.MapUpdateBuScoped();`, add:

```csharp
app.MapResetPassword();
app.MapSetPassword();
```

**Step 8: Commit**

```bash
git add apps/api/Api/Features/Staff/ResetPassword/ \
        apps/api/Api/Features/Staff/SetPassword/ \
        apps/api/Api/Program.cs
git commit -m "feat: add reset-password and set-password endpoints for staff"
```

---

### Task 10: Add GET /api/staff/me endpoint

**Files:**
- Create: `apps/api/Api/Features/Staff/Me/GetMyProfileQuery.cs`
- Create: `apps/api/Api/Features/Staff/Me/GetMyProfileHandler.cs`
- Create: `apps/api/Api/Features/Staff/Me/GetMyProfileEndpoint.cs`
- Modify: `apps/api/Api/Program.cs`

**Context:** Users need a way to find their own staff profile ID. The frontend will use this to navigate to `/staff/:id`.

**Step 1: Create query**

File: `apps/api/Api/Features/Staff/Me/GetMyProfileQuery.cs`
```csharp
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Me;

public record GetMyProfileQuery(Guid UserId) : IRequest<Guid?>, ITenantScoped;
```

**Step 2: Create handler**

File: `apps/api/Api/Features/Staff/Me/GetMyProfileHandler.cs`
```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.Me;

public class GetMyProfileHandler(AppDbContext db)
    : IRequestHandler<GetMyProfileQuery, Guid?>
{
    public async Task<Guid?> Handle(GetMyProfileQuery query, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .FirstOrDefaultAsync(s => s.UserId == query.UserId, ct);
        return staff?.Id;
    }
}
```

**Step 3: Create endpoint**

File: `apps/api/Api/Features/Staff/Me/GetMyProfileEndpoint.cs`
```csharp
using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.Me;

public static class GetMyProfileEndpoint
{
    public static void MapGetMyProfile(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/staff/me", async (
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user.FindFirst("sub")!.Value);
            var staffId = await mediator.Send(new GetMyProfileQuery(userId), ct);
            if (staffId is null) return Results.NotFound();
            return Results.Ok(new { staffId });
        })
        .RequireAuthorization()
        .WithName("GetMyProfile")
        .WithTags("Staff")
        .Produces(200)
        .Produces(404)
        .Produces(401);
    }
}
```

**Step 4: Register in Program.cs**

Add using:
```csharp
using Api.Features.Staff.Me;
```

Add before `app.MapGetStaff();` (important — `/api/staff/me` must be registered before `/api/staff/{id:guid}` to avoid route conflict):

```csharp
app.MapGetMyProfile();
```

**Step 5: Commit**

```bash
git add apps/api/Api/Features/Staff/Me/ apps/api/Api/Program.cs
git commit -m "feat: add GET /api/staff/me endpoint"
```

---

### Task 11: Add ChangePassword validation (min 8 chars)

**Files:**
- Create: `apps/api/Api/Features/Auth/ChangePassword/ChangePasswordValidator.cs`

**Step 1: Create validator**

File: `apps/api/Api/Features/Auth/ChangePassword/ChangePasswordValidator.cs`
```csharp
using FluentValidation;
namespace Api.Features.Auth.ChangePassword;

public class ChangePasswordValidator : AbstractValidator<ChangePasswordCommand>
{
    public ChangePasswordValidator()
    {
        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(8)
            .WithMessage("Password must be at least 8 characters");
    }
}
```

**Step 2: Commit**

```bash
git add apps/api/Api/Features/Auth/ChangePassword/ChangePasswordValidator.cs
git commit -m "feat: add password strength validation (min 8 chars)"
```

---

### Task 12: Frontend — Add role guards and fix BU page

**Files:**
- Modify: `apps/web/src/app/(auth)/business-units/new/page.tsx`
- Modify: `apps/web/src/app/(auth)/business-units/page.tsx`
- Modify: `apps/web/src/app/(auth)/staff/new/page.tsx`

**Context:** Non-Owner/Admin users can access `/business-units/new` and `/staff/new` directly via URL. Also, the "New Business Unit" button is shown to all users.

**Step 1: Add role guard to NewBusinessUnitPage**

In `apps/web/src/app/(auth)/business-units/new/page.tsx`, add the auth store import and role check:

```tsx
import { useAuthStore } from '@/stores/authStore';
```

Then wrap the component body — at the start of `NewBusinessUnitPage`:

```tsx
export default function NewBusinessUnitPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useAuthStore();

  if (role !== 'Owner' && role !== 'Admin') {
    return <p className="text-red-500">Access denied. Only Owners and Admins can create business units.</p>;
  }
  // ... rest of component
```

**Step 2: Add role guard to NewStaffPage**

Same pattern in `apps/web/src/app/(auth)/staff/new/page.tsx`:

```tsx
import { useAuthStore } from '@/stores/authStore';
```

At the start of `NewStaffPage`:

```tsx
export default function NewStaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useAuthStore();

  if (role !== 'Owner' && role !== 'Admin') {
    return <p className="text-red-500">Access denied. Only Owners and Admins can create staff.</p>;
  }
  // ... rest
```

**Step 3: Hide "New BU" button for Staff role**

In `apps/web/src/app/(auth)/business-units/page.tsx`, add auth store and conditionally show button.

Import: `import { useAuthStore } from '@/stores/authStore';`

In the component, add: `const { role } = useAuthStore();`

Wrap the "New Business Unit" button: `{(role === 'Owner' || role === 'Admin') && ( ... )}`

**Step 4: Commit**

```bash
git add apps/web/src/app/\(auth\)/business-units/ \
        apps/web/src/app/\(auth\)/staff/new/
git commit -m "feat(web): add role guards to BU and staff creation pages"
```

---

### Task 13: Frontend — Add "My Profile" to Sidebar

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`

**Context:** Users need a way to navigate to their own profile. We add a "My Profile" link that calls `GET /api/staff/me` and redirects.

**Step 1: Add My Profile link**

In `apps/web/src/components/Sidebar.tsx`, add the My Profile link in the bottom section, before the Sign Out button:

```tsx
'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/business-units', label: 'Business Units' },
  { href: '/staff', label: 'Staff' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, clearAuth } = useAuthStore();

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    clearAuth();
    router.push('/login');
  }

  async function handleMyProfile() {
    try {
      const res = await api.get('/staff/me');
      router.push(`/staff/${res.data.staffId}`);
    } catch {
      // Owner created at onboard may not have a staff profile
    }
  }

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-lg font-semibold">MVP Platform</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname.startsWith(item.href)
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        ))}

        {role === 'Owner' && (
          <Link
            href="/chat-permissions"
            className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname.startsWith('/chat-permissions')
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Chat Permissions
          </Link>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700 space-y-1">
        <button
          onClick={handleMyProfile}
          className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          My Profile
        </button>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): add My Profile link to sidebar"
```

---

### Task 14: Frontend — Add password management to Staff Detail page

**Files:**
- Modify: `apps/web/src/app/(auth)/staff/[id]/page.tsx`

**Context:** Owner/Admin should see "Reset Password" and "Set Password" controls on the staff detail page. Also add a tab or section for password management.

**Step 1: Update the staff detail page**

In `apps/web/src/app/(auth)/staff/[id]/page.tsx`:

1. Import `useAuthStore`
2. Add a third tab: `'password'`
3. Add password management mutations
4. Show the password tab only for Owner/Admin

Add to imports:
```tsx
import { useAuthStore } from '@/stores/authStore';
```

Update the tabs type:
```tsx
const [tab, setTab] = useState<'profile' | 'bu' | 'password'>('profile');
```

Get the role from auth store:
```tsx
const { role } = useAuthStore();
```

Update the tab buttons — add password tab (shown only for Owner/Admin):
```tsx
{(['profile', 'bu', ...(role === 'Owner' || role === 'Admin' ? ['password' as const] : [])] as const).map((t) => (
```

Tab label mapping:
```tsx
{t === 'profile' ? 'Global Profile' : t === 'bu' ? 'BU-Scoped Data' : 'Password'}
```

Add password mutations:
```tsx
const resetPassword = useMutation({
  mutationFn: () => api.post(`/staff/${id}/reset-password`),
  onSuccess: (res) => {
    Swal.fire('Password Reset', `New password: ${res.data.newPassword}`, 'success');
  },
  onError: () => Swal.fire('Error', 'Reset failed.', 'error'),
});

const setPassword = useMutation({
  mutationFn: (newPassword: string) => api.put(`/staff/${id}/password`, { newPassword }),
  onSuccess: () => Swal.fire('Saved!', 'Password has been set.', 'success'),
  onError: () => Swal.fire('Error', 'Set password failed.', 'error'),
});
```

Add the password tab content:
```tsx
{tab === 'password' && (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Reset Password</h3>
      <p className="text-xs text-gray-500 mb-3">Generate a new random password. The staff member will be required to change it on next login.</p>
      <button
        onClick={() => resetPassword.mutate()}
        disabled={resetPassword.isPending}
        className="bg-orange-500 text-white px-4 py-2 rounded-md text-sm hover:bg-orange-600 disabled:opacity-50"
      >
        {resetPassword.isPending ? 'Resetting…' : 'Reset Password'}
      </button>
    </div>
    <hr />
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Set Password</h3>
      <p className="text-xs text-gray-500 mb-3">Set a specific password for this staff member. They will be required to change it on next login.</p>
      <SetPasswordForm onSubmit={(pw) => setPassword.mutate(pw)} isPending={setPassword.isPending} />
    </div>
  </div>
)}
```

Add the `SetPasswordForm` component at the bottom of the file:
```tsx
function SetPasswordForm({ onSubmit, isPending }: { onSubmit: (pw: string) => void; isPending: boolean }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
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
          if (pw.length < 8) { Swal.fire('Error', 'Password must be at least 8 characters.', 'error'); return; }
          if (pw !== confirm) { Swal.fire('Error', 'Passwords do not match.', 'error'); return; }
          onSubmit(pw);
          setPw('');
          setConfirm('');
        }}
        disabled={isPending}
        className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'Setting…' : 'Set Password'}
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/app/\(auth\)/staff/\[id\]/page.tsx
git commit -m "feat(web): add password management tab to staff detail page"
```

---

### Task 15: Frontend — Handle 403 responses

**Files:**
- Modify: `apps/web/src/lib/api.ts`

**Context:** The new RBAC will return 403 Forbidden responses. The frontend should show an alert instead of silently failing.

**Step 1: Add 403 handler to Axios interceptor**

In `apps/web/src/lib/api.ts`, update the response error interceptor to also handle 403:

Add to the error interceptor, before the `return Promise.reject(err)`:

```typescript
if (err.response?.status === 403) {
  // Don't redirect, let the caller handle it or show a generic message
}
```

Actually, the better approach is to let each page handle 403 via mutation `onError`. No change needed in the interceptor — the existing 401 handler already skips login requests, and 403 will propagate to the `onError` callbacks. The SweetAlert in `onError` already shows "Error" / "Failed to..." messages.

**No changes needed for this task. Skip.**

---

### Task 16: Write System Design Document in Thai

**Files:**
- Create: `docs/system-design.md`

**Context:** Comprehensive technical document with Mermaid diagrams covering architecture, DB schema, multi-tenancy, inter-service communication, RBAC. Written in Thai.

**Step 1: Write the document**

File: `docs/system-design.md`

```markdown
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

**หมายเหตุ:** ไม่มี Foreign Key ข้าม schema — `workspace_members.user_id` เชื่อมกับ `main.users.id` ผ่าน NATS events เท่านั้น

---

## 3. Multi-Tenancy Strategy

### 3.1 Row-Level Isolation

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant TenantBehavior
    participant EF Core
    participant PostgreSQL

    Client->>API: Request + JWT (company_id claim)
    API->>TenantBehavior: MediatR Pipeline
    TenantBehavior->>EF Core: SetTenant(companyId)
    EF Core->>EF Core: Apply Global Query Filter<br/>(WHERE company_id = @tenantId)
    EF Core->>PostgreSQL: SELECT ... WHERE company_id = '...'
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
- Consumer: `chat-service` (durable)

### 4.2 Sync: HTTP (Chat Permission Sync)

```mermaid
sequenceDiagram
    participant Admin as Owner/Admin
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

---

## 5. Role-Based Access Control (RBAC)

### 5.1 Role Hierarchy

```mermaid
graph TD
    Owner[Owner<br/>สิทธิ์ทั้งหมด]
    Admin[Admin<br/>จัดการ Staff + BU]
    Staff[Staff<br/>ดูข้อมูล + แก้ไขตัวเอง]

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

### 5.3 Implementation

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
    NextJS->>API: Forward request<br/>(proxy)
    API->>DB: SELECT user WHERE username = ?
    API->>API: BCrypt.Verify(password, hash)
    API->>API: JwtService.Generate(userId, companyId, role)
    API-->>NextJS: 200 + Set-Cookie: auth_token=JWT<br/>{userId, role, mustChangePassword}
    NextJS-->>Browser: Forward response + cookie
    Browser->>Browser: Store role in Zustand<br/>(localStorage)
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
```

**Step 2: Commit**

```bash
git add docs/system-design.md
git commit -m "docs: add System Design Document in Thai with Mermaid diagrams"
```

---

### Task 17: Final verification

**Step 1: Build and test API**

```bash
cd apps/api && dotnet build
cd Api.Tests && dotnet test
```

**Step 2: Build chat service**

```bash
cd apps/chat && go build ./cmd/server/
```

**Step 3: Build frontend**

```bash
cd apps/web && npm run build
```

**Step 4: Docker compose build**

```bash
docker-compose build
```

Fix any compilation errors found.

**Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors from improvements"
```
