using Api.Infrastructure.Chat;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.ChatPermissions.Grant;

public class GrantPermissionHandler(AppDbContext db, IChatServiceClient chatClient)
    : IRequestHandler<GrantPermissionCommand, Guid>
{
    public async Task<Guid> Handle(GrantPermissionCommand cmd, CancellationToken ct)
    {
        var exists = await db.ChatPermissions
            .AnyAsync(p => p.StaffId == cmd.StaffId && p.BuId == cmd.BuId, ct);
        if (exists)
            throw new InvalidOperationException("Permission already granted");

        var permission = new ChatPermission {
            Id = Guid.NewGuid(),
            StaffId = cmd.StaffId,
            BuId = cmd.BuId,
            GrantedAt = DateTime.UtcNow
        };
        db.ChatPermissions.Add(permission);
        await db.SaveChangesAsync(ct);

        // Sync with Chat Service
        var staff = await db.StaffProfiles.FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct);
        if (staff?.UserId != null)
        {
            var wsId = await chatClient.GetWorkspaceIdByBuIdAsync(cmd.BuId, ct);
            if (wsId.HasValue)
                await chatClient.AddMemberAsync(wsId.Value, staff.UserId.Value, ct);
        }

        return permission.Id;
    }
}
