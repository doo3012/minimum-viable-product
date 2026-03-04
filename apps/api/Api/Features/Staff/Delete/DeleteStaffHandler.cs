using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.Delete;

public class DeleteStaffHandler(AppDbContext db) : IRequestHandler<DeleteStaffCommand>
{
    public async Task Handle(DeleteStaffCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .Include(s => s.StaffBus)
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        // Delete chat permissions
        var chatPerms = await db.ChatPermissions
            .Where(cp => cp.StaffId == cmd.StaffId)
            .ToListAsync(ct);
        db.ChatPermissions.RemoveRange(chatPerms);

        // Delete BU assignments
        db.StaffBus.RemoveRange(staff.StaffBus);

        // Delete user account if linked
        if (staff.UserId.HasValue)
        {
            var user = await db.Users
                .FirstOrDefaultAsync(u => u.Id == staff.UserId, ct);
            if (user != null) db.Users.Remove(user);
        }

        // Delete staff profile
        db.StaffProfiles.Remove(staff);

        await db.SaveChangesAsync(ct);
    }
}
