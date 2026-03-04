using Api.Features.Companies.Onboard;
using Api.Infrastructure.Persistence;
using FluentAssertions;
using MassTransit;
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
        var publishEndpoint = Substitute.For<IPublishEndpoint>();
        var handler = new OnboardHandler(db, publishEndpoint);

        var cmd = new OnboardCommand(
            CompanyName: "Acme Corp",
            Address: "123 Main St",
            ContactNumber: "0812345678",
            FirstName: "John",
            LastName: "Doe",
            Email: "john@acme.com");

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.Should().NotBeNull();
        result.Username.Should().Be("john@acme.com");

        (await db.Companies.CountAsync()).Should().Be(1);
        (await db.BusinessUnits.CountAsync()).Should().Be(1);
        var bu = await db.BusinessUnits.FirstAsync();
        bu.IsDefault.Should().BeTrue();
        bu.Name.Should().Be("Head Quarter");

        (await db.Users.CountAsync()).Should().Be(1);
        var user = await db.Users.FirstAsync();
        user.Role.Should().Be("Owner");
        user.MustChangePassword.Should().BeTrue();
    }
}
