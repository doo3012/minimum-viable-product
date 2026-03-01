using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Auth.ChangePassword;
public class ChangePasswordHandler(AppDbContext db)
    : IRequestHandler<ChangePasswordCommand, Unit>
{
    public async Task<Unit> Handle(ChangePasswordCommand cmd, CancellationToken ct)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == cmd.UserId, ct)
            ?? throw new KeyNotFoundException("User not found");
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(cmd.NewPassword);
        user.MustChangePassword = false;
        await db.SaveChangesAsync(ct);
        return Unit.Value;
    }
}
