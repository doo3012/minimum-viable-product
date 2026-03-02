using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.ResetPassword;

public class ResetPasswordHandler(AppDbContext db)
    : IRequestHandler<ResetPasswordCommand, string>
{
    public async Task<string> Handle(ResetPasswordCommand cmd, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new KeyNotFoundException("Staff not found");

        if (staff.User is null)
            throw new InvalidOperationException("Staff has no user account");

        var newPassword = $"Reset@{staff.FirstName}{Random.Shared.Next(100, 999)}";
        staff.User.PasswordHash = BCrypt.Net.BCrypt.HashPassword(newPassword);
        staff.User.MustChangePassword = true;
        await db.SaveChangesAsync(ct);

        return newPassword;
    }
}
