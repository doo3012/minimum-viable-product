# Platform Updates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add RabbitMQ with Outbox Pattern, real-time WebSocket chat, localized role-binding authorization, and a dynamic role-based UI shell to the existing B2B Multi-Tenant SaaS MVP.

**Architecture:** Bottom-up infrastructure-first approach. RabbitMQ+Outbox replaces NATS as the active event bus. Role-binding adds a `role` column to `staff_bu` for localized authorization. Go chat service gains WebSocket hub and message persistence. Frontend is rebuilt with BU-scoped URL routing and dynamic sidebar.

**Tech Stack:** .NET 10 (MassTransit, EF Core Outbox), Go 1.25 (amqp091-go, gorilla/websocket, pgx), Next.js 16 + React 19 (Zustand, TanStack Query, Tailwind v4), RabbitMQ 3, PostgreSQL 16.

**Design doc:** `docs/plans/2026-03-03-platform-updates-design.md`

---

## Feature 1: RabbitMQ + Outbox Pattern

### Task 1.1: Add RabbitMQ to Docker Compose

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add RabbitMQ service and volume**

Add the `rabbitmq` service after the `nats` service block:

```yaml
  rabbitmq:
    image: rabbitmq:3-management
    environment:
      RABBITMQ_DEFAULT_USER: guest
      RABBITMQ_DEFAULT_PASS: guest
    ports:
      - "5672:5672"
      - "15672:15672"
    volumes:
      - rabbitmq_data:/var/lib/rabbitmq
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]
      interval: 10s
      timeout: 5s
      retries: 5
```

Add `rabbitmq_data:` to the `volumes:` section at the bottom.

Add `rabbitmq` dependency to the `api` service:

```yaml
  api:
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_started
      rabbitmq:
        condition: service_healthy
```

Add `rabbitmq` dependency to the `chat` service:

```yaml
  chat:
    depends_on:
      postgres:
        condition: service_healthy
      nats:
        condition: service_started
      rabbitmq:
        condition: service_healthy
```

Add RabbitMQ env vars to `api` service:

```yaml
      RabbitMQ__Host: "rabbitmq"
      RabbitMQ__Username: "guest"
      RabbitMQ__Password: "guest"
```

Add RabbitMQ env var to `chat` service:

```yaml
      RABBITMQ_URL: "amqp://guest:guest@rabbitmq:5672/"
```

**Step 2: Verify RabbitMQ starts**

Run: `docker-compose up -d rabbitmq`
Expected: RabbitMQ starts, management UI accessible at http://localhost:15672

**Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: add RabbitMQ service to docker-compose"
```

---

### Task 1.2: Add MassTransit + Outbox to .NET API

**Files:**
- Modify: `apps/api/Api/Api.csproj`
- Modify: `apps/api/Api/Program.cs`
- Modify: `apps/api/Api/Infrastructure/Persistence/AppDbContext.cs`
- Create: `apps/api/Api/Infrastructure/Messaging/Events/BusinessUnitCreated.cs`

**Step 1: Add NuGet packages**

Run from `apps/api/Api/`:
```bash
dotnet add package MassTransit
dotnet add package MassTransit.RabbitMQ
dotnet add package MassTransit.EntityFrameworkCore
```

**Step 2: Create the shared event contract**

Create `apps/api/Api/Infrastructure/Messaging/Events/BusinessUnitCreated.cs`:

```csharp
namespace Api.Infrastructure.Messaging.Events;

public record BusinessUnitCreated(
    Guid BuId,
    string BuName,
    Guid OwnerUserId,
    Guid CompanyId);
```

**Step 3: Update AppDbContext for MassTransit Outbox**

In `apps/api/Api/Infrastructure/Persistence/AppDbContext.cs`, add MassTransit outbox entity mappings. The DbContext must implement the outbox pattern by adding `AddTransactionalOutboxEntities()`:

```csharp
using Api.Infrastructure.Persistence.Entities;
using MassTransit;
using Microsoft.EntityFrameworkCore;

namespace Api.Infrastructure.Persistence;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
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
            e.HasOne(s => s.User).WithMany().HasForeignKey(s => s.UserId);
            e.HasMany(s => s.StaffBus).WithOne().HasForeignKey(sb => sb.StaffId);
        });
        modelBuilder.Entity<StaffBu>(e => {
            e.ToTable("staff_bu");
            e.HasOne(sb => sb.Bu).WithMany().HasForeignKey(sb => sb.BuId);
        });
        modelBuilder.Entity<ChatPermission>(e => e.ToTable("chat_permissions"));

        // MassTransit Outbox tables
        modelBuilder.AddTransactionalOutboxEntities();
    }
}
```

**Step 4: Configure MassTransit in Program.cs**

Replace NATS registration and add MassTransit. In `apps/api/Api/Program.cs`:

Keep the existing `INatsPublisher` registration (dormant) but add MassTransit configuration after it:

```csharp
// MassTransit with RabbitMQ + EF Core Outbox
builder.Services.AddMassTransit(x =>
{
    x.AddEntityFrameworkOutbox<AppDbContext>(o =>
    {
        o.UsePostgres();
        o.UseBusOutbox();
    });

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host(builder.Configuration["RabbitMQ:Host"] ?? "rabbitmq", "/", h =>
        {
            h.Username(builder.Configuration["RabbitMQ:Username"] ?? "guest");
            h.Password(builder.Configuration["RabbitMQ:Password"] ?? "guest");
        });
        cfg.ConfigureEndpoints(context);
    });
});
```

Remove the `await NatsStreamBootstrap.EnsureStreamAsync(app.Configuration);` line at the bottom (NATS bootstrap no longer needed as active path).

**Step 5: Run build to verify compilation**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add apps/api/
git commit -m "feat(api): add MassTransit with RabbitMQ transport and EF Core Outbox"
```

---

### Task 1.3: Migrate Event Publishing to MassTransit

**Files:**
- Modify: `apps/api/Api/Features/Companies/Onboard/OnboardHandler.cs`
- Modify: `apps/api/Api/Features/BusinessUnits/Create/CreateBuHandler.cs`

**Step 1: Update OnboardHandler to publish via MassTransit**

In `OnboardHandler.cs`, replace the NATS publish call with MassTransit. The handler needs `IPublishEndpoint` injected. Replace:

```csharp
await nats.PublishAsync("bu.created", new { ... }, ct);
```

With:

```csharp
await publishEndpoint.Publish(new BusinessUnitCreated(
    bu.Id, bu.Name, user.Id, company.Id), ct);
```

The constructor needs `IPublishEndpoint publishEndpoint` instead of (or in addition to) `INatsPublisher nats`. Remove the nats dependency if it's the only usage.

**Step 2: Update CreateBuHandler to publish via MassTransit**

Same pattern — replace NATS publish with `IPublishEndpoint.Publish<BusinessUnitCreated>()`.

**Step 3: Build and verify**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 4: Commit**

```bash
git add apps/api/Api/Features/
git commit -m "feat(api): migrate event publishing from NATS to MassTransit Outbox"
```

---

### Task 1.4: Add RabbitMQ Consumer to Go Chat Service

**Files:**
- Modify: `apps/chat/go.mod`
- Create: `apps/chat/internal/infrastructure/rabbitmq/consumer.go`
- Modify: `apps/chat/cmd/server/main.go`
- Create: `apps/chat/.env.local` (update)

**Step 1: Add amqp091-go dependency**

Run from `apps/chat/`:
```bash
go get github.com/rabbitmq/amqp091-go
```

**Step 2: Create RabbitMQ consumer**

Create `apps/chat/internal/infrastructure/rabbitmq/consumer.go`:

```go
package rabbitmq

import (
	"context"
	"encoding/json"
	"log"

	"github.com/google/uuid"
	amqp "github.com/rabbitmq/amqp091-go"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

type BuCreatedEvent struct {
	BuId        uuid.UUID `json:"buId"`
	BuName      string    `json:"buName"`
	OwnerUserId uuid.UUID `json:"ownerUserId"`
	CompanyId   uuid.UUID `json:"companyId"`
}

// MassTransit wraps messages in an envelope
type MassTransitEnvelope struct {
	Message json.RawMessage `json:"message"`
}

func StartConsumer(url string, uc *usecase.WorkspaceUseCase) {
	conn, err := amqp.Dial(url)
	if err != nil {
		log.Fatalf("rabbitmq: failed to connect: %v", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("rabbitmq: failed to open channel: %v", err)
	}

	// Declare exchange matching MassTransit convention
	exchangeName := "Api.Infrastructure.Messaging.Events:BusinessUnitCreated"
	err = ch.ExchangeDeclare(exchangeName, "fanout", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to declare exchange: %v", err)
	}

	q, err := ch.QueueDeclare("chat-service-bu-created", true, false, false, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to declare queue: %v", err)
	}

	err = ch.QueueBind(q.Name, "", exchangeName, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to bind queue: %v", err)
	}

	msgs, err := ch.Consume(q.Name, "chat-service", false, false, false, false, nil)
	if err != nil {
		log.Fatalf("rabbitmq: failed to consume: %v", err)
	}

	log.Println("rabbitmq: consumer started, waiting for messages...")

	go func() {
		for d := range msgs {
			var envelope MassTransitEnvelope
			if err := json.Unmarshal(d.Body, &envelope); err != nil {
				log.Printf("rabbitmq: unmarshal envelope error: %v", err)
				d.Nack(false, false)
				continue
			}

			var evt BuCreatedEvent
			if err := json.Unmarshal(envelope.Message, &evt); err != nil {
				log.Printf("rabbitmq: unmarshal event error: %v", err)
				d.Nack(false, false)
				continue
			}

			log.Printf("rabbitmq: received BuCreated event: bu_id=%s, bu_name=%s", evt.BuId, evt.BuName)

			if err := uc.Provision(context.Background(), evt.BuId, evt.BuName, evt.OwnerUserId); err != nil {
				log.Printf("rabbitmq: provision error: %v", err)
				d.Nack(false, true) // requeue
				continue
			}

			d.Ack(false)
			log.Printf("rabbitmq: provisioned workspace for BU %s", evt.BuId)
		}
	}()
}
```

**Note on MassTransit message format:** MassTransit wraps published messages in an envelope with `message`, `messageType`, `headers` etc. The `message` field contains the actual event payload. The field names use camelCase by default. The exchange name follows the convention `Namespace:MessageType`. You may need to adjust the exchange name based on actual MassTransit behavior — check RabbitMQ management UI after first publish to see exact exchange name.

**Step 3: Update main.go to start RabbitMQ consumer instead of NATS**

In `apps/chat/cmd/server/main.go`, comment out or remove the NATS consumer goroutine start, and add:

```go
import "github.com/trainheartnet/mvp-chat/internal/infrastructure/rabbitmq"

// Replace NATS consumer start with:
rabbitmqURL := os.Getenv("RABBITMQ_URL")
if rabbitmqURL == "" {
    rabbitmqURL = "amqp://guest:guest@rabbitmq:5672/"
}
rabbitmq.StartConsumer(rabbitmqURL, wsUseCase)
```

Keep the NATS import and code in consumer.go but don't call `StartConsumer` for NATS.

**Step 4: Update .env.local**

Add to `apps/chat/.env.local`:
```
RABBITMQ_URL=amqp://guest:guest@localhost:5672/
```

**Step 5: Build and verify**

Run: `cd apps/chat && go build ./...`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add apps/chat/
git commit -m "feat(chat): add RabbitMQ consumer, switch from NATS to RabbitMQ for event consumption"
```

---

### Task 1.5: Integration Test — Full Event Flow

**Step 1: Start all services**

Run: `docker-compose up --build`

**Step 2: Test the flow**

1. Call the onboard endpoint to create a company (this publishes `BusinessUnitCreated` via MassTransit Outbox → RabbitMQ)
2. Check RabbitMQ management UI at http://localhost:15672 — verify the exchange and queue exist
3. Check Go chat service logs — should show "provisioned workspace for BU ..."
4. Verify workspace exists in `chat.workspaces` table

Run:
```bash
curl -X POST http://localhost:5000/api/companies/onboard \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Test Co","address":"123 St","contactNumber":"555-0100"}'
```

Then check:
```bash
docker-compose exec postgres psql -U postgres -d mvp -c "SELECT * FROM chat.workspaces;"
```

Expected: A workspace row matching the created BU.

**Step 3: Commit (if any adjustments needed)**

```bash
git commit -am "fix: adjust RabbitMQ integration after testing"
```

---

## Feature 3: Role-Binding Authorization Strategy

### Task 3.1: Database Schema Migration — Add Role to staff_bu

**Files:**
- Modify: `infra/postgres/init.sql`

**Step 1: Add role column to staff_bu table**

In `infra/postgres/init.sql`, update the `staff_bu` CREATE TABLE:

```sql
CREATE TABLE IF NOT EXISTS main.staff_bu (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id   UUID NOT NULL REFERENCES main.staff_profiles(id) ON DELETE CASCADE,
  bu_id      UUID NOT NULL REFERENCES main.business_units(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'Staff' CHECK (role IN ('Admin','Staff')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, bu_id)
);
```

**Step 2: Commit**

```bash
git add infra/postgres/init.sql
git commit -m "schema: add role column to staff_bu for localized role-binding"
```

---

### Task 3.2: Update .NET Entity and DbContext

**Files:**
- Modify: `apps/api/Api/Infrastructure/Persistence/Entities/StaffBu.cs`

**Step 1: Add Role property to StaffBu entity**

```csharp
namespace Api.Infrastructure.Persistence.Entities;

public class StaffBu
{
    public Guid Id { get; set; }
    public Guid StaffId { get; set; }
    public Guid BuId { get; set; }
    public string Email { get; set; } = "";
    public string Role { get; set; } = "Staff";
    public DateTime CreatedAt { get; set; }
    public BusinessUnit Bu { get; set; } = null!;
}
```

**Step 2: Build**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 3: Commit**

```bash
git add apps/api/Api/Infrastructure/Persistence/Entities/StaffBu.cs
git commit -m "feat(api): add Role property to StaffBu entity"
```

---

### Task 3.3: Update JWT Claims — Rename role to global_role

**Files:**
- Modify: `apps/api/Api/Common/Jwt/JwtService.cs`
- Modify: `apps/api/Api/Features/Auth/Login/LoginHandler.cs`

**Step 1: Update JwtService to emit global_role claim**

In `JwtService.cs`, change the claim name:

```csharp
var claims = new[]
{
    new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
    new Claim("company_id", companyId.ToString()),
    new Claim("global_role", role == "Owner" ? "Owner" : "User"),
};
```

**Step 2: Update LoginHandler response**

The login response should still include the original role for the frontend. Verify that `LoginHandler.cs` returns `role` from the `users` table in the response body (it should already do this).

**Step 3: Build**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 4: Commit**

```bash
git add apps/api/Api/Common/Jwt/JwtService.cs apps/api/Api/Features/Auth/Login/LoginHandler.cs
git commit -m "feat(api): update JWT claims to use global_role (Owner/User)"
```

---

### Task 3.4: Update AuthorizeBehavior for Localized Role Resolution

**Files:**
- Modify: `apps/api/Api/Common/Behaviors/AuthorizeBehavior.cs`
- Modify: `apps/api/Api/Common/Interfaces/IAuthorizeRole.cs`
- Create: `apps/api/Api/Common/Interfaces/IBuScoped.cs`

**Step 1: Create IBuScoped interface**

Create `apps/api/Api/Common/Interfaces/IBuScoped.cs`:

```csharp
namespace Api.Common.Interfaces;

public interface IBuScoped
{
    Guid BuId { get; }
}
```

**Step 2: Update AuthorizeBehavior**

Replace the current `AuthorizeBehavior.cs`:

```csharp
using Api.Common.Exceptions;
using Api.Common.Interfaces;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Common.Behaviors;

public class AuthorizeBehavior<TRequest, TResponse>(
    IHttpContextAccessor httpContextAccessor,
    AppDbContext db)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IAuthorizeRole
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var globalRole = httpContextAccessor.HttpContext?.User
            .FindFirst("global_role")?.Value;

        // Owner bypasses all checks
        if (globalRole == "Owner")
            return await next();

        // For non-Owner users, resolve BU-scoped role if the request is BU-scoped
        if (request is IBuScoped buScoped)
        {
            var userId = httpContextAccessor.HttpContext?.User
                .FindFirst("sub")?.Value;

            if (userId == null)
                throw new ForbiddenException();

            var userGuid = Guid.Parse(userId);

            // Look up the user's role in this specific BU
            var staffBu = await db.StaffBus
                .Include(sb => sb.Bu)
                .Where(sb => sb.BuId == buScoped.BuId)
                .Join(db.StaffProfiles.IgnoreQueryFilters(),
                    sb => sb.StaffId,
                    sp => sp.Id,
                    (sb, sp) => new { sb.Role, sp.UserId })
                .FirstOrDefaultAsync(x => x.UserId == userGuid, cancellationToken);

            if (staffBu == null || !request.AllowedRoles.Contains(staffBu.Role))
                throw new ForbiddenException();
        }
        else
        {
            // Non-BU-scoped request — check if global_role suffices
            if (globalRole == null || !request.AllowedRoles.Contains(globalRole))
                throw new ForbiddenException();
        }

        return await next();
    }
}
```

**Step 3: Build**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 4: Commit**

```bash
git add apps/api/Api/Common/
git commit -m "feat(api): update AuthorizeBehavior for localized role resolution with IBuScoped"
```

---

### Task 3.5: Update Staff Creation to Include BU Role

**Files:**
- Modify: `apps/api/Api/Features/Staff/Create/CreateStaffCommand.cs`
- Modify: `apps/api/Api/Features/Staff/Create/CreateStaffHandler.cs`

**Step 1: Update CreateStaffCommand**

Add `BuRole` to the command (the role to assign in this BU):

```csharp
public record CreateStaffCommand(
    string FirstName, string LastName,
    string Role, Guid BuId, string Email,
    string BuRole) : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
```

Note: `AllowedRoles` changed to `["Owner"]` only — per design, only Owner can invite staff globally.

**Step 2: Update CreateStaffHandler**

When creating the `StaffBu` record, set the `Role` field:

```csharp
var staffBu = new StaffBu
{
    StaffId = staff.Id,
    BuId = cmd.BuId,
    Email = cmd.Email,
    Role = cmd.BuRole ?? "Staff",
};
```

**Step 3: Build**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 4: Commit**

```bash
git add apps/api/Api/Features/Staff/Create/
git commit -m "feat(api): include BU role when creating staff"
```

---

### Task 3.6: Add API Endpoint for User's BU Assignments with Roles

**Files:**
- Create: `apps/api/Api/Features/Staff/MyBuAssignments/GetMyBuAssignmentsQuery.cs`
- Create: `apps/api/Api/Features/Staff/MyBuAssignments/GetMyBuAssignmentsHandler.cs`
- Create: `apps/api/Api/Features/Staff/MyBuAssignments/GetMyBuAssignmentsEndpoint.cs`

This endpoint returns the current user's BU list with their role in each BU. The frontend needs this after login to populate the BU switcher and determine sidebar visibility.

**Step 1: Create the query**

`GetMyBuAssignmentsQuery.cs`:

```csharp
using MediatR;

namespace Api.Features.Staff.MyBuAssignments;

public record GetMyBuAssignmentsQuery : IRequest<List<BuAssignmentDto>>;

public record BuAssignmentDto(
    Guid BuId,
    string BuName,
    string Role,
    bool HasChatAccess);
```

**Step 2: Create the handler**

`GetMyBuAssignmentsHandler.cs`:

```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.MyBuAssignments;

public class GetMyBuAssignmentsHandler(
    IHttpContextAccessor httpContextAccessor,
    AppDbContext db) : IRequestHandler<GetMyBuAssignmentsQuery, List<BuAssignmentDto>>
{
    public async Task<List<BuAssignmentDto>> Handle(
        GetMyBuAssignmentsQuery request,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(
            httpContextAccessor.HttpContext!.User.FindFirst("sub")!.Value);
        var globalRole = httpContextAccessor.HttpContext!.User
            .FindFirst("global_role")?.Value;

        // Owner sees all BUs in the company
        if (globalRole == "Owner")
        {
            var companyId = Guid.Parse(
                httpContextAccessor.HttpContext!.User.FindFirst("company_id")!.Value);

            return await db.BusinessUnits
                .Where(bu => bu.CompanyId == companyId)
                .Select(bu => new BuAssignmentDto(
                    bu.Id,
                    bu.Name,
                    "Owner",
                    true)) // Owner always has chat access
                .ToListAsync(cancellationToken);
        }

        // Non-Owner: return only assigned BUs with their localized role
        var staff = await db.StaffProfiles
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == userId, cancellationToken);

        if (staff == null) return [];

        return await db.StaffBus
            .Where(sb => sb.StaffId == staff.Id)
            .Join(db.BusinessUnits.IgnoreQueryFilters(),
                sb => sb.BuId,
                bu => bu.Id,
                (sb, bu) => new { sb, bu })
            .GroupJoin(db.ChatPermissions,
                x => new { x.sb.StaffId, x.sb.BuId },
                cp => new { cp.StaffId, cp.BuId },
                (x, cps) => new { x.sb, x.bu, HasChat = cps.Any() })
            .Select(x => new BuAssignmentDto(
                x.bu.Id,
                x.bu.Name,
                x.sb.Role,
                x.HasChat))
            .ToListAsync(cancellationToken);
    }
}
```

**Step 3: Create the endpoint**

`GetMyBuAssignmentsEndpoint.cs`:

```csharp
using MediatR;

namespace Api.Features.Staff.MyBuAssignments;

public static class GetMyBuAssignmentsEndpoint
{
    public static void MapGetMyBuAssignments(this WebApplication app) =>
        app.MapGet("/api/staff/me/bu-assignments",
            async (IMediator mediator) =>
                Results.Ok(await mediator.Send(new GetMyBuAssignmentsQuery())))
        .RequireAuthorization();
}
```

**Step 4: Register in Program.cs**

Add after `app.MapGetMyProfile();`:

```csharp
app.MapGetMyBuAssignments();
```

Add the using:
```csharp
using Api.Features.Staff.MyBuAssignments;
```

**Step 5: Build**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add apps/api/Api/Features/Staff/MyBuAssignments/ apps/api/Api/Program.cs
git commit -m "feat(api): add GET /api/staff/me/bu-assignments endpoint for BU switcher"
```

---

## Feature 2: Real-Time Chat System

### Task 2.1: Add Messages Table to Schema

**Files:**
- Modify: `infra/postgres/init.sql`

**Step 1: Add messages table after workspace_members**

```sql
CREATE TABLE IF NOT EXISTS chat.messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES chat.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  display_name TEXT NOT NULL,
  content      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_workspace_created
  ON chat.messages(workspace_id, created_at DESC);
```

**Step 2: Commit**

```bash
git add infra/postgres/init.sql
git commit -m "schema: add chat.messages table for message history"
```

---

### Task 2.2: Add Message Domain and Repository in Go

**Files:**
- Create: `apps/chat/internal/domain/message.go`
- Create: `apps/chat/internal/repository/message_repository.go`
- Create: `apps/chat/internal/infrastructure/postgres/message_repo.go`

**Step 1: Create message domain entity**

`apps/chat/internal/domain/message.go`:

```go
package domain

import (
	"time"

	"github.com/google/uuid"
)

type Message struct {
	ID          uuid.UUID
	WorkspaceID uuid.UUID
	UserID      uuid.UUID
	DisplayName string
	Content     string
	CreatedAt   time.Time
}
```

**Step 2: Create message repository interface**

`apps/chat/internal/repository/message_repository.go`:

```go
package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/trainheartnet/mvp-chat/internal/domain"
)

type MessageRepository interface {
	Insert(ctx context.Context, m *domain.Message) error
	ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.Message, error)
}
```

**Step 3: Create postgres message repo implementation**

`apps/chat/internal/infrastructure/postgres/message_repo.go`:

```go
package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
)

type messageRepo struct {
	pool *pgxpool.Pool
}

func NewMessageRepo(pool *pgxpool.Pool) repository.MessageRepository {
	return &messageRepo{pool: pool}
}

func (r *messageRepo) Insert(ctx context.Context, m *domain.Message) error {
	_, err := r.pool.Exec(ctx,
		`INSERT INTO chat.messages (id, workspace_id, user_id, display_name, content, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		m.ID, m.WorkspaceID, m.UserID, m.DisplayName, m.Content, m.CreatedAt)
	return err
}

func (r *messageRepo) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID, limit int) ([]*domain.Message, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, workspace_id, user_id, display_name, content, created_at
		 FROM chat.messages
		 WHERE workspace_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []*domain.Message
	for rows.Next() {
		m := &domain.Message{}
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.DisplayName, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, m)
	}

	// Reverse to get chronological order
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages, nil
}
```

**Step 4: Build**

Run: `cd apps/chat && go build ./...`
Expected: Build succeeded

**Step 5: Commit**

```bash
git add apps/chat/internal/domain/message.go apps/chat/internal/repository/message_repository.go apps/chat/internal/infrastructure/postgres/message_repo.go
git commit -m "feat(chat): add message domain, repository interface, and postgres implementation"
```

---

### Task 2.3: Add Message REST Endpoint in Go

**Files:**
- Create: `apps/chat/internal/usecase/message_usecase.go`
- Create: `apps/chat/internal/delivery/http/message_handler.go`
- Modify: `apps/chat/internal/delivery/http/router.go`

**Step 1: Create message use case**

`apps/chat/internal/usecase/message_usecase.go`:

```go
package usecase

import (
	"context"

	"github.com/google/uuid"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
)

type MessageUseCase struct {
	msgRepo repository.MessageRepository
	wsRepo  repository.WorkspaceRepository
}

func NewMessageUseCase(msgRepo repository.MessageRepository, wsRepo repository.WorkspaceRepository) *MessageUseCase {
	return &MessageUseCase{msgRepo: msgRepo, wsRepo: wsRepo}
}

func (uc *MessageUseCase) GetHistory(ctx context.Context, buID uuid.UUID, limit int) ([]*domain.Message, error) {
	ws, err := uc.wsRepo.GetByBuID(ctx, buID)
	if err != nil {
		return nil, err
	}
	return uc.msgRepo.ListByWorkspace(ctx, ws.ID, limit)
}

func (uc *MessageUseCase) SaveMessage(ctx context.Context, msg *domain.Message) error {
	return uc.msgRepo.Insert(ctx, msg)
}
```

**Step 2: Create message handler**

`apps/chat/internal/delivery/http/message_handler.go`:

```go
package http

import (
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

type MessageHandler struct {
	uc *usecase.MessageUseCase
}

func NewMessageHandler(uc *usecase.MessageUseCase) *MessageHandler {
	return &MessageHandler{uc: uc}
}

func (h *MessageHandler) GetHistory(c echo.Context) error {
	buIDStr := c.Param("buId")
	buID, err := uuid.Parse(buIDStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid bu_id"})
	}

	limitStr := c.QueryParam("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
			limit = l
		}
	}

	messages, err := h.uc.GetHistory(c.Request().Context(), buID, limit)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	if messages == nil {
		messages = []*domain.Message{}
	}

	return c.JSON(http.StatusOK, messages)
}
```

Add the import for domain:
```go
import "github.com/trainheartnet/mvp-chat/internal/domain"
```

**Step 3: Update router to register message routes**

In `apps/chat/internal/delivery/http/router.go`, add the message handler registration:

```go
func RegisterRoutes(e *echo.Echo, wh *WorkspaceHandler, mh *MessageHandler) {
	api := e.Group("/api")
	ws := api.Group("/workspaces")

	// Existing workspace routes...
	ws.GET("/:id", wh.GetWorkspace)
	ws.GET("/by-bu/:buId", wh.GetWorkspaceByBuID)
	ws.GET("/:id/members", wh.ListMembers)
	ws.POST("/:id/members", wh.AddMember)
	ws.DELETE("/:id/members/:uid", wh.RemoveMember)

	// Message routes
	ws.GET("/by-bu/:buId/messages", mh.GetHistory)
}
```

**Step 4: Build**

Run: `cd apps/chat && go build ./...`
Expected: Build succeeded

**Step 5: Commit**

```bash
git add apps/chat/internal/usecase/message_usecase.go apps/chat/internal/delivery/http/message_handler.go apps/chat/internal/delivery/http/router.go
git commit -m "feat(chat): add message history REST endpoint GET /api/workspaces/by-bu/:buId/messages"
```

---

### Task 2.4: Add WebSocket Hub in Go

**Files:**
- Add dependency: `gorilla/websocket`
- Create: `apps/chat/internal/delivery/ws/hub.go`
- Create: `apps/chat/internal/delivery/ws/client.go`

**Step 1: Add gorilla/websocket dependency**

Run from `apps/chat/`:
```bash
go get github.com/gorilla/websocket
```

**Step 2: Create the Hub**

`apps/chat/internal/delivery/ws/hub.go`:

```go
package ws

import (
	"sync"
)

type Hub struct {
	mu       sync.RWMutex
	clients  map[*Client]bool
	broadcast chan []byte
	register  chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}
```

**Step 3: Create the Client**

`apps/chat/internal/delivery/ws/client.go`:

```go
package ws

import (
	"log"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	UserID string
	DisplayName string
}

func NewClient(hub *Hub, conn *websocket.Conn, userID, displayName string) *Client {
	return &Client{
		hub:         hub,
		conn:        conn,
		send:        make(chan []byte, 256),
		UserID:      userID,
		DisplayName: displayName,
	}
}

func (c *Client) ReadPump(onMessage func(client *Client, message []byte)) {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("ws: read error: %v", err)
			}
			break
		}
		onMessage(c, message)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
```

**Step 4: Build**

Run: `cd apps/chat && go build ./...`
Expected: Build succeeded

**Step 5: Commit**

```bash
git add apps/chat/internal/delivery/ws/
git commit -m "feat(chat): add WebSocket hub and client with read/write pumps"
```

---

### Task 2.5: Add Chat Token Generation in .NET API

**Files:**
- Create: `apps/api/Api/Features/ChatTokens/CreateChatToken/CreateChatTokenCommand.cs`
- Create: `apps/api/Api/Features/ChatTokens/CreateChatToken/CreateChatTokenHandler.cs`
- Create: `apps/api/Api/Features/ChatTokens/CreateChatToken/CreateChatTokenEndpoint.cs`
- Modify: `apps/api/Api/Program.cs`

**Step 1: Create the command**

`CreateChatTokenCommand.cs`:

```csharp
using MediatR;

namespace Api.Features.ChatTokens.CreateChatToken;

public record CreateChatTokenCommand(Guid BuId) : IRequest<ChatTokenResult>;

public record ChatTokenResult(string Token);
```

**Step 2: Create the handler**

`CreateChatTokenHandler.cs`:

```csharp
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Api.Features.ChatTokens.CreateChatToken;

public class CreateChatTokenHandler(
    IHttpContextAccessor httpContextAccessor,
    IConfiguration config,
    AppDbContext db) : IRequestHandler<CreateChatTokenCommand, ChatTokenResult>
{
    public async Task<ChatTokenResult> Handle(
        CreateChatTokenCommand request,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(
            httpContextAccessor.HttpContext!.User.FindFirst("sub")!.Value);
        var globalRole = httpContextAccessor.HttpContext!.User
            .FindFirst("global_role")?.Value;

        // Owner always has chat access
        if (globalRole != "Owner")
        {
            // Check chat_permissions for this user+BU
            var staff = await db.StaffProfiles
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.UserId == userId, cancellationToken)
                ?? throw new KeyNotFoundException("Staff profile not found");

            var hasPermission = await db.ChatPermissions
                .AnyAsync(cp => cp.StaffId == staff.Id && cp.BuId == request.BuId,
                    cancellationToken);

            if (!hasPermission)
                throw new Api.Common.Exceptions.ForbiddenException();
        }

        // Get display name
        var profile = await db.StaffProfiles
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == userId, cancellationToken);

        var displayName = profile != null
            ? $"{profile.FirstName} {profile.LastName}"
            : "Unknown";

        // Generate short-lived chat token
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim("sub", userId.ToString()),
            new Claim("bu_id", request.BuId.ToString()),
            new Claim("display_name", displayName),
            new Claim("purpose", "chat"),
        };

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: "mvp-chat",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: creds);

        return new ChatTokenResult(new JwtSecurityTokenHandler().WriteToken(token));
    }
}
```

**Step 3: Create the endpoint**

`CreateChatTokenEndpoint.cs`:

```csharp
using MediatR;

namespace Api.Features.ChatTokens.CreateChatToken;

public static class CreateChatTokenEndpoint
{
    public static void MapCreateChatToken(this WebApplication app) =>
        app.MapPost("/api/chat-tokens",
            async (CreateChatTokenCommand cmd, IMediator mediator) =>
                Results.Ok(await mediator.Send(cmd)))
        .RequireAuthorization();
}
```

**Step 4: Register in Program.cs**

Add:
```csharp
using Api.Features.ChatTokens.CreateChatToken;
// ...
app.MapCreateChatToken();
```

**Step 5: Build**

Run: `cd apps/api && dotnet build`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add apps/api/Api/Features/ChatTokens/ apps/api/Api/Program.cs
git commit -m "feat(api): add POST /api/chat-tokens endpoint for short-lived chat tokens"
```

---

### Task 2.6: Add WebSocket Handler with Token Auth in Go

**Files:**
- Create: `apps/chat/internal/delivery/ws/handler.go`
- Create: `apps/chat/internal/infrastructure/jwt/validator.go`
- Modify: `apps/chat/internal/delivery/http/router.go`
- Modify: `apps/chat/cmd/server/main.go`

**Step 1: Create JWT validator**

`apps/chat/internal/infrastructure/jwt/validator.go`:

```go
package jwt

import (
	"errors"
	"fmt"
	"os"

	"github.com/golang-jwt/jwt/v5"
)

type ChatClaims struct {
	Sub         string `json:"sub"`
	BuID        string `json:"bu_id"`
	DisplayName string `json:"display_name"`
	Purpose     string `json:"purpose"`
	jwt.RegisteredClaims
}

func ValidateChatToken(tokenString string) (*ChatClaims, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "super-secret-key-at-least-32-chars-long!!"
	}

	token, err := jwt.ParseWithClaims(tokenString, &ChatClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*ChatClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}

	if claims.Purpose != "chat" {
		return nil, errors.New("token not for chat")
	}

	return claims, nil
}
```

Add the dependency:
```bash
cd apps/chat && go get github.com/golang-jwt/jwt/v5
```

**Step 2: Create WebSocket handler**

`apps/chat/internal/delivery/ws/handler.go`:

```go
package ws

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	jwtutil "github.com/trainheartnet/mvp-chat/internal/infrastructure/jwt"
	"github.com/trainheartnet/mvp-chat/internal/domain"
	"github.com/trainheartnet/mvp-chat/internal/repository"
	"github.com/trainheartnet/mvp-chat/internal/usecase"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in dev
	},
}

type WSHandler struct {
	mu       sync.RWMutex
	hubs     map[uuid.UUID]*Hub // workspaceID -> Hub
	msgUC    *usecase.MessageUseCase
	wsRepo   repository.WorkspaceRepository
	memRepo  repository.MemberRepository
}

func NewWSHandler(msgUC *usecase.MessageUseCase, wsRepo repository.WorkspaceRepository, memRepo repository.MemberRepository) *WSHandler {
	return &WSHandler{
		hubs:    make(map[uuid.UUID]*Hub),
		msgUC:   msgUC,
		wsRepo:  wsRepo,
		memRepo: memRepo,
	}
}

func (h *WSHandler) getOrCreateHub(workspaceID uuid.UUID) *Hub {
	h.mu.Lock()
	defer h.mu.Unlock()

	if hub, ok := h.hubs[workspaceID]; ok {
		return hub
	}

	hub := NewHub()
	h.hubs[workspaceID] = hub
	go hub.Run()
	return hub
}

type IncomingMessage struct {
	Content string `json:"content"`
}

type OutgoingMessage struct {
	ID          uuid.UUID `json:"id"`
	UserID      string    `json:"userId"`
	DisplayName string    `json:"displayName"`
	Content     string    `json:"content"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (h *WSHandler) HandleWS(c echo.Context) error {
	token := c.QueryParam("token")
	if token == "" {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing token"})
	}

	claims, err := jwtutil.ValidateChatToken(token)
	if err != nil {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "invalid token"})
	}

	buIDStr := c.QueryParam("buId")
	buID, err := uuid.Parse(buIDStr)
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid buId"})
	}

	// Verify token's bu_id matches requested buId
	if claims.BuID != buIDStr {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "token bu_id mismatch"})
	}

	// Verify workspace exists and user is a member
	ws, err := h.wsRepo.GetByBuID(c.Request().Context(), buID)
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "workspace not found"})
	}

	userID, _ := uuid.Parse(claims.Sub)
	members, err := h.memRepo.ListByWorkspace(c.Request().Context(), ws.ID)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to check membership"})
	}

	isMember := false
	for _, m := range members {
		if m.UserID == userID {
			isMember = true
			break
		}
	}
	if !isMember {
		return c.JSON(http.StatusForbidden, map[string]string{"error": "not a workspace member"})
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		log.Printf("ws: upgrade error: %v", err)
		return nil
	}

	hub := h.getOrCreateHub(ws.ID)
	client := NewClient(hub, conn, claims.Sub, claims.DisplayName)

	hub.register <- client

	// Handle incoming messages
	onMessage := func(client *Client, raw []byte) {
		var incoming IncomingMessage
		if err := json.Unmarshal(raw, &incoming); err != nil {
			log.Printf("ws: unmarshal error: %v", err)
			return
		}

		if incoming.Content == "" {
			return
		}

		msg := &domain.Message{
			ID:          uuid.New(),
			WorkspaceID: ws.ID,
			UserID:      userID,
			DisplayName: claims.DisplayName,
			Content:     incoming.Content,
			CreatedAt:   time.Now().UTC(),
		}

		if err := h.msgUC.SaveMessage(context.Background(), msg); err != nil {
			log.Printf("ws: save message error: %v", err)
			return
		}

		outgoing := OutgoingMessage{
			ID:          msg.ID,
			UserID:      claims.Sub,
			DisplayName: claims.DisplayName,
			Content:     incoming.Content,
			CreatedAt:   msg.CreatedAt,
		}

		data, _ := json.Marshal(outgoing)
		hub.broadcast <- data
	}

	go client.WritePump()
	go client.ReadPump(onMessage)

	return nil
}
```

**Step 3: Register WS route in router**

Update `apps/chat/internal/delivery/http/router.go`:

```go
func RegisterRoutes(e *echo.Echo, wh *WorkspaceHandler, mh *MessageHandler, wsHandler *ws.WSHandler) {
	api := e.Group("/api")
	wsGroup := api.Group("/workspaces")

	wsGroup.GET("/:id", wh.GetWorkspace)
	wsGroup.GET("/by-bu/:buId", wh.GetWorkspaceByBuID)
	wsGroup.GET("/:id/members", wh.ListMembers)
	wsGroup.POST("/:id/members", wh.AddMember)
	wsGroup.DELETE("/:id/members/:uid", wh.RemoveMember)

	wsGroup.GET("/by-bu/:buId/messages", mh.GetHistory)

	// WebSocket
	e.GET("/ws", wsHandler.HandleWS)
}
```

Add the import:
```go
import ws "github.com/trainheartnet/mvp-chat/internal/delivery/ws"
```

**Step 4: Wire up in main.go**

Update `apps/chat/cmd/server/main.go` to create and pass the new dependencies:

```go
// After existing repo/usecase creation:
msgRepo := postgres.NewMessageRepo(pool)
msgUC := usecase.NewMessageUseCase(msgRepo, wsRepo)
msgHandler := deliveryhttp.NewMessageHandler(msgUC)
wsHandler := ws.NewWSHandler(msgUC, wsRepo, memRepo)

// Update RegisterRoutes call:
deliveryhttp.RegisterRoutes(e, workspaceHandler, msgHandler, wsHandler)
```

Add imports for the ws package.

Also add `JWT_SECRET` env var to docker-compose `chat` service:
```yaml
      JWT_SECRET: "super-secret-key-at-least-32-chars-long!!"
```

**Step 5: Build**

Run: `cd apps/chat && go build ./...`
Expected: Build succeeded

**Step 6: Commit**

```bash
git add apps/chat/ docker-compose.yml
git commit -m "feat(chat): add WebSocket handler with JWT token auth, message persistence, and hub-per-workspace"
```

---

### Task 2.7: Add Chat Token BFF Route in Next.js

**Files:**
- Create: `apps/web/src/app/api/chat/token/route.ts`
- Create: `apps/web/src/app/api/chat/messages/route.ts`

**Step 1: Create chat token BFF route**

`apps/web/src/app/api/chat/token/route.ts`:

```typescript
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.API_URL || 'http://api:5000';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const res = await fetch(`${API_BASE}/api/chat-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

**Step 2: Create chat messages BFF route**

`apps/web/src/app/api/chat/messages/route.ts`:

```typescript
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const CHAT_BASE = process.env.CHAT_URL || 'http://chat:8080';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const buId = req.nextUrl.searchParams.get('buId');
  if (!buId) return NextResponse.json({ error: 'buId required' }, { status: 400 });

  // First get a chat token from the API
  const API_BASE = process.env.API_URL || 'http://api:5000';
  const tokenRes = await fetch(`${API_BASE}/api/chat-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ buId }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: 'Failed to get chat token' }, { status: tokenRes.status });
  }

  const { token: chatToken } = await tokenRes.json();

  // Use the chat token to fetch history from Go service
  const res = await fetch(
    `${CHAT_BASE}/api/workspaces/by-bu/${buId}/messages?limit=50`,
    {
      headers: { Authorization: `Bearer ${chatToken}` },
    }
  );

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
```

**Step 3: Add CHAT_URL env var to docker-compose web service**

```yaml
  web:
    environment:
      API_URL: "http://api:5000"
      CHAT_URL: "http://chat:8080"
      NODE_ENV: production
```

**Step 4: Commit**

```bash
git add apps/web/src/app/api/chat/ docker-compose.yml
git commit -m "feat(web): add BFF routes for chat token exchange and message history"
```

---

## Feature 4: UI Shell & Role-Based Workflows

### Task 4.1: Update Auth Store with BU Assignments

**Files:**
- Modify: `apps/web/src/stores/authStore.ts`

**Step 1: Extend auth store with BU data**

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
  mustChangePassword: boolean;
  buAssignments: BuAssignment[];
  setAuth: (userId: string, globalRole: string, mustChangePassword: boolean) => void;
  setBuAssignments: (assignments: BuAssignment[]) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userId: null,
      globalRole: null,
      companyId: null,
      mustChangePassword: false,
      buAssignments: [],
      setAuth: (userId, globalRole, mustChangePassword) =>
        set({ userId, globalRole, mustChangePassword }),
      setBuAssignments: (assignments) =>
        set({ buAssignments: assignments }),
      clearAuth: () =>
        set({
          userId: null,
          globalRole: null,
          companyId: null,
          mustChangePassword: false,
          buAssignments: [],
        }),
    }),
    { name: 'auth-store' }
  )
);
```

**Note:** The `role` field is renamed to `globalRole` throughout. All existing code that reads `role` from the store must be updated to `globalRole`. The login handler must also be updated to call `setAuth(userId, role == 'Owner' ? 'Owner' : 'User', mustChangePassword)` and then fetch BU assignments.

**Step 2: Commit**

```bash
git add apps/web/src/stores/authStore.ts
git commit -m "feat(web): extend auth store with BU assignments and globalRole"
```

---

### Task 4.2: Update Login Flow to Fetch BU Assignments

**Files:**
- Modify: `apps/web/src/app/(public)/login/page.tsx`

**Step 1: Update login mutation**

After successful login, fetch BU assignments and redirect to first BU:

```typescript
const mutation = useMutation({
  mutationFn: (data: LoginFormData) => api.post('/auth/login', data),
  onSuccess: async (res) => {
    const { userId, role, mustChangePassword } = res.data;
    const globalRole = role === 'Owner' ? 'Owner' : 'User';
    setAuth(userId, globalRole, mustChangePassword);

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
        router.push(`/bu/${firstBu.buId}/dashboard`);
      } else {
        router.push('/dashboard'); // fallback
      }
    } catch {
      router.push('/dashboard');
    }
  },
});
```

**Step 2: Commit**

```bash
git add apps/web/src/app/(public)/login/page.tsx
git commit -m "feat(web): update login to fetch BU assignments and redirect to first BU"
```

---

### Task 4.3: Create New App Shell Layout

**Files:**
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/TopNav.tsx`
- Create: `apps/web/src/components/BuSwitcher.tsx`
- Create: `apps/web/src/components/DynamicSidebar.tsx`

**Step 1: Create TopNav**

`apps/web/src/components/TopNav.tsx`:

```tsx
'use client';

import { useAuthStore } from '@/stores/authStore';
import { BuSwitcher } from './BuSwitcher';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export function TopNav({ activeBuId }: { activeBuId?: string }) {
  const { clearAuth } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    router.push('/login');
  };

  return (
    <header className="h-14 bg-gray-900 text-white flex items-center justify-between px-6 border-b border-gray-700">
      <div className="font-semibold text-lg">MVP Platform</div>
      <BuSwitcher activeBuId={activeBuId} />
      <div className="flex items-center gap-4">
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

**Step 2: Create BuSwitcher**

`apps/web/src/components/BuSwitcher.tsx`:

```tsx
'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';

export function BuSwitcher({ activeBuId }: { activeBuId?: string }) {
  const { buAssignments } = useAuthStore();
  const router = useRouter();

  if (buAssignments.length === 0) return null;

  if (buAssignments.length === 1) {
    return (
      <span className="text-sm text-gray-300">{buAssignments[0].buName}</span>
    );
  }

  return (
    <select
      value={activeBuId || ''}
      onChange={(e) => router.push(`/bu/${e.target.value}/dashboard`)}
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

**Step 3: Create DynamicSidebar**

`apps/web/src/components/DynamicSidebar.tsx`:

```tsx
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
  const { globalRole, buAssignments } = useAuthStore();
  const pathname = usePathname();

  const isOwner = globalRole === 'Owner';
  const activeBu = buAssignments.find((b) => b.buId === activeBuId);
  const buRole = activeBu?.role;
  const isAdmin = buRole === 'Admin' || isOwner;
  const hasChatAccess = activeBu?.hasChatAccess ?? false;

  const items: SidebarItem[] = [
    // Global (Owner only)
    { label: 'Company Settings', href: '/company/settings', show: isOwner },
    { label: 'BU Management', href: '/bu/management', show: isOwner },
    { label: 'Global Staff', href: '/company/staff', show: isOwner },
    { label: 'BU Access Control', href: '/company/access-control', show: isOwner },

    // BU-scoped
    ...(activeBuId
      ? [
          { label: 'Dashboard', href: `/bu/${activeBuId}/dashboard`, show: true },
          { label: 'BU Staff', href: `/bu/${activeBuId}/staff`, show: isAdmin },
          { label: 'Chat', href: `/bu/${activeBuId}/chat`, show: hasChatAccess || isOwner },
        ]
      : []),

    // Personal
    { label: 'My Profile', href: '/profile', show: true },
  ];

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col border-r border-gray-700">
      <nav className="flex-1 py-4">
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

**Step 4: Create AppShell**

`apps/web/src/components/AppShell.tsx`:

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
      <TopNav activeBuId={activeBuId} />
      <div className="flex flex-1">
        <DynamicSidebar activeBuId={activeBuId} />
        <main className="flex-1 bg-gray-50 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
```

**Step 5: Commit**

```bash
git add apps/web/src/components/
git commit -m "feat(web): create AppShell, TopNav, BuSwitcher, and DynamicSidebar components"
```

---

### Task 4.4: Restructure Routes for BU-Scoped Layout

**Files:**
- Create: `apps/web/src/app/(app)/layout.tsx`
- Create: `apps/web/src/app/(app)/bu/[buId]/layout.tsx`
- Create: `apps/web/src/app/(app)/bu/[buId]/dashboard/page.tsx`
- Create: `apps/web/src/app/(app)/bu/[buId]/staff/page.tsx`
- Create: `apps/web/src/app/(app)/bu/[buId]/chat/page.tsx`
- Create: `apps/web/src/app/(app)/bu/management/page.tsx`
- Create: `apps/web/src/app/(app)/company/settings/page.tsx`
- Create: `apps/web/src/app/(app)/company/staff/page.tsx`
- Create: `apps/web/src/app/(app)/company/access-control/page.tsx`
- Create: `apps/web/src/app/(app)/profile/page.tsx`
- Remove old: `apps/web/src/app/(auth)/` route group (after migration)

**Step 1: Create (app) layout with AppShell**

`apps/web/src/app/(app)/layout.tsx`:

```tsx
import { AppShell } from '@/components/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
```

**Step 2: Create BU context layout**

`apps/web/src/app/(app)/bu/[buId]/layout.tsx`:

```tsx
'use client';

import { use } from 'react';
import { AppShell } from '@/components/AppShell';

export default function BuLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ buId: string }>;
}) {
  const { buId } = use(params);

  return <AppShell activeBuId={buId}>{children}</AppShell>;
}
```

Note: This BU layout overrides the parent (app) layout's AppShell by passing `activeBuId`. Since both render AppShell, the (app) layout should render just `{children}` without AppShell, and each leaf layout provides the shell. Alternatively, use a BU context provider approach. The implementer should choose the cleanest approach for the specific Next.js version.

**Step 3: Create placeholder pages**

Each page should be a simple functional component. Start with the BU Dashboard:

`apps/web/src/app/(app)/bu/[buId]/dashboard/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { useAuthStore } from '@/stores/authStore';

export default function BuDashboardPage({ params }: { params: Promise<{ buId: string }> }) {
  const { buId } = use(params);
  const { buAssignments } = useAuthStore();
  const activeBu = buAssignments.find((b) => b.buId === buId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        {activeBu?.buName ?? 'Business Unit'} — Dashboard
      </h1>
      <p className="text-gray-600">BU operational dashboard goes here.</p>
    </div>
  );
}
```

Create similar placeholder pages for:
- `/bu/[buId]/staff/page.tsx` — BU staff list (migrate from existing `(auth)/staff/page.tsx` but filter by buId)
- `/bu/management/page.tsx` — Owner: create/delete BUs (migrate from existing `(auth)/business-units/page.tsx`)
- `/company/settings/page.tsx` — Owner: edit company details (new page)
- `/company/staff/page.tsx` — Owner: global staff directory (migrate from existing `(auth)/staff/page.tsx`)
- `/company/access-control/page.tsx` — Owner: BU assignment + chat toggle (migrate from existing `(auth)/chat-permissions/` pages)
- `/profile/page.tsx` — Edit own profile (migrate from My Profile functionality)

**Step 4: Update middleware for new route structure**

In `apps/web/src/middleware.ts`, update the public paths and protected path matching to include the new `/bu/` and `/company/` prefixes.

**Step 5: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(web): restructure routes with BU-scoped layout and placeholder pages"
```

---

### Task 4.5: Build Chat Component

**Files:**
- Create: `apps/web/src/components/ChatBox.tsx`
- Create: `apps/web/src/app/(app)/bu/[buId]/chat/page.tsx` (full implementation)

**Step 1: Create ChatBox component**

`apps/web/src/components/ChatBox.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';

interface ChatMessage {
  id: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: string;
}

export function ChatBox({ buId }: { buId: string }) {
  const { userId } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket;

    const connect = async () => {
      // 1. Fetch history
      try {
        const historyRes = await api.get(`/chat/messages?buId=${buId}`);
        setMessages(historyRes.data ?? []);
      } catch (err) {
        console.error('Failed to fetch chat history:', err);
      }

      // 2. Get chat token
      let chatToken: string;
      try {
        const tokenRes = await api.post('/chat/token', { buId });
        chatToken = tokenRes.data.token;
      } catch (err) {
        console.error('Failed to get chat token:', err);
        return;
      }

      // 3. Connect WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsHost = process.env.NEXT_PUBLIC_CHAT_WS_URL || `${wsProtocol}://${window.location.hostname}:8080`;
      ws = new WebSocket(`${wsHost}/ws?token=${chatToken}&buId=${buId}`);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onmessage = (event) => {
        const msg: ChatMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      };
    };

    connect();

    return () => {
      ws?.close();
    };
  }, [buId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ content: input.trim() }));
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Chat</h2>
        <span className={`text-xs px-2 py-1 rounded-full ${connected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isMe = msg.userId === userId;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <span className="text-xs text-gray-500 mb-1">{msg.displayName}</span>
              <div className={`px-3 py-2 rounded-lg max-w-md text-sm ${
                isMe ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'
              }`}>
                {msg.content}
              </div>
              <span className="text-xs text-gray-400 mt-0.5">
                {new Date(msg.createdAt).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={!connected || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create chat page with access control**

`apps/web/src/app/(app)/bu/[buId]/chat/page.tsx`:

```tsx
'use client';

import { use } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { ChatBox } from '@/components/ChatBox';

export default function ChatPage({ params }: { params: Promise<{ buId: string }> }) {
  const { buId } = use(params);
  const { globalRole, buAssignments } = useAuthStore();
  const activeBu = buAssignments.find((b) => b.buId === buId);

  const isOwner = globalRole === 'Owner';
  const hasChatAccess = activeBu?.hasChatAccess ?? false;

  if (!isOwner && !hasChatAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
        <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Access Restricted</h2>
        <p className="text-sm">Please contact your Company Owner to enable chat access.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">
        {activeBu?.buName ?? 'Business Unit'} — Chat
      </h1>
      <ChatBox buId={buId} />
    </div>
  );
}
```

**Step 3: Add NEXT_PUBLIC_CHAT_WS_URL to .env.local**

```
NEXT_PUBLIC_CHAT_WS_URL=ws://localhost:8080
```

**Step 4: Commit**

```bash
git add apps/web/src/components/ChatBox.tsx apps/web/src/app/
git commit -m "feat(web): add ChatBox component with WebSocket connection and chat page with access control"
```

---

### Task 4.6: Migrate Existing Pages to New Route Structure

**Files:**
- Migrate content from `apps/web/src/app/(auth)/` pages to `apps/web/src/app/(app)/` equivalent pages
- Delete old `apps/web/src/app/(auth)/` directory
- Delete old `apps/web/src/components/Sidebar.tsx`

**Step 1: Migrate each page**

Move logic from:
- `(auth)/dashboard/page.tsx` → `(app)/bu/[buId]/dashboard/page.tsx` (add BU context)
- `(auth)/business-units/page.tsx` → `(app)/bu/management/page.tsx` (Owner only)
- `(auth)/business-units/new/page.tsx` → `(app)/bu/management/page.tsx` (inline create form or modal)
- `(auth)/staff/page.tsx` → split into `(app)/company/staff/page.tsx` (global) and `(app)/bu/[buId]/staff/page.tsx` (BU-scoped)
- `(auth)/staff/new/page.tsx` → `(app)/company/staff/page.tsx` (inline create form or modal)
- `(auth)/staff/[id]/page.tsx` → `(app)/company/staff/[id]/page.tsx` or similar
- `(auth)/chat-permissions/` → `(app)/company/access-control/page.tsx`

Each page should use the new `buId` from URL params where applicable and use `globalRole` instead of `role` from the auth store.

**Step 2: Delete old route group and sidebar**

```bash
rm -rf apps/web/src/app/\(auth\)/
rm apps/web/src/components/Sidebar.tsx
```

**Step 3: Verify build**

Run: `cd apps/web && npm run build`
Expected: Build succeeded

**Step 4: Commit**

```bash
git add -A apps/web/
git commit -m "feat(web): migrate all pages to new BU-scoped route structure, remove old layout"
```

---

### Task 4.7: Update Middleware for New Routes

**Files:**
- Modify: `apps/web/src/middleware.ts`

**Step 1: Update middleware**

```typescript
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/onboard', '/change-password'];

export function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!token && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && pathname === '/login') {
    return NextResponse.redirect(new URL('/bu', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**Step 2: Commit**

```bash
git add apps/web/src/middleware.ts
git commit -m "feat(web): update middleware for new route structure"
```

---

## Final Integration Test

### Task 5.1: End-to-End Flow Test

**Step 1: Reset and rebuild**

```bash
docker-compose down -v
docker-compose up --build
```

**Step 2: Test full flow**

1. **Onboard company** → creates company + default BU + Owner + publishes event via MassTransit Outbox → RabbitMQ → Go creates workspace
2. **Login as Owner** → gets JWT with `global_role: Owner`, fetches BU assignments, redirected to `/bu/{buId}/dashboard`
3. **Create new BU** → publishes event → Go provisions workspace
4. **Create staff** → assign to BU with Admin/Staff role
5. **Toggle chat access** for staff
6. **Open chat as Owner** → history loads, WebSocket connects, send message
7. **Login as Staff with chat access** → sees limited sidebar, can access chat
8. **Login as Staff without chat access** → sees "Access Restricted" on chat page
9. **Switch BUs** → URL changes, sidebar updates, content refreshes

**Step 3: Fix any issues found during testing**

**Step 4: Final commit**

```bash
git commit -am "fix: integration test fixes"
```
