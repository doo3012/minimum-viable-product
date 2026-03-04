using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.UpdateProfile;

public class UpdateStaffProfileHandler(AppDbContext db) : IRequestHandler<UpdateStaffProfileCommand>
{
    public async Task Handle(UpdateStaffProfileCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        staff.FirstName = cmd.FirstName;
        staff.LastName = cmd.LastName;
        await db.SaveChangesAsync(ct);
    }
}
