using Api.Infrastructure.Messaging.Events;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MassTransit;
using MediatR;
namespace Api.Features.BusinessUnits.Create;
public class CreateBuHandler(AppDbContext db, IPublishEndpoint publishEndpoint)
    : IRequestHandler<CreateBuCommand, Guid>
{
    public async Task<Guid> Handle(CreateBuCommand cmd, CancellationToken ct)
    {
        var bu = new BusinessUnit {
            Id = Guid.NewGuid(),
            CompanyId = cmd.CompanyId,
            Name = cmd.Name,
            IsDefault = false,
            CreatedAt = DateTime.UtcNow
        };
        db.BusinessUnits.Add(bu);
        await db.SaveChangesAsync(ct);

        await publishEndpoint.Publish(new BusinessUnitCreated(
            bu.Id, bu.Name, cmd.UserId, bu.CompanyId), ct);

        return bu.Id;
    }
}
