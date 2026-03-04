using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.BusinessUnits.Delete;

public class DeleteBuHandler(AppDbContext db) : IRequestHandler<DeleteBuCommand>
{
    public async Task Handle(DeleteBuCommand cmd, CancellationToken ct)
    {
        var bu = await db.BusinessUnits
            .FirstOrDefaultAsync(b => b.Id == cmd.BuId && b.CompanyId == cmd.CompanyId, ct)
            ?? throw new InvalidOperationException("Business unit not found.");

        if (bu.IsDefault)
            throw new InvalidOperationException("Cannot delete the default business unit.");

        db.BusinessUnits.Remove(bu);
        await db.SaveChangesAsync(ct);
    }
}
