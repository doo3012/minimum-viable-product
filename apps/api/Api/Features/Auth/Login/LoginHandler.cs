using Api.Common.Jwt;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Auth.Login;
public class LoginHandler(AppDbContext db, JwtService jwt)
    : IRequestHandler<LoginCommand, LoginResult>
{
    public async Task<LoginResult> Handle(LoginCommand cmd, CancellationToken ct)
    {
        var user = await db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Username == cmd.Username, ct)
            ?? throw new UnauthorizedAccessException("Invalid credentials");

        if (!BCrypt.Net.BCrypt.Verify(cmd.Password, user.PasswordHash))
            throw new UnauthorizedAccessException("Invalid credentials");

        var companyName = await db.Companies
            .Where(c => c.Id == user.CompanyId)
            .Select(c => c.Name)
            .FirstOrDefaultAsync(ct) ?? "";

        var staff = await db.StaffProfiles
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == user.Id, ct);

        var token = jwt.Generate(user.Id, user.CompanyId, user.Role);
        return new LoginResult(
            token, user.MustChangePassword, user.Id, user.Role,
            companyName, staff?.FirstName ?? "", staff?.LastName ?? "");
    }
}
