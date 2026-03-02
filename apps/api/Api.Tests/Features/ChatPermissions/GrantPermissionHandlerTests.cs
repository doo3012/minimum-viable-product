using Api.Features.ChatPermissions.Grant;
using Api.Infrastructure.Chat;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using NSubstitute;

namespace Api.Tests.Features.ChatPermissions;

public class GrantPermissionHandlerTests
{
    private AppDbContext CreateDb()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        return new AppDbContext(opts);
    }

    [Fact]
    public async Task Handle_Grant_CreatesChatPermissionRow()
    {
        var db = CreateDb();
        var staffId = Guid.NewGuid();
        var buId = Guid.NewGuid();
        var handler = new GrantPermissionHandler(db, Substitute.For<IChatServiceClient>());

        var id = await handler.Handle(
            new GrantPermissionCommand(staffId, buId), CancellationToken.None);

        id.Should().NotBe(Guid.Empty);
        (await db.ChatPermissions.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Handle_Grant_Duplicate_ThrowsConflict()
    {
        var db = CreateDb();
        var staffId = Guid.NewGuid();
        var buId = Guid.NewGuid();
        db.ChatPermissions.Add(new ChatPermission {
            Id = Guid.NewGuid(), StaffId = staffId, BuId = buId, GrantedAt = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var handler = new GrantPermissionHandler(db, Substitute.For<IChatServiceClient>());

        var act = () => handler.Handle(
            new GrantPermissionCommand(staffId, buId), CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>();
    }
}
