using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Api.Features.ChatTokens.CreateChatToken;

public class CreateChatTokenHandler(
    IHttpContextAccessor httpContextAccessor,
    IConfiguration config,
    AppDbContext db) : IRequestHandler<CreateChatTokenCommand, ChatTokenResult>
{
    public async Task<ChatTokenResult> Handle(
        CreateChatTokenCommand request,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(
            httpContextAccessor.HttpContext!.User.FindFirst("sub")!.Value);
        var globalRole = httpContextAccessor.HttpContext!.User
            .FindFirst("global_role")?.Value;

        // Owner always has chat access
        if (globalRole != "Owner")
        {
            // Check chat_permissions for this user+BU
            var staff = await db.StaffProfiles
                .IgnoreQueryFilters()
                .FirstOrDefaultAsync(s => s.UserId == userId, cancellationToken)
                ?? throw new KeyNotFoundException("Staff profile not found");

            var hasPermission = await db.ChatPermissions
                .AnyAsync(cp => cp.StaffId == staff.Id && cp.BuId == request.BuId,
                    cancellationToken);

            if (!hasPermission)
                throw new Api.Common.Exceptions.ForbiddenException();
        }

        // Get display name
        var profile = await db.StaffProfiles
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == userId, cancellationToken);

        var displayName = profile != null
            ? $"{profile.FirstName} {profile.LastName}"
            : "Unknown";

        // Generate short-lived chat token
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(config["Jwt:Secret"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim("sub", userId.ToString()),
            new Claim("bu_id", request.BuId.ToString()),
            new Claim("display_name", displayName),
            new Claim("purpose", "chat"),
        };

        var token = new JwtSecurityToken(
            issuer: config["Jwt:Issuer"],
            audience: "mvp-chat",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(5),
            signingCredentials: creds);

        return new ChatTokenResult(new JwtSecurityTokenHandler().WriteToken(token));
    }
}
