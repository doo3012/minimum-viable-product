using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.Create;

public class CreateStaffHandler(AppDbContext db)
    : IRequestHandler<CreateStaffCommand, Guid>
{
    public async Task<Guid> Handle(CreateStaffCommand cmd, CancellationToken ct)
    {
        // 1. Create User with auto-generated username
        var slug = $"{cmd.FirstName.ToLower()}.{cmd.LastName.ToLower()}";
        var username = $"{slug}@staff";
        var usernameExists = await db.Users.AnyAsync(u => u.Username == username, ct);
        if (usernameExists)
            throw new InvalidOperationException($"Username '{username}' already exists");

        var user = new User {
            Id = Guid.NewGuid(),
            CompanyId = cmd.CompanyId,
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword($"Welcome@{cmd.FirstName}1"),
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
        return profile.Id;
    }
}
