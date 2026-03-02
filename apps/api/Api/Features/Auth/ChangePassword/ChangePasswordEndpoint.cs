using MediatR;
using System.Security.Claims;
namespace Api.Features.Auth.ChangePassword;

public static class ChangePasswordEndpoint
{
    public static void MapChangePassword(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/change-password", async (
            ChangePasswordRequest req, IMediator mediator,
            ClaimsPrincipal user, CancellationToken ct) =>
        {
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user.FindFirst("sub")!.Value);
            await mediator.Send(new ChangePasswordCommand(userId, req.NewPassword), ct);
            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("ChangePassword")
        .WithTags("Auth")
        .Produces(200)
        .Produces(401);
    }
}
public record ChangePasswordRequest(string NewPassword);
