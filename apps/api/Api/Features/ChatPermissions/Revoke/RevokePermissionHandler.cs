using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.ChatPermissions.Revoke;

public class RevokePermissionHandler(AppDbContext db)
    : IRequestHandler<RevokePermissionCommand, Unit>
{
    public async Task<Unit> Handle(RevokePermissionCommand cmd, CancellationToken ct)
    {
        var permission = await db.ChatPermissions
            .FirstOrDefaultAsync(p => p.Id == cmd.PermissionId, ct)
            ?? throw new KeyNotFoundException("Permission not found");
        db.ChatPermissions.Remove(permission);
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
