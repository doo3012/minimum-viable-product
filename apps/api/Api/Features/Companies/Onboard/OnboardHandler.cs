using Api.Infrastructure.Messaging;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Companies.Onboard;

public class OnboardHandler(AppDbContext db, INatsPublisher nats)
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

        await db.SaveChangesAsync(ct);

        // 4. Publish bu.created event
        await nats.PublishAsync("bu.created", new {
            bu_id = bu.Id,
            bu_name = bu.Name,
            owner_user_id = user.Id,
            company_id = company.Id
        }, ct);

        return new OnboardResult(company.Id, username, defaultPassword);
    }
}
