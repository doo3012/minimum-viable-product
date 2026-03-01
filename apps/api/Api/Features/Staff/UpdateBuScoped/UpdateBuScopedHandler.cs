using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.UpdateBuScoped;

public class UpdateBuScopedHandler(AppDbContext db)
    : IRequestHandler<UpdateBuScopedCommand, Unit>
{
    public async Task<Unit> Handle(UpdateBuScopedCommand cmd, CancellationToken ct)
    {
        var staffBu = await db.StaffBus
            .FirstOrDefaultAsync(s => s.StaffId == cmd.StaffId && s.BuId == cmd.BuId, ct)
            ?? throw new KeyNotFoundException("Staff BU assignment not found");
        staffBu.Email = cmd.Email;
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
