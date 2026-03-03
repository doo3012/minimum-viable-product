using Api.Infrastructure.Messaging.Events;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MassTransit;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Companies.Onboard;

public class OnboardHandler(AppDbContext db, IPublishEndpoint publishEndpoint)
    : IRequestHandler<OnboardCommand, OnboardResult>
{
    public async Task<OnboardResult> Handle(OnboardCommand cmd, CancellationToken ct)
    {
        var exists = await db.Companies.AnyAsync(c => c.Name == cmd.CompanyName, ct);
        if (exists)
            throw new InvalidOperationException($"Company '{cmd.CompanyName}' already exists.");

        // 1. Create company
        var company = new Company {
            Id = Guid.NewGuid(),
            Name = cmd.CompanyName,
            Address = cmd.Address,
            ContactNumber = cmd.ContactNumber,
            CreatedAt = DateTime.UtcNow
        };
        db.Companies.Add(company);

        // 2. Create default BU
        var bu = new BusinessUnit {
            Id = Guid.NewGuid(),
            CompanyId = company.Id,
            Name = "Default",
            IsDefault = true,
            CreatedAt = DateTime.UtcNow
        };
        db.BusinessUnits.Add(bu);

        // 3. Create Owner account
        var slug = cmd.CompanyName.ToLower().Replace(" ", "");
        var username = $"owner@{slug}";
        var defaultPassword = $"Welcome@{cmd.CompanyName.Replace(" ", "")}1";
        var user = new User {
            Id = Guid.NewGuid(),
            CompanyId = company.Id,
            Username = username,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(defaultPassword),
            Role = "Owner",
            MustChangePassword = true,
            CreatedAt = DateTime.UtcNow
        };
        db.Users.Add(user);

        // 4. Create Owner staff profile + assign to default BU
        var staffProfile = new StaffProfile {
            Id = Guid.NewGuid(),
            CompanyId = company.Id,
            UserId = user.Id,
            FirstName = "Owner",
            LastName = cmd.CompanyName,
            CreatedAt = DateTime.UtcNow
        };
        db.StaffProfiles.Add(staffProfile);

        var staffBu = new StaffBu {
            Id = Guid.NewGuid(),
            StaffId = staffProfile.Id,
            BuId = bu.Id,
            Email = username,
            CreatedAt = DateTime.UtcNow
        };
        db.StaffBus.Add(staffBu);

        await db.SaveChangesAsync(ct);

        // 5. Publish bu.created event
        await publishEndpoint.Publish(new BusinessUnitCreated(
            bu.Id, bu.Name, user.Id, company.Id), ct);

        return new OnboardResult(company.Id, username, defaultPassword);
    }
}
