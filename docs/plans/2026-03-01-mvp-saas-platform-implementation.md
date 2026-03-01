# MVP B2B Multi-Tenant SaaS Platform — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Build a working B2B multi-tenant SaaS MVP with company onboarding, RBAC, and chat workspace provisioning across three services.

**Architecture:** Row-level multi-tenancy via `company_id` discriminator. .NET 10 VSA+CQRS handles the main API. Go clean architecture handles chat provisioning. NATS JetStream delivers `bu.created` events asynchronously. Single shared PostgreSQL with `main` and `chat` schemas.

**Tech Stack:** Next.js 16+/Bun/React 19/TypeScript/Tailwind, .NET 10/MediatR/EF Core 10/Npgsql, Go 1.25/Echo v4/pgx v5, PostgreSQL 16, NATS JetStream, Docker Compose

---

## Phase 0: Monorepo Foundation

### Task 1: Repository skeleton + .gitignore

**Files:**
- Create: `.gitignore`
- Create: `apps/` (empty dir markers)
- Create: `infra/postgres/` (dir)
- Create: `infra/nats/` (dir)

**Step 1: Create directory structure**

```bash
mkdir -p apps/web apps/api apps/chat infra/postgres infra/nats docs/plans
touch apps/web/.gitkeep apps/chat/.gitkeep
```

**Step 2: Write `.gitignore`**

```gitignore
# .NET
apps/api/bin/
apps/api/obj/
apps/api/**/*.user
apps/api/**/*.suo
apps/api/.vs/

# Go
apps/chat/vendor/

# Node / Bun
apps/web/node_modules/
apps/web/.next/
apps/web/.env.local

# General
*.env
*.env.local
.DS_Store
docker-compose.override.yml
```

**Step 3: Commit**

```bash
git add .gitignore apps/ infra/ docs/
git commit -m "chore: initialize monorepo structure"
```

---

### Task 2: PostgreSQL init.sql

**Files:**
- Create: `infra/postgres/init.sql`

**Step 1: Write schema bootstrap**

```sql
-- infra/postgres/init.sql

CREATE SCHEMA IF NOT EXISTS main;
CREATE SCHEMA IF NOT EXISTS chat;

-- ============================================================
-- SCHEMA: main (owned by .NET API)
-- ============================================================

CREATE TABLE IF NOT EXISTS main.companies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  address        TEXT NOT NULL,
  contact_number TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.business_units (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES main.companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.users (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES main.companies(id) ON DELETE CASCADE,
  username             TEXT NOT NULL UNIQUE,
  password_hash        TEXT NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('Owner','Admin','Staff')),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.staff_profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES main.companies(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES main.users(id),
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS main.staff_bu (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES main.staff_profiles(id) ON DELETE CASCADE,
  bu_id      UUID NOT NULL REFERENCES main.business_units(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, bu_id)
);

CREATE TABLE IF NOT EXISTS main.chat_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES main.staff_profiles(id) ON DELETE CASCADE,
  bu_id      UUID NOT NULL REFERENCES main.business_units(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, bu_id)
);

-- ============================================================
-- SCHEMA: chat (owned by Go chat service)
-- ============================================================

CREATE TABLE IF NOT EXISTS chat.workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bu_id      UUID NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES chat.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('admin','member')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
```

**Step 2: Commit**

```bash
git add infra/postgres/init.sql
git commit -m "chore: add PostgreSQL schema bootstrap"
```

---

### Task 3: NATS server config

**Files:**
- Create: `infra/nats/nats-server.conf`

**Step 1: Write NATS config with JetStream enabled**

```conf
# infra/nats/nats-server.conf
port: 4222
http_port: 8222

jetstream {
  store_dir: "/data/jetstream"
  max_memory_store: 256MB
  max_file_store: 1GB
}
```

**Step 2: Commit**

```bash
git add infra/nats/
git commit -m "chore: add NATS JetStream server config"
```

---

## Phase 1: .NET 10 API

### Task 4: Scaffold .NET solution

**Files:**
- Create: `apps/api/Api.sln`
- Create: `apps/api/Api/Api.csproj`
- Create: `apps/api/Api.Tests/Api.Tests.csproj`

**Step 1: Create solution and projects**

```bash
cd apps/api
dotnet new sln -n Api
dotnet new webapi -n Api --use-minimal-apis --no-openapi -f net10.0
dotnet new xunit -n Api.Tests -f net10.0
dotnet sln add Api/Api.csproj Api.Tests/Api.Tests.csproj
dotnet add Api.Tests/Api.Tests.csproj reference Api/Api.csproj
```

**Step 2: Add NuGet packages to Api project**

```bash
cd Api
dotnet add package MediatR --version 12.*
dotnet add package FluentValidation.MediatR --version 11.*
dotnet add package Npgsql.EntityFrameworkCore.PostgreSQL --version 9.*
dotnet add package Microsoft.AspNetCore.Authentication.JwtBearer --version 10.*
dotnet add package BCrypt.Net-Next --version 4.*
dotnet add package NATS.Net --version 2.*
dotnet add package Microsoft.AspNetCore.OpenApi --version 10.*
dotnet add package Scalar.AspNetCore --version 2.*
```

**Step 3: Add NuGet packages to Api.Tests project**

```bash
cd ../Api.Tests
dotnet add package FluentAssertions --version 7.*
dotnet add package NSubstitute --version 5.*
dotnet add package Microsoft.AspNetCore.Mvc.Testing --version 10.*
dotnet add package Microsoft.EntityFrameworkCore.InMemory --version 9.*
```

**Step 4: Delete boilerplate from dotnet new**

Remove `WeatherForecast.cs` and the weather endpoint from `Program.cs`. Leave only:

```csharp
// apps/api/Api/Program.cs
var builder = WebApplication.CreateBuilder(args);
// (configure services here - subsequent tasks fill this in)
var app = builder.Build();
app.Run();

// Required for WebApplicationFactory in tests
public partial class Program { }
```

**Step 5: Commit**

```bash
cd ../../
git add apps/api/
git commit -m "chore: scaffold .NET 10 solution with Api and Api.Tests projects"
```

---

### Task 5: Entity models + DbContext

**Files:**
- Create: `apps/api/Api/Infrastructure/Persistence/Entities/Company.cs`
- Create: `apps/api/Api/Infrastructure/Persistence/Entities/BusinessUnit.cs`
- Create: `apps/api/Api/Infrastructure/Persistence/Entities/User.cs`
- Create: `apps/api/Api/Infrastructure/Persistence/Entities/StaffProfile.cs`
- Create: `apps/api/Api/Infrastructure/Persistence/Entities/StaffBu.cs`
- Create: `apps/api/Api/Infrastructure/Persistence/Entities/ChatPermission.cs`
- Create: `apps/api/Api/Infrastructure/Persistence/AppDbContext.cs`

**Step 1: Write entity models**

```csharp
// Company.cs
namespace Api.Infrastructure.Persistence.Entities;
public class Company
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Address { get; set; } = "";
    public string ContactNumber { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public ICollection<BusinessUnit> BusinessUnits { get; set; } = [];
    public ICollection<User> Users { get; set; } = [];
}

// BusinessUnit.cs
public class BusinessUnit
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public string Name { get; set; } = "";
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; }
    public Company Company { get; set; } = null!;
}

// User.cs
public class User
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "";          // "Owner" | "Admin" | "Staff"
    public bool MustChangePassword { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public Company Company { get; set; } = null!;
}

// StaffProfile.cs
public class StaffProfile
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public ICollection<StaffBu> StaffBus { get; set; } = [];
}

// StaffBu.cs
public class StaffBu
{
    public Guid Id { get; set; }
    public Guid StaffId { get; set; }
    public Guid BuId { get; set; }
    public string Email { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

// ChatPermission.cs
public class ChatPermission
{
    public Guid Id { get; set; }
    public Guid StaffId { get; set; }
    public Guid BuId { get; set; }
    public DateTime GrantedAt { get; set; }
}
```

**Step 2: Write AppDbContext with global query filters**

```csharp
// apps/api/Api/Infrastructure/Persistence/AppDbContext.cs
using Api.Infrastructure.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Api.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    // Tenant filter is applied via query filter registered per request
    // We use a Guid? field that gets set by TenantBehavior via ICurrentTenant
    private Guid? _currentTenantId;

    public void SetTenant(Guid tenantId) => _currentTenantId = tenantId;

    public DbSet<Company> Companies => Set<Company>();
    public DbSet<BusinessUnit> BusinessUnits => Set<BusinessUnit>();
    public DbSet<User> Users => Set<User>();
    public DbSet<StaffProfile> StaffProfiles => Set<StaffProfile>();
    public DbSet<StaffBu> StaffBus => Set<StaffBu>();
    public DbSet<ChatPermission> ChatPermissions => Set<ChatPermission>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("main");

        modelBuilder.Entity<Company>(e => e.ToTable("companies"));
        modelBuilder.Entity<BusinessUnit>(e => {
            e.ToTable("business_units");
            e.HasQueryFilter(b => !_currentTenantId.HasValue || b.CompanyId == _currentTenantId);
        });
        modelBuilder.Entity<User>(e => {
            e.ToTable("users");
            e.HasQueryFilter(u => !_currentTenantId.HasValue || u.CompanyId == _currentTenantId);
        });
        modelBuilder.Entity<StaffProfile>(e => {
            e.ToTable("staff_profiles");
            e.HasQueryFilter(s => !_currentTenantId.HasValue || s.CompanyId == _currentTenantId);
        });
        modelBuilder.Entity<StaffBu>(e => e.ToTable("staff_bu"));
        modelBuilder.Entity<ChatPermission>(e => e.ToTable("chat_permissions"));
    }
}
```

**Step 3: Register DbContext in Program.cs**

```csharp
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));
```

**Step 4: Add connection string to appsettings.json**

```json
{
  "ConnectionStrings": {
    "Postgres": "Host=postgres;Port=5432;Database=mvp;Username=postgres;Password=postgres"
  }
}
```

**Step 5: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add entity models and AppDbContext with tenant query filters"
```

---

### Task 6: Common infrastructure — TenantBehavior, JWT, ValidationBehavior

**Files:**
- Create: `apps/api/Api/Common/Interfaces/ITenantScoped.cs`
- Create: `apps/api/Api/Common/Behaviors/TenantBehavior.cs`
- Create: `apps/api/Api/Common/Behaviors/ValidationBehavior.cs`
- Create: `apps/api/Api/Common/Jwt/JwtService.cs`
- Test: `apps/api/Api.Tests/Common/TenantBehaviorTests.cs`

**Step 1: Write the failing test for TenantBehavior**

```csharp
// apps/api/Api.Tests/Common/TenantBehaviorTests.cs
using Api.Common.Behaviors;
using Api.Common.Interfaces;
using Api.Infrastructure.Persistence;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace Api.Tests.Common;

public class TenantBehaviorTests
{
    [Fact]
    public async Task Should_SetTenantOnDbContext_WhenRequestIsTenantScoped()
    {
        var companyId = Guid.NewGuid();
        var httpContextAccessor = Substitute.For<IHttpContextAccessor>();
        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("company_id", companyId.ToString())
        ]));
        httpContextAccessor.HttpContext.Returns(httpContext);

        var dbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase("test")
            .Options;
        var db = new AppDbContext(dbOptions);

        var behavior = new TenantBehavior<TestTenantRequest, Unit>(httpContextAccessor, db);
        var next = Substitute.For<RequestHandlerDelegate<Unit>>();

        await behavior.Handle(new TestTenantRequest(), next, CancellationToken.None);

        await next.Received(1).Invoke();
    }
}

public class TestTenantRequest : IRequest<Unit>, ITenantScoped { }
```

**Step 2: Run the test to confirm it fails**

```bash
cd apps/api
dotnet test Api.Tests/Api.Tests.csproj --filter "TenantBehaviorTests" -v minimal
```
Expected: FAIL — `TenantBehavior` not found.

**Step 3: Write ITenantScoped interface**

```csharp
// apps/api/Api/Common/Interfaces/ITenantScoped.cs
namespace Api.Common.Interfaces;
public interface ITenantScoped { }
```

**Step 4: Write TenantBehavior**

```csharp
// apps/api/Api/Common/Behaviors/TenantBehavior.cs
using Api.Common.Interfaces;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;

namespace Api.Common.Behaviors;

public class TenantBehavior<TRequest, TResponse>(
    IHttpContextAccessor httpContextAccessor,
    AppDbContext db)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : ITenantScoped
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var claim = httpContextAccessor.HttpContext?.User
            .FindFirst("company_id")?.Value;

        if (Guid.TryParse(claim, out var companyId))
            db.SetTenant(companyId);

        return await next();
    }
}
```

**Step 5: Write ValidationBehavior**

```csharp
// apps/api/Api/Common/Behaviors/ValidationBehavior.cs
using FluentValidation;
using MediatR;

namespace Api.Common.Behaviors;

public class ValidationBehavior<TRequest, TResponse>(IEnumerable<IValidator<TRequest>> validators)
    : IPipelineBehavior<TRequest, TResponse>
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        if (!validators.Any()) return await next();

        var context = new ValidationContext<TRequest>(request);
        var failures = validators
            .Select(v => v.Validate(context))
            .SelectMany(r => r.Errors)
            .Where(f => f != null)
            .ToList();

        if (failures.Count != 0)
            throw new ValidationException(failures);

        return await next();
    }
}
```

**Step 6: Write JwtService**

```csharp
// apps/api/Api/Common/Jwt/JwtService.cs
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Api.Common.Jwt;

public class JwtService(IConfiguration config)
{
    public string Generate(Guid userId, Guid companyId, string role)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim("company_id", companyId.ToString()),
            new Claim("role", role),
        };

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: config["Jwt:Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
```

**Step 7: Register in Program.cs**

```csharp
// Add to Program.cs

builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<JwtService>();

builder.Services.AddMediatR(cfg => {
    cfg.RegisterServicesFromAssemblyContaining<Program>();
    cfg.AddOpenBehavior(typeof(TenantBehavior<,>));
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
});
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt => {
        opt.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
        // Read JWT from cookie
        opt.Events = new JwtBearerEvents {
            OnMessageReceived = ctx => {
                ctx.Token = ctx.Request.Cookies["auth_token"];
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

// Add to appsettings.json
// "Jwt": { "Secret": "super-secret-key-min-32-chars-long!!", "Issuer": "mvp-api", "Audience": "mvp-web" }
```

**Step 8: Run tests to confirm pass**

```bash
dotnet test Api.Tests/Api.Tests.csproj -v minimal
```
Expected: PASS

**Step 9: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add TenantBehavior, ValidationBehavior, and JwtService"
```

---

### Task 7: Company Onboarding feature

**Files:**
- Create: `apps/api/Api/Features/Companies/Onboard/OnboardCommand.cs`
- Create: `apps/api/Api/Features/Companies/Onboard/OnboardHandler.cs`
- Create: `apps/api/Api/Features/Companies/Onboard/OnboardEndpoint.cs`
- Create: `apps/api/Api/Features/Companies/Onboard/OnboardValidator.cs`
- Test: `apps/api/Api.Tests/Features/Companies/OnboardHandlerTests.cs`

**Step 1: Write the failing test**

```csharp
// apps/api/Api.Tests/Features/Companies/OnboardHandlerTests.cs
using Api.Features.Companies.Onboard;
using Api.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Api.Tests.Features.Companies;

public class OnboardHandlerTests
{
    private AppDbContext CreateDb()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(opts);
    }

    [Fact]
    public async Task Handle_ValidCommand_CreatesCompanyBuAndOwner()
    {
        var db = CreateDb();
        var publisher = Substitute.For<INatsPublisher>();
        var handler = new OnboardHandler(db, publisher);

        var cmd = new OnboardCommand(
            CompanyName: "Acme Corp",
            Address: "123 Main St",
            ContactNumber: "0812345678");

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.Should().NotBeNull();
        result.Username.Should().Be("owner@acmecorp");

        (await db.Companies.CountAsync()).Should().Be(1);
        (await db.BusinessUnits.CountAsync()).Should().Be(1);
        var bu = await db.BusinessUnits.FirstAsync();
        bu.IsDefault.Should().BeTrue();
        bu.Name.Should().Be("Default");

        (await db.Users.CountAsync()).Should().Be(1);
        var user = await db.Users.FirstAsync();
        user.Role.Should().Be("Owner");
        user.MustChangePassword.Should().BeTrue();
    }
}
```

**Step 2: Run to confirm failure**

```bash
cd apps/api
dotnet test Api.Tests --filter "OnboardHandlerTests" -v minimal
```
Expected: FAIL

**Step 3: Write OnboardCommand**

```csharp
// OnboardCommand.cs
using MediatR;
namespace Api.Features.Companies.Onboard;

public record OnboardCommand(
    string CompanyName,
    string Address,
    string ContactNumber) : IRequest<OnboardResult>;

public record OnboardResult(Guid CompanyId, string Username, string DefaultPassword);
```

**Step 4: Write INatsPublisher interface**

```csharp
// apps/api/Api/Infrastructure/Messaging/INatsPublisher.cs
namespace Api.Infrastructure.Messaging;
public interface INatsPublisher
{
    Task PublishAsync<T>(string subject, T payload, CancellationToken ct = default);
}
```

**Step 5: Write OnboardHandler**

```csharp
// OnboardHandler.cs
using Api.Infrastructure.Messaging;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;

namespace Api.Features.Companies.Onboard;

public class OnboardHandler(AppDbContext db, INatsPublisher nats)
    : IRequestHandler<OnboardCommand, OnboardResult>
{
    public async Task<OnboardResult> Handle(OnboardCommand cmd, CancellationToken ct)
    {
        // 1. Create company
        var company = new Company {
            Id = Guid.NewGuid(),
            Name = cmd.CompanyName,
            Address = cmd.Address,
            ContactNumber = cmd.ContactNumber,
            CreatedAt = DateTime.UtcNow
        };
        db.Companies.Add(company);

        // 2. Create default BU
        var bu = new BusinessUnit {
            Id = Guid.NewGuid(),
            CompanyId = company.Id,
            Name = "Default",
            IsDefault = true,
            CreatedAt = DateTime.UtcNow
        };
        db.BusinessUnits.Add(bu);

        // 3. Create Owner account
        var slug = cmd.CompanyName.ToLower().Replace(" ", "");
        var username = $"owner@{slug}";
        var defaultPassword = $"Welcome@{cmd.CompanyName.Replace(" ", "")}1";
        var user = new User {
            Id = Guid.NewGuid(),
            CompanyId = company.Id,
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(defaultPassword),
            Role = "Owner",
            MustChangePassword = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);

        await db.SaveChangesAsync(ct);

        // 4. Publish bu.created event
        await nats.PublishAsync("bu.created", new {
            bu_id = bu.Id,
            bu_name = bu.Name,
            owner_user_id = user.Id,
            company_id = company.Id
        }, ct);

        return new OnboardResult(company.Id, username, defaultPassword);
    }
}
```

**Step 6: Write OnboardEndpoint**

```csharp
// OnboardEndpoint.cs
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
        });
    }
}

public record OnboardRequest(string CompanyName, string Address, string ContactNumber);
```

**Step 7: Write OnboardValidator**

```csharp
// OnboardValidator.cs
using FluentValidation;
namespace Api.Features.Companies.Onboard;

public class OnboardValidator : AbstractValidator<OnboardCommand>
{
    public OnboardValidator()
    {
        RuleFor(x => x.CompanyName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Address).NotEmpty().MaximumLength(500);
        RuleFor(x => x.ContactNumber).NotEmpty().MaximumLength(20);
    }
}
```

**Step 8: Register endpoint in Program.cs**

```csharp
app.MapOnboard();
```

**Step 9: Run tests to confirm pass**

```bash
dotnet test Api.Tests --filter "OnboardHandlerTests" -v minimal
```
Expected: PASS

**Step 10: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add company onboarding feature with NATS publish"
```

---

### Task 8: Auth feature — Login + ChangePassword

**Files:**
- Create: `apps/api/Api/Features/Auth/Login/LoginCommand.cs`
- Create: `apps/api/Api/Features/Auth/Login/LoginHandler.cs`
- Create: `apps/api/Api/Features/Auth/Login/LoginEndpoint.cs`
- Create: `apps/api/Api/Features/Auth/ChangePassword/ChangePasswordCommand.cs`
- Create: `apps/api/Api/Features/Auth/ChangePassword/ChangePasswordHandler.cs`
- Create: `apps/api/Api/Features/Auth/ChangePassword/ChangePasswordEndpoint.cs`
- Test: `apps/api/Api.Tests/Features/Auth/LoginHandlerTests.cs`

**Step 1: Write the failing test**

```csharp
// LoginHandlerTests.cs
using Api.Common.Jwt;
using Api.Features.Auth.Login;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Api.Tests.Features.Auth;

public class LoginHandlerTests
{
    [Fact]
    public async Task Handle_ValidCredentials_ReturnsToken()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AppDbContext(opts);
        var companyId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        db.Users.Add(new User {
            Id = userId, CompanyId = companyId,
            Username = "owner@test",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("secret"),
            Role = "Owner", MustChangePassword = false
        });
        await db.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> {
                ["Jwt:Secret"] = "super-secret-key-at-least-32-chars!!",
                ["Jwt:Issuer"] = "mvp-api",
                ["Jwt:Audience"] = "mvp-web"
            }).Build();
        var jwt = new JwtService(config);
        var handler = new LoginHandler(db, jwt);

        var result = await handler.Handle(
            new LoginCommand("owner@test", "secret"), CancellationToken.None);

        result.Token.Should().NotBeEmpty();
        result.MustChangePassword.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_WrongPassword_ThrowsUnauthorized()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AppDbContext(opts);
        db.Users.Add(new User {
            Id = Guid.NewGuid(), CompanyId = Guid.NewGuid(),
            Username = "owner@test",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct"),
            Role = "Owner"
        });
        await db.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> {
                ["Jwt:Secret"] = "super-secret-key-at-least-32-chars!!",
                ["Jwt:Issuer"] = "mvp-api", ["Jwt:Audience"] = "mvp-web"
            }).Build();
        var handler = new LoginHandler(db, new JwtService(config));

        var act = () => handler.Handle(
            new LoginCommand("owner@test", "wrong"), CancellationToken.None);

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }
}
```

**Step 2: Run to confirm failure**

```bash
dotnet test Api.Tests --filter "LoginHandlerTests" -v minimal
```

**Step 3: Write LoginCommand and LoginHandler**

```csharp
// LoginCommand.cs
using MediatR;
namespace Api.Features.Auth.Login;
public record LoginCommand(string Username, string Password) : IRequest<LoginResult>;
public record LoginResult(string Token, bool MustChangePassword, Guid UserId, string Role);

// LoginHandler.cs
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

        var token = jwt.Generate(user.Id, user.CompanyId, user.Role);
        return new LoginResult(token, user.MustChangePassword, user.Id, user.Role);
    }
}
```

**Step 4: Write LoginEndpoint (sets httpOnly cookie)**

```csharp
// LoginEndpoint.cs
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
                    Secure = false, // set true in prod
                    Expires = DateTimeOffset.UtcNow.AddHours(24)
                });
                return Results.Ok(new {
                    result.UserId, result.Role, result.MustChangePassword
                });
            }
            catch (UnauthorizedAccessException) {
                return Results.Unauthorized();
            }
        });

        app.MapPost("/api/auth/logout", (HttpContext ctx) => {
            ctx.Response.Cookies.Delete("auth_token");
            return Results.Ok();
        });
    }
}
public record LoginRequest(string Username, string Password);
```

**Step 5: Write ChangePassword feature**

```csharp
// ChangePasswordCommand.cs
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Auth.ChangePassword;
public record ChangePasswordCommand(Guid UserId, string NewPassword)
    : IRequest<Unit>, ITenantScoped;

// ChangePasswordHandler.cs
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Auth.ChangePassword;
public class ChangePasswordHandler(AppDbContext db)
    : IRequestHandler<ChangePasswordCommand, Unit>
{
    public async Task<Unit> Handle(ChangePasswordCommand cmd, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == cmd.UserId, ct)
            ?? throw new KeyNotFoundException("User not found");
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(cmd.NewPassword);
        user.MustChangePassword = false;
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}

// ChangePasswordEndpoint.cs
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
        }).RequireAuthorization();
    }
}
public record ChangePasswordRequest(string NewPassword);
```

**Step 6: Register endpoints in Program.cs**

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.MapLogin();
app.MapChangePassword();
```

**Step 7: Run tests**

```bash
dotnet test Api.Tests --filter "LoginHandlerTests" -v minimal
```
Expected: PASS

**Step 8: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add login and change-password auth features"
```

---

### Task 9: Business Units feature

**Files:**
- Create: `apps/api/Api/Features/BusinessUnits/Create/` (Command, Handler, Endpoint, Validator)
- Create: `apps/api/Api/Features/BusinessUnits/List/` (Query, Handler, Endpoint)
- Test: `apps/api/Api.Tests/Features/BusinessUnits/CreateBuHandlerTests.cs`

**Step 1: Write the failing test**

```csharp
// CreateBuHandlerTests.cs
using Api.Features.BusinessUnits.Create;
using Api.Infrastructure.Messaging;
using Api.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

public class CreateBuHandlerTests
{
    [Fact]
    public async Task Handle_ValidCommand_CreatesBuAndPublishesEvent()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AppDbContext(opts);
        var nats = Substitute.For<INatsPublisher>();
        var companyId = Guid.NewGuid();
        db.SetTenant(companyId);

        var handler = new CreateBuHandler(db, nats);
        var cmd = new CreateBuCommand("Sales") { CompanyId = companyId };

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.Should().NotBe(Guid.Empty);
        (await db.BusinessUnits.CountAsync()).Should().Be(1);
        await nats.Received(1).PublishAsync(
            "bu.created", Arg.Any<object>(), Arg.Any<CancellationToken>());
    }
}
```

**Step 2: Run to confirm failure, then implement**

```csharp
// CreateBuCommand.cs
using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.BusinessUnits.Create;
public record CreateBuCommand(string Name) : IRequest<Guid>, ITenantScoped
{
    public Guid CompanyId { get; set; } // set by TenantBehavior
}

// CreateBuHandler.cs
using Api.Infrastructure.Messaging;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
namespace Api.Features.BusinessUnits.Create;
public class CreateBuHandler(AppDbContext db, INatsPublisher nats)
    : IRequestHandler<CreateBuCommand, Guid>
{
    public async Task<Guid> Handle(CreateBuCommand cmd, CancellationToken ct)
    {
        // NOTE: TenantBehavior sets db._currentTenantId.
        // cmd.CompanyId is set by reading HttpContext claims in the endpoint.
        var bu = new BusinessUnit {
            Id = Guid.NewGuid(),
            CompanyId = cmd.CompanyId,
            Name = cmd.Name,
            IsDefault = false,
            CreatedAt = DateTime.UtcNow
        };
        db.BusinessUnits.Add(bu);
        await db.SaveChangesAsync(ct);

        await nats.PublishAsync("bu.created", new {
            bu_id = bu.Id, bu_name = bu.Name,
            owner_user_id = Guid.Empty, // resolved by query in handler
            company_id = bu.CompanyId
        }, ct);

        return bu.Id;
    }
}
```

> **Note:** For the BU create handler, resolve the Owner's user_id from `db.Users` where `Role == "Owner"` before publishing the event. The test stub uses `Guid.Empty` for simplicity.

```csharp
// CreateBuEndpoint.cs
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
        }).RequireAuthorization();
    }
}
public record CreateBuRequest(string Name);

// ListBuQuery.cs + ListBuHandler.cs + ListBuEndpoint.cs (follow same pattern)
// Query returns IEnumerable<BusinessUnitDto> filtered by tenant via global query filter
```

**Step 3: Run tests**

```bash
dotnet test Api.Tests --filter "CreateBuHandlerTests" -v minimal
```
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add business units create and list features"
```

---

### Task 10: Staff feature

**Files:** (follow established pattern for each sub-feature)
- `Features/Staff/Create/` — CreateStaffCommand, CreateStaffHandler, CreateStaffEndpoint
- `Features/Staff/List/` — ListStaffQuery, ListStaffHandler, ListStaffEndpoint
- `Features/Staff/GetById/` — GetStaffQuery, GetStaffHandler, GetStaffEndpoint
- `Features/Staff/UpdateBuScoped/` — UpdateBuScopedCommand, handler, endpoint

**Step 1: Write failing test for CreateStaff**

```csharp
// CreateStaffHandlerTests.cs
[Fact]
public async Task Handle_ValidCommand_CreatesStaffProfileAndBuRecord()
{
    // arrange: db with one BU
    // act: CreateStaffCommand { FirstName, LastName, Role, BuId, Email }
    // assert:
    //   - staff_profiles has 1 row
    //   - staff_bu has 1 row with the given email
    //   - users has 1 row with given role
}
```

**Step 2: Implement CreateStaffHandler**

```csharp
// CreateStaffCommand.cs
public record CreateStaffCommand(
    string FirstName, string LastName,
    string Role, Guid BuId, string Email)
    : IRequest<Guid>, ITenantScoped
{
    public Guid CompanyId { get; set; }
}

// CreateStaffHandler.cs
// 1. Create User (username auto-generated as firstname.lastname@companyslug)
// 2. Create StaffProfile (linked to User)
// 3. Create StaffBu record (email scoped to BU)
```

**Step 3: Implement List, GetById, UpdateBuScoped handlers**

- `ListStaffHandler`: return `StaffProfiles` with `Include(s => s.StaffBus)`, filtered by tenant
- `GetStaffHandler`: return single profile with all `StaffBus` entries
- `UpdateBuScopedHandler`: update `StaffBu.Email` for given `staffId` + `buId`

**Step 4: Run tests and commit**

```bash
dotnet test Api.Tests -v minimal
git add apps/api/
git commit -m "feat(api): add staff create, list, get, and BU-scoped update features"
```

---

### Task 11: Chat Permissions feature

**Files:**
- `Features/ChatPermissions/Grant/` — GrantPermissionCommand, handler, endpoint
- `Features/ChatPermissions/Revoke/` — RevokePermissionCommand, handler, endpoint
- `Features/ChatPermissions/ListByBu/` — ListByBuQuery, handler, endpoint
- Test: `GrantPermissionHandlerTests.cs`

**Step 1: Write failing test**

```csharp
[Fact]
public async Task Handle_Grant_CreatesChatPermissionRow()
{
    // arrange: db with staff and BU
    // act: GrantPermissionCommand { StaffId, BuId }
    // assert: chat_permissions has 1 row
}

[Fact]
public async Task Handle_Grant_Duplicate_ThrowsConflict()
{
    // arrange: permission already exists
    // act: grant again
    // assert: throws InvalidOperationException
}
```

**Step 2: Implement**

```csharp
// GrantPermissionCommand.cs
public record GrantPermissionCommand(Guid StaffId, Guid BuId)
    : IRequest<Guid>, ITenantScoped;

// GrantPermissionHandler.cs
// 1. Check if permission already exists → throw if so
// 2. Insert ChatPermission row
// 3. Return new permission Id

// RevokePermissionHandler.cs
// 1. Find permission by Id → throw if not found
// 2. Delete row

// ListByBuHandler.cs
// Return all ChatPermissions for given buId with staff details
```

**Step 3: Run tests and commit**

```bash
dotnet test Api.Tests -v minimal
git add apps/api/
git commit -m "feat(api): add chat permissions grant, revoke, and list features"
```

---

### Task 12: NATS publisher implementation

**Files:**
- Create: `apps/api/Api/Infrastructure/Messaging/NatsPublisher.cs`

**Step 1: Implement NatsPublisher**

```csharp
// apps/api/Api/Infrastructure/Messaging/NatsPublisher.cs
using NATS.Client.Core;
using NATS.Client.JetStream;
using System.Text.Json;

namespace Api.Infrastructure.Messaging;

public class NatsPublisher : INatsPublisher
{
    private readonly NatsJSContext _js;

    public NatsPublisher(IConfiguration config)
    {
        var url = config["Nats:Url"] ?? "nats://nats:4222";
        var conn = new NatsConnection(new NatsOpts { Url = url });
        _js = new NatsJSContext(conn);
    }

    public async Task PublishAsync<T>(string subject, T payload, CancellationToken ct = default)
    {
        await _js.PublishAsync(subject, payload, cancellationToken: ct);
    }
}
```

**Step 2: Register in Program.cs**

```csharp
// Ensure stream exists on startup
builder.Services.AddSingleton<INatsPublisher, NatsPublisher>();
```

**Step 3: Add NATS connection bootstrapper (ensure stream exists)**

```csharp
// apps/api/Api/Infrastructure/Messaging/NatsStreamBootstrap.cs
public static class NatsStreamBootstrap
{
    public static async Task EnsureStreamAsync(IConfiguration config)
    {
        var url = config["Nats:Url"] ?? "nats://nats:4222";
        var conn = new NatsConnection(new NatsOpts { Url = url });
        await conn.ConnectAsync();
        var js = new NatsJSContext(conn);
        try {
            await js.CreateStreamAsync(new StreamConfig("PLATFORM_EVENTS") {
                Subjects = ["bu.*"],
                Retention = StreamConfigRetention.Workqueue
            });
        } catch { /* stream may already exist */ }
    }
}
```

Call in `Program.cs` before `app.Run()`:

```csharp
await NatsStreamBootstrap.EnsureStreamAsync(app.Configuration);
```

**Step 4: Commit**

```bash
git add apps/api/
git commit -m "feat(api): implement NATS JetStream publisher and stream bootstrap"
```

---

## Phase 2: Go Chat Service

### Task 13: Scaffold Go project

**Files:**
- Create: `apps/chat/go.mod`
- Create: `apps/chat/cmd/server/main.go`
- Create: `apps/chat/internal/` (directory structure)

**Step 1: Initialize module and install packages**

```bash
cd apps/chat
go mod init github.com/yourusername/mvp-chat
go get github.com/labstack/echo/v4
go get github.com/labstack/echo/v4/middleware
go get github.com/nats-io/nats.go
go get github.com/jackc/pgx/v5
go get github.com/jackc/pgx/v5/pgxpool
go get github.com/google/uuid
go get github.com/stretchr/testify
go get github.com/joho/godotenv
```

**Step 2: Create directory structure**

```bash
mkdir -p cmd/server \
  internal/domain \
  internal/usecase \
  internal/repository \
  internal/delivery/http \
  internal/infrastructure/postgres \
  internal/infrastructure/nats
```

**Step 3: Write minimal main.go**

```go
// apps/chat/cmd/server/main.go
package main

import (
    "log"
    "os"
    "github.com/labstack/echo/v4"
    "github.com/labstack/echo/v4/middleware"
)

func main() {
    e := echo.New()
    e.Use(middleware.Logger())
    e.Use(middleware.Recover())

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    log.Fatal(e.Start(":" + port))
}
```

**Step 4: Confirm it builds**

```bash
go build ./cmd/server/
```
Expected: binary created, no errors.

**Step 5: Commit**

```bash
cd ../../
git add apps/chat/
git commit -m "chore(chat): scaffold Go project with Echo framework"
```

---

### Task 14: Domain models + repository interfaces

**Files:**
- Create: `apps/chat/internal/domain/workspace.go`
- Create: `apps/chat/internal/domain/member.go`
- Create: `apps/chat/internal/repository/workspace_repository.go`

**Step 1: Write domain models**

```go
// apps/chat/internal/domain/workspace.go
package domain

import (
    "time"
    "github.com/google/uuid"
)

type Workspace struct {
    ID        uuid.UUID
    BuID      uuid.UUID
    Name      string
    CreatedAt time.Time
}

// apps/chat/internal/domain/member.go
package domain

import (
    "time"
    "github.com/google/uuid"
)

type MemberRole string
const (
    RoleAdmin  MemberRole = "admin"
    RoleMember MemberRole = "member"
)

type WorkspaceMember struct {
    ID          uuid.UUID
    WorkspaceID uuid.UUID
    UserID      uuid.UUID
    Role        MemberRole
    CreatedAt   time.Time
}
```

**Step 2: Write repository interfaces**

```go
// apps/chat/internal/repository/workspace_repository.go
package repository

import (
    "context"
    "github.com/google/uuid"
    "github.com/yourusername/mvp-chat/internal/domain"
)

type WorkspaceRepository interface {
    Create(ctx context.Context, w *domain.Workspace) error
    GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error)
    GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error)
}

type MemberRepository interface {
    Add(ctx context.Context, m *domain.WorkspaceMember) error
    Remove(ctx context.Context, workspaceID, userID uuid.UUID) error
    ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error)
}
```

**Step 3: Commit**

```bash
git add apps/chat/
git commit -m "feat(chat): add domain models and repository interfaces"
```

---

### Task 15: PostgreSQL repositories

**Files:**
- Create: `apps/chat/internal/infrastructure/postgres/db.go`
- Create: `apps/chat/internal/infrastructure/postgres/workspace_repo.go`
- Create: `apps/chat/internal/infrastructure/postgres/member_repo.go`

**Step 1: Write DB connection pool**

```go
// apps/chat/internal/infrastructure/postgres/db.go
package postgres

import (
    "context"
    "github.com/jackc/pgx/v5/pgxpool"
)

func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
    return pgxpool.New(ctx, dsn)
}
```

**Step 2: Write workspace repository**

```go
// apps/chat/internal/infrastructure/postgres/workspace_repo.go
package postgres

import (
    "context"
    "github.com/google/uuid"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/yourusername/mvp-chat/internal/domain"
    "github.com/yourusername/mvp-chat/internal/repository"
)

type workspaceRepo struct{ pool *pgxpool.Pool }

func NewWorkspaceRepo(pool *pgxpool.Pool) repository.WorkspaceRepository {
    return &workspaceRepo{pool}
}

func (r *workspaceRepo) Create(ctx context.Context, w *domain.Workspace) error {
    _, err := r.pool.Exec(ctx,
        `INSERT INTO chat.workspaces (id, bu_id, name, created_at)
         VALUES ($1, $2, $3, $4)`,
        w.ID, w.BuID, w.Name, w.CreatedAt)
    return err
}

func (r *workspaceRepo) GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error) {
    row := r.pool.QueryRow(ctx,
        `SELECT id, bu_id, name, created_at FROM chat.workspaces WHERE bu_id = $1`, buID)
    w := &domain.Workspace{}
    err := row.Scan(&w.ID, &w.BuID, &w.Name, &w.CreatedAt)
    return w, err
}

func (r *workspaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
    row := r.pool.QueryRow(ctx,
        `SELECT id, bu_id, name, created_at FROM chat.workspaces WHERE id = $1`, id)
    w := &domain.Workspace{}
    err := row.Scan(&w.ID, &w.BuID, &w.Name, &w.CreatedAt)
    return w, err
}
```

**Step 3: Write member repository (same pattern)**

```go
// member_repo.go — INSERT/DELETE/SELECT on chat.workspace_members
// Implement Add, Remove, ListByWorkspace following workspace_repo pattern
```

**Step 4: Commit**

```bash
git add apps/chat/
git commit -m "feat(chat): implement PostgreSQL workspace and member repositories"
```

---

### Task 16: Workspace use case + tests

**Files:**
- Create: `apps/chat/internal/usecase/workspace_usecase.go`
- Test: `apps/chat/internal/usecase/workspace_usecase_test.go`

**Step 1: Write the failing test**

```go
// apps/chat/internal/usecase/workspace_usecase_test.go
package usecase_test

import (
    "context"
    "testing"
    "github.com/google/uuid"
    "github.com/stretchr/testify/assert"
    "github.com/stretchr/testify/mock"
    "github.com/yourusername/mvp-chat/internal/domain"
    "github.com/yourusername/mvp-chat/internal/usecase"
)

type MockWorkspaceRepo struct{ mock.Mock }
func (m *MockWorkspaceRepo) Create(ctx context.Context, w *domain.Workspace) error {
    return m.Called(ctx, w).Error(0)
}
func (m *MockWorkspaceRepo) GetByBuID(ctx context.Context, buID uuid.UUID) (*domain.Workspace, error) {
    args := m.Called(ctx, buID)
    return args.Get(0).(*domain.Workspace), args.Error(1)
}
func (m *MockWorkspaceRepo) GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
    args := m.Called(ctx, id)
    return args.Get(0).(*domain.Workspace), args.Error(1)
}

type MockMemberRepo struct{ mock.Mock }
func (m *MockMemberRepo) Add(ctx context.Context, mem *domain.WorkspaceMember) error {
    return m.Called(ctx, mem).Error(0)
}
func (m *MockMemberRepo) Remove(ctx context.Context, wsID, userID uuid.UUID) error {
    return m.Called(ctx, wsID, userID).Error(0)
}
func (m *MockMemberRepo) ListByWorkspace(ctx context.Context, wsID uuid.UUID) ([]*domain.WorkspaceMember, error) {
    args := m.Called(ctx, wsID)
    return args.Get(0).([]*domain.WorkspaceMember), args.Error(1)
}

func TestProvisionWorkspace(t *testing.T) {
    wsRepo := new(MockWorkspaceRepo)
    memRepo := new(MockMemberRepo)

    buID := uuid.New()
    ownerID := uuid.New()

    wsRepo.On("Create", mock.Anything, mock.MatchedBy(func(w *domain.Workspace) bool {
        return w.BuID == buID
    })).Return(nil)
    memRepo.On("Add", mock.Anything, mock.MatchedBy(func(m *domain.WorkspaceMember) bool {
        return m.UserID == ownerID && m.Role == domain.RoleAdmin
    })).Return(nil)

    uc := usecase.NewWorkspaceUseCase(wsRepo, memRepo)
    err := uc.Provision(context.Background(), buID, "Default", ownerID)

    assert.NoError(t, err)
    wsRepo.AssertExpectations(t)
    memRepo.AssertExpectations(t)
}
```

**Step 2: Run to confirm failure**

```bash
cd apps/chat
go test ./internal/usecase/... -v
```
Expected: FAIL — `usecase.NewWorkspaceUseCase` not found.

**Step 3: Implement workspace use case**

```go
// apps/chat/internal/usecase/workspace_usecase.go
package usecase

import (
    "context"
    "time"
    "github.com/google/uuid"
    "github.com/yourusername/mvp-chat/internal/domain"
    "github.com/yourusername/mvp-chat/internal/repository"
)

type WorkspaceUseCase interface {
    Provision(ctx context.Context, buID uuid.UUID, name string, ownerID uuid.UUID) error
    AddMember(ctx context.Context, workspaceID, userID uuid.UUID) error
    RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error
    ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error)
    GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error)
}

type workspaceUseCase struct {
    wsRepo  repository.WorkspaceRepository
    memRepo repository.MemberRepository
}

func NewWorkspaceUseCase(ws repository.WorkspaceRepository, mem repository.MemberRepository) WorkspaceUseCase {
    return &workspaceUseCase{ws, mem}
}

func (uc *workspaceUseCase) Provision(ctx context.Context, buID uuid.UUID, name string, ownerID uuid.UUID) error {
    ws := &domain.Workspace{
        ID: uuid.New(), BuID: buID, Name: name, CreatedAt: time.Now(),
    }
    if err := uc.wsRepo.Create(ctx, ws); err != nil {
        return err
    }
    member := &domain.WorkspaceMember{
        ID: uuid.New(), WorkspaceID: ws.ID,
        UserID: ownerID, Role: domain.RoleAdmin, CreatedAt: time.Now(),
    }
    return uc.memRepo.Add(ctx, member)
}

func (uc *workspaceUseCase) AddMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
    m := &domain.WorkspaceMember{
        ID: uuid.New(), WorkspaceID: workspaceID,
        UserID: userID, Role: domain.RoleMember, CreatedAt: time.Now(),
    }
    return uc.memRepo.Add(ctx, m)
}

func (uc *workspaceUseCase) RemoveMember(ctx context.Context, workspaceID, userID uuid.UUID) error {
    return uc.memRepo.Remove(ctx, workspaceID, userID)
}

func (uc *workspaceUseCase) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]*domain.WorkspaceMember, error) {
    return uc.memRepo.ListByWorkspace(ctx, workspaceID)
}

func (uc *workspaceUseCase) GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
    return uc.wsRepo.GetByID(ctx, id)
}
```

**Step 4: Run tests to confirm pass**

```bash
go test ./internal/usecase/... -v
```
Expected: PASS

**Step 5: Commit**

```bash
cd ../../
git add apps/chat/
git commit -m "feat(chat): implement workspace use case with provisioning logic"
```

---

### Task 17: Echo HTTP handlers

**Files:**
- Create: `apps/chat/internal/delivery/http/workspace_handler.go`
- Create: `apps/chat/internal/delivery/http/router.go`

**Step 1: Write workspace handler**

```go
// apps/chat/internal/delivery/http/workspace_handler.go
package http

import (
    "net/http"
    "github.com/google/uuid"
    "github.com/labstack/echo/v4"
    "github.com/yourusername/mvp-chat/internal/usecase"
)

type WorkspaceHandler struct {
    uc usecase.WorkspaceUseCase
}

func NewWorkspaceHandler(uc usecase.WorkspaceUseCase) *WorkspaceHandler {
    return &WorkspaceHandler{uc}
}

func (h *WorkspaceHandler) GetWorkspace(c echo.Context) error {
    id, err := uuid.Parse(c.Param("id"))
    if err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, "invalid id")
    }
    ws, err := h.uc.GetByID(c.Request().Context(), id)
    if err != nil {
        return echo.NewHTTPError(http.StatusNotFound, "workspace not found")
    }
    return c.JSON(http.StatusOK, ws)
}

func (h *WorkspaceHandler) ListMembers(c echo.Context) error {
    id, _ := uuid.Parse(c.Param("id"))
    members, err := h.uc.ListMembers(c.Request().Context(), id)
    if err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusOK, members)
}

func (h *WorkspaceHandler) AddMember(c echo.Context) error {
    wsID, _ := uuid.Parse(c.Param("id"))
    var req struct { UserID uuid.UUID `json:"user_id"` }
    if err := c.Bind(&req); err != nil {
        return echo.NewHTTPError(http.StatusBadRequest, err.Error())
    }
    if err := h.uc.AddMember(c.Request().Context(), wsID, req.UserID); err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.JSON(http.StatusCreated, map[string]string{"status": "added"})
}

func (h *WorkspaceHandler) RemoveMember(c echo.Context) error {
    wsID, _ := uuid.Parse(c.Param("id"))
    userID, _ := uuid.Parse(c.Param("uid"))
    if err := h.uc.RemoveMember(c.Request().Context(), wsID, userID); err != nil {
        return echo.NewHTTPError(http.StatusInternalServerError, err.Error())
    }
    return c.NoContent(http.StatusNoContent)
}
```

**Step 2: Write router**

```go
// apps/chat/internal/delivery/http/router.go
package http

import "github.com/labstack/echo/v4"

func RegisterRoutes(e *echo.Echo, wh *WorkspaceHandler) {
    api := e.Group("/api")
    ws := api.Group("/workspaces")
    ws.GET("/:id", wh.GetWorkspace)
    ws.GET("/:id/members", wh.ListMembers)
    ws.POST("/:id/members", wh.AddMember)
    ws.DELETE("/:id/members/:uid", wh.RemoveMember)
}
```

**Step 3: Wire into main.go**

```go
// Update cmd/server/main.go to:
// 1. Connect to PostgreSQL (pgxpool)
// 2. Create repos, use case, handler
// 3. RegisterRoutes(e, handler)
// 4. Start NATS consumer (next task)
```

**Step 4: Commit**

```bash
git add apps/chat/
git commit -m "feat(chat): add Echo HTTP handlers and router"
```

---

### Task 18: NATS JetStream consumer

**Files:**
- Create: `apps/chat/internal/infrastructure/nats/consumer.go`

**Step 1: Write consumer**

```go
// apps/chat/internal/infrastructure/nats/consumer.go
package nats

import (
    "context"
    "encoding/json"
    "log"
    "github.com/google/uuid"
    "github.com/nats-io/nats.go"
    "github.com/nats-io/nats.go/jetstream"
    "github.com/yourusername/mvp-chat/internal/usecase"
)

type BuCreatedEvent struct {
    BuID        uuid.UUID `json:"bu_id"`
    BuName      string    `json:"bu_name"`
    OwnerUserID uuid.UUID `json:"owner_user_id"`
    CompanyID   uuid.UUID `json:"company_id"`
}

func StartConsumer(ctx context.Context, natsURL string, uc usecase.WorkspaceUseCase) error {
    nc, err := nats.Connect(natsURL)
    if err != nil {
        return err
    }

    js, err := jetstream.New(nc)
    if err != nil {
        return err
    }

    // Ensure stream exists (idempotent)
    _, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
        Name:      "PLATFORM_EVENTS",
        Subjects:  []string{"bu.*"},
        Retention: jetstream.WorkQueuePolicy,
    })
    if err != nil {
        return err
    }

    cons, err := js.CreateOrUpdateConsumer(ctx, "PLATFORM_EVENTS", jetstream.ConsumerConfig{
        Durable:   "chat-service",
        AckPolicy: jetstream.AckExplicitPolicy,
    })
    if err != nil {
        return err
    }

    _, err = cons.Consume(func(msg jetstream.Msg) {
        var event BuCreatedEvent
        if err := json.Unmarshal(msg.Data(), &event); err != nil {
            log.Printf("invalid message: %v", err)
            msg.Nak()
            return
        }
        if err := uc.Provision(ctx, event.BuID, event.BuName, event.OwnerUserID); err != nil {
            log.Printf("provision failed: %v", err)
            msg.Nak()
            return
        }
        msg.Ack()
        log.Printf("provisioned workspace for BU %s", event.BuID)
    })

    return err
}
```

**Step 2: Call StartConsumer in main.go**

```go
// In main.go after wiring repos and use case:
natsURL := os.Getenv("NATS_URL")
if natsURL == "" { natsURL = "nats://nats:4222" }
go func() {
    if err := natsinf.StartConsumer(context.Background(), natsURL, wsUseCase); err != nil {
        log.Fatalf("NATS consumer failed: %v", err)
    }
}()
```

**Step 3: Commit**

```bash
git add apps/chat/
git commit -m "feat(chat): add NATS JetStream consumer for bu.created events"
```

---

## Phase 3: Next.js Frontend

### Task 19: Scaffold Next.js project

**Step 1: Create Next.js app with Bun**

```bash
cd apps
bunx create-next-app@latest web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```

**Step 2: Install additional packages**

```bash
cd web
bun add react-hook-form zod zustand axios \
  @tanstack/react-query @tanstack/react-table \
  sweetalert2 @hookform/resolvers
bun add -d prettier eslint-config-prettier
```

**Step 3: Clean up default Next.js boilerplate**

- Remove content from `src/app/page.tsx` (replace with a redirect to `/login`)
- Remove `src/app/globals.css` default styles (keep Tailwind directives only)

**Step 4: Configure Prettier**

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

**Step 5: Commit**

```bash
cd ../../
git add apps/web/
git commit -m "chore(web): scaffold Next.js 16 app with Bun and required dependencies"
```

---

### Task 20: Zustand auth store + Axios API client

**Files:**
- Create: `apps/web/src/stores/authStore.ts`
- Create: `apps/web/src/lib/api.ts`

**Step 1: Write auth store**

```typescript
// apps/web/src/stores/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  userId: string | null;
  role: string | null;
  companyId: string | null;
  mustChangePassword: boolean;
  setAuth: (userId: string, role: string, mustChangePassword: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      role: null,
      companyId: null,
      mustChangePassword: false,
      setAuth: (userId, role, mustChangePassword) =>
        set({ userId, role, mustChangePassword }),
      clearAuth: () =>
        set({ userId: null, role: null, companyId: null, mustChangePassword: false }),
    }),
    { name: 'auth-store' }
  )
);
```

**Step 2: Write Axios API client**

```typescript
// apps/web/src/lib/api.ts
import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',  // routes to Next.js BFF proxy
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);
```

**Step 3: Set up TanStack Query provider**

```typescript
// apps/web/src/providers/QueryProvider.tsx
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// Wrap in src/app/layout.tsx
```

**Step 4: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add Zustand auth store, Axios client, and TanStack Query provider"
```

---

### Task 21: Next.js BFF proxy route handler

**Files:**
- Create: `apps/web/src/app/api/[...path]/route.ts`

**Step 1: Write the catch-all proxy**

```typescript
// apps/web/src/app/api/[...path]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

const API_BASE = process.env.API_URL ?? 'http://api:5000';

async function proxy(req: NextRequest, params: { path: string[] }) {
  const path = params.path.join('/');
  const url = `${API_BASE}/api/${path}${req.nextUrl.search}`;

  const token = req.cookies.get('auth_token')?.value;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const body = ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await req.text();

    const response = await axios({
      method: req.method,
      url,
      headers,
      data: body,
      validateStatus: () => true,
    });

    const res = NextResponse.json(response.data, { status: response.status });

    // Forward Set-Cookie headers (for login)
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      cookies.forEach((c) => res.headers.append('Set-Cookie', c));
    }

    return res;
  } catch (err) {
    return NextResponse.json({ error: 'Upstream error' }, { status: 502 });
  }
}

export const GET = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
export const POST = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
export const PUT = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
export const DELETE = (req: NextRequest, { params }: { params: { path: string[] } }) =>
  proxy(req, params);
```

**Step 2: Add API_URL to .env.local**

```bash
# apps/web/.env.local
API_URL=http://localhost:5000
```

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add BFF proxy route handler for .NET API"
```

---

### Task 22: Onboarding page

**Files:**
- Create: `apps/web/src/app/(public)/onboard/page.tsx`
- Create: `apps/web/src/app/(public)/layout.tsx`

**Step 1: Write Zod schema**

```typescript
// apps/web/src/schemas/onboard.schema.ts
import { z } from 'zod';
export const onboardSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200),
  address: z.string().min(1, 'Address is required').max(500),
  contactNumber: z.string().min(1, 'Contact number is required').max(20),
});
export type OnboardFormData = z.infer<typeof onboardSchema>;
```

**Step 2: Write onboarding page**

```typescript
// apps/web/src/app/(public)/onboard/page.tsx
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { onboardSchema, OnboardFormData } from '@/schemas/onboard.schema';

export default function OnboardPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<OnboardFormData>({
    resolver: zodResolver(onboardSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: OnboardFormData) =>
      api.post('/companies/onboard', {
        companyName: data.companyName,
        address: data.address,
        contactNumber: data.contactNumber,
      }),
    onSuccess: (res) => {
      Swal.fire({
        title: 'Company registered!',
        html: `Your login credentials:<br><b>Username:</b> ${res.data.username}<br><b>Password:</b> ${res.data.defaultPassword}`,
        icon: 'success',
        confirmButtonText: 'Go to Login',
      }).then(() => router.push('/login'));
    },
    onError: () => {
      Swal.fire('Error', 'Onboarding failed. Please try again.', 'error');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-4"
      >
        <h1 className="text-2xl font-bold text-gray-800">Register Your Company</h1>

        <div>
          <label className="block text-sm font-medium text-gray-700">Company Name</label>
          <input {...register('companyName')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.companyName && <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <textarea {...register('address')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Contact Number</label>
          <input {...register('contactNumber')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {errors.contactNumber && <p className="text-red-500 text-xs mt-1">{errors.contactNumber.message}</p>}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Registering...' : 'Register Company'}
        </button>
      </form>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add company onboarding page with form validation"
```

---

### Task 23: Login page

**Files:**
- Create: `apps/web/src/app/(public)/login/page.tsx`
- Create: `apps/web/src/schemas/login.schema.ts`

**Step 1: Write login schema and page (follow onboard pattern)**

```typescript
// login.schema.ts
export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// login/page.tsx
// POST /auth/login → store userId + role in Zustand
// If mustChangePassword → redirect to /change-password
// Else → redirect to /dashboard
```

**Step 2: Write change-password page**

```typescript
// apps/web/src/app/(public)/change-password/page.tsx
// Simple form: new password + confirm
// POST /auth/change-password
// On success → redirect to /dashboard
```

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add login and change-password pages"
```

---

### Task 24: Auth layout + Dashboard

**Files:**
- Create: `apps/web/src/app/(auth)/layout.tsx`
- Create: `apps/web/src/app/(auth)/dashboard/page.tsx`
- Create: `apps/web/src/components/Sidebar.tsx`
- Create: `apps/web/src/middleware.ts`

**Step 1: Write Next.js middleware for route protection**

```typescript
// apps/web/src/middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/onboard', '/change-password'];

export function middleware(req: NextRequest) {
  const token = req.cookies.get('auth_token');
  const isPublic = PUBLIC_PATHS.some(p => req.nextUrl.pathname.startsWith(p));

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (token && req.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**Step 2: Write Sidebar component**

```typescript
// Sidebar with nav links: Dashboard, Staff, Business Units, Chat Permissions
// Show/hide Chat Permissions based on role === 'Owner' from Zustand
```

**Step 3: Write auth layout**

```typescript
// (auth)/layout.tsx — renders Sidebar + main content area
```

**Step 4: Write dashboard page**

```typescript
// Simple welcome page showing company info and quick stats
```

**Step 5: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add auth layout, sidebar navigation, and dashboard"
```

---

### Task 25: Business Units pages

**Files:**
- Create: `apps/web/src/app/(auth)/business-units/page.tsx`
- Create: `apps/web/src/app/(auth)/business-units/new/page.tsx`

**Step 1: BU list page (TanStack Table)**

```typescript
// GET /business-units via TanStack Query
// Render with useReactTable (columns: Name, Is Default, Created At, Actions)
```

**Step 2: Create BU page**

```typescript
// Form: name only
// POST /business-units
// On success: SweetAlert2 confirm → redirect to /business-units
```

**Step 3: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add business units list and create pages"
```

---

### Task 26: Staff pages

**Files:**
- Create: `apps/web/src/app/(auth)/staff/page.tsx`
- Create: `apps/web/src/app/(auth)/staff/new/page.tsx`
- Create: `apps/web/src/app/(auth)/staff/[id]/page.tsx`

**Step 1: Staff list (TanStack Table)**

```typescript
// Columns: Full Name, Role, BUs (count), Actions
// TanStack Table with sorting
```

**Step 2: Create staff page (Owner only)**

```typescript
// Fields: First Name, Last Name, Role (select: Admin|Staff), BU (select), Email (BU-scoped)
// POST /staff
// Zod validation
```

**Step 3: Staff detail page (tabs)**

```typescript
// Tab 1: Global Profile (first name, last name) — editable
// Tab 2: BU-Scoped Data — table of BUs with email per BU, editable
```

**Step 4: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add staff list, create, and detail pages"
```

---

### Task 27: Chat Permissions page

**Files:**
- Create: `apps/web/src/app/(auth)/chat-permissions/[buId]/page.tsx`

**Step 1: Write the page**

```typescript
// Show: BU selector, then table of staff with toggle (has access / no access)
// GET /chat-permissions/bu/:buId — list who has access
// POST /chat-permissions { staffId, buId } — grant
// DELETE /chat-permissions/:id — revoke
// SweetAlert2 confirmation before revoke
// Show only to Owner role (guard in layout)
```

**Step 2: Commit**

```bash
git add apps/web/
git commit -m "feat(web): add chat permissions management page (Owner only)"
```

---

## Phase 4: Infrastructure

### Task 28: Dockerfiles

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `apps/chat/Dockerfile`
- Create: `apps/web/Dockerfile`

**Step 1: .NET Dockerfile**

```dockerfile
# apps/api/Dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["Api/Api.csproj", "Api/"]
RUN dotnet restore "Api/Api.csproj"
COPY . .
RUN dotnet publish "Api/Api.csproj" -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000
ENTRYPOINT ["dotnet", "Api.dll"]
```

**Step 2: Go Dockerfile**

```dockerfile
# apps/chat/Dockerfile
FROM golang:1.25-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /chat-service ./cmd/server/

FROM alpine:3.19 AS final
WORKDIR /app
COPY --from=build /chat-service .
EXPOSE 8080
ENTRYPOINT ["./chat-service"]
```

**Step 3: Next.js Dockerfile**

```dockerfile
# apps/web/Dockerfile
FROM oven/bun:latest AS deps
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

FROM oven/bun:latest AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM oven/bun:latest AS final
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["bun", "server.js"]
```

> Add `output: 'standalone'` to `next.config.ts` for the standalone build to work.

**Step 4: Commit**

```bash
git add apps/
git commit -m "chore: add Dockerfiles for api, chat, and web services"
```

---

### Task 29: docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

**Step 1: Write docker-compose.yml**

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: mvp
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  nats:
    image: nats:latest
    command: ["-c", "/etc/nats/nats-server.conf"]
    ports:
      - "4222:4222"
      - "8222:8222"
    volumes:
      - ./infra/nats/nats-server.conf:/etc/nats/nats-server.conf
      - nats_data:/data/jetstream

  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - "5000:5000"
    environment:
      ConnectionStrings__Postgres: "Host=postgres;Port=5432;Database=mvp;Username=postgres;Password=postgres"
      Jwt__Secret: "super-secret-key-at-least-32-chars-long!!"
      Jwt__Issuer: "mvp-api"
      Jwt__Audience: "mvp-web"
      Nats__Url: "nats://nats:4222"
      ASPNETCORE_ENVIRONMENT: Production
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_started

  chat:
    build:
      context: ./apps/chat
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: "postgres://postgres:postgres@postgres:5432/mvp"
      NATS_URL: "nats://nats:4222"
      PORT: "8080"
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_started

  web:
    build:
      context: ./apps/web
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      API_URL: "http://api:5000"
      NODE_ENV: production
    depends_on:
      - api

volumes:
  postgres_data:
  nats_data:
```

**Step 2: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker-compose.yml for full-stack local deployment"
```

---

### Task 30: README.md

**Files:**
- Create: `README.md`

**Step 1: Write README**

```markdown
# MVP B2B Multi-Tenant SaaS Platform

## Quick Start

\`\`\`bash
docker-compose up --build
\`\`\`

| Service | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (.NET) | http://localhost:5000 |
| Chat (Go) | http://localhost:8080 |
| NATS Monitor | http://localhost:8222 |
| PostgreSQL | localhost:5432 |

## Architecture

See [docs/plans/2026-03-01-mvp-saas-platform-design.md](docs/plans/2026-03-01-mvp-saas-platform-design.md)

## Key Decisions

- **Multi-tenancy:** Row-level isolation via `company_id` on all tenant tables
- **Events:** NATS JetStream (`bu.created`) for async workspace provisioning
- **Auth:** JWT in httpOnly cookie, claims include `company_id` and `role`
- **Architecture:** .NET VSA+CQRS, Go Clean Architecture, Next.js App Router BFF

## Assumptions

1. Default password returned in onboarding response (no email service)
2. Chat service is internal — no direct frontend access
3. JWT expiry: 24h, no refresh token in MVP scope
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with quick start and architecture overview"
```

---

## Final Checklist

- [ ] `docker-compose up --build` starts all 5 containers
- [ ] POST `/api/companies/onboard` creates company + BU + Owner + triggers NATS event
- [ ] Go chat service receives `bu.created` and provisions workspace with owner as admin
- [ ] POST `/api/auth/login` returns JWT cookie
- [ ] Protected routes return 401 without cookie
- [ ] Owner can create staff, assign BU-scoped emails
- [ ] Owner can grant/revoke chat access per BU
- [ ] All .NET tests pass: `dotnet test apps/api/Api.Tests`
- [ ] All Go tests pass: `go test ./... ` in `apps/chat`
