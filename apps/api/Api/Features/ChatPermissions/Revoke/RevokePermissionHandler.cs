using Api.Infrastructure.Chat;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.ChatPermissions.Revoke;

public class RevokePermissionHandler(AppDbContext db, IChatServiceClient chatClient)
    : IRequestHandler<RevokePermissionCommand, Unit>
{
    public async Task<Unit> Handle(RevokePermissionCommand cmd, CancellationToken ct)
    {
        var permission = await db.ChatPermissions
            .FirstOrDefaultAsync(p => p.Id == cmd.PermissionId, ct)
            ?? throw new KeyNotFoundException("Permission not found");

        // Sync with Chat Service before removing
        var staff = await db.StaffProfiles.FirstOrDefaultAsync(s => s.Id == permission.StaffId, ct);
        if (staff?.UserId != null)
        {
            var wsId = await chatClient.GetWorkspaceIdByBuIdAsync(permission.BuId, ct);
            if (wsId.HasValue)
                await chatClient.RemoveMemberAsync(wsId.Value, staff.UserId.Value, ct);
        }

        db.ChatPermissions.Remove(permission);
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
