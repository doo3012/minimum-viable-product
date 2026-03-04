using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.Create;

public class CreateStaffHandler(AppDbContext db)
    : IRequestHandler<CreateStaffCommand, CreateStaffResult>
{
    public async Task<CreateStaffResult> Handle(CreateStaffCommand cmd, CancellationToken ct)
    {
        // 1. Create User — use email as username
        var username = cmd.Email;
        var usernameExists = await db.Users.AnyAsync(u => u.Username == username, ct);
        if (usernameExists)
            throw new InvalidOperationException($"Email '{username}' is already in use.");

        var defaultPassword = $"Welcome@{cmd.FirstName}1";
        var user = new User {
            Id = Guid.NewGuid(),
            CompanyId = cmd.CompanyId,
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(defaultPassword),
            Role = cmd.Role,
            MustChangePassword = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);

        // 2. Create StaffProfile linked to User
        var profile = new StaffProfile {
            Id = Guid.NewGuid(),
            CompanyId = cmd.CompanyId,
            UserId = user.Id,
            FirstName = cmd.FirstName,
            LastName = cmd.LastName,
            CreatedAt = DateTime.UtcNow
        };
        db.StaffProfiles.Add(profile);

        // 3. Create StaffBu record (email scoped to BU)
        var staffBu = new StaffBu {
            Id = Guid.NewGuid(),
            StaffId = profile.Id,
            BuId = cmd.BuId,
            Email = cmd.Email,
            Role = cmd.BuRole ?? "Staff",
            CreatedAt = DateTime.UtcNow
        };
        db.StaffBus.Add(staffBu);

        await db.SaveChangesAsync(ct);
        return new CreateStaffResult(profile.Id, username, defaultPassword);
    }
}
