using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.SetPassword;

public class SetPasswordHandler(AppDbContext db)
    : IRequestHandler<SetPasswordCommand, Unit>
{
    public async Task<Unit> Handle(SetPasswordCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        if (staff.User is null)
            throw new InvalidOperationException("Staff has no user account");

        staff.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(cmd.NewPassword);
        staff.User.MustChangePassword = true;
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
