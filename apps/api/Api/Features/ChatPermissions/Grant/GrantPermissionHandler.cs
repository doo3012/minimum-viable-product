using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.ChatPermissions.Grant;

public class GrantPermissionHandler(AppDbContext db)
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
        return permission.Id;
    }
}
