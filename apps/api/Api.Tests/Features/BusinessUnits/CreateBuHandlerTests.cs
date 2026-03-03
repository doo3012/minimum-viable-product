using Api.Features.BusinessUnits.Create;
using Api.Infrastructure.Messaging.Events;
using Api.Infrastructure.Persistence;
using FluentAssertions;
using MassTransit;
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
        var publishEndpoint = Substitute.For<IPublishEndpoint>();
        var companyId = Guid.NewGuid();
        db.SetTenant(companyId);

        var handler = new CreateBuHandler(db, publishEndpoint);
        var cmd = new CreateBuCommand("Sales") { CompanyId = companyId };

        var result = await handler.Handle(cmd, CancellationToken.None);

        result.Should().NotBe(Guid.Empty);
        (await db.BusinessUnits.CountAsync()).Should().Be(1);
        await publishEndpoint.Received(1).Publish(
            Arg.Any<BusinessUnitCreated>(), Arg.Any<CancellationToken>());
    }
}
