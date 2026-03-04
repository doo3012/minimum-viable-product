using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.RemoveBu;

public class RemoveStaffBuHandler(AppDbContext db) : IRequestHandler<RemoveStaffBuCommand>
{
    public async Task Handle(RemoveStaffBuCommand cmd, CancellationToken ct)
    {
        var staffBu = await db.StaffBus
            .FirstOrDefaultAsync(sb => sb.StaffId == cmd.StaffId && sb.BuId == cmd.BuId, ct)
            ?? throw new KeyNotFoundException("BU assignment not found");

        // Also remove chat permission for this BU if exists
        var chatPerm = await db.ChatPermissions
            .FirstOrDefaultAsync(cp => cp.StaffId == cmd.StaffId && cp.BuId == cmd.BuId, ct);
        if (chatPerm != null) db.ChatPermissions.Remove(chatPerm);

        db.StaffBus.Remove(staffBu);
        await db.SaveChangesAsync(ct);
    }
}
