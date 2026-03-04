using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.Me;

public class UpdateMyProfileHandler(AppDbContext db)
    : IRequestHandler<UpdateMyProfileCommand>
{
    public async Task Handle(UpdateMyProfileCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .FirstOrDefaultAsync(s => s.UserId == cmd.UserId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        staff.FirstName = cmd.FirstName;
        staff.LastName = cmd.LastName;
        await db.SaveChangesAsync(ct);
    }
}
