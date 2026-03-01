using Api.Features.Companies.Onboard;
using Api.Infrastructure.Messaging;
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
