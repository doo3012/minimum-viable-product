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
            owner_user_id = Guid.Empty,
            company_id = bu.CompanyId
        }, ct);

        return bu.Id;
    }
}
