using Api.Common.Jwt;
using Api.Features.Auth.Login;
using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace Api.Tests.Features.Auth;

public class LoginHandlerTests
{
    [Fact]
    public async Task Handle_ValidCredentials_ReturnsToken()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AppDbContext(opts);
        var companyId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        db.Users.Add(new User {
            Id = userId, CompanyId = companyId,
            Username = "owner@test",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("secret"),
            Role = "Owner", MustChangePassword = false
        });
        await db.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> {
                ["Jwt:Secret"] = "super-secret-key-at-least-32-chars!!",
                ["Jwt:Issuer"] = "mvp-api",
                ["Jwt:Audience"] = "mvp-web"
            }).Build();
        var jwt = new JwtService(config);
        var handler = new LoginHandler(db, jwt);

        var result = await handler.Handle(
            new LoginCommand("owner@test", "secret"), CancellationToken.None);

        result.Token.Should().NotBeEmpty();
        result.MustChangePassword.Should().BeFalse();
    }

    [Fact]
    public async Task Handle_WrongPassword_ThrowsUnauthorized()
    {
        var opts = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;
        var db = new AppDbContext(opts);
        db.Users.Add(new User {
            Id = Guid.NewGuid(), CompanyId = Guid.NewGuid(),
            Username = "owner@test",
            PasswordHash = BCrypt.Net.BCrypt.HashPassword("correct"),
            Role = "Owner"
        });
        await db.SaveChangesAsync();

        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> {
                ["Jwt:Secret"] = "super-secret-key-at-least-32-chars!!",
                ["Jwt:Issuer"] = "mvp-api", ["Jwt:Audience"] = "mvp-web"
            }).Build();
        var handler = new LoginHandler(db, new JwtService(config));

        var act = () => handler.Handle(
            new LoginCommand("owner@test", "wrong"), CancellationToken.None);

        await act.Should().ThrowAsync<UnauthorizedAccessException>();
    }
}
