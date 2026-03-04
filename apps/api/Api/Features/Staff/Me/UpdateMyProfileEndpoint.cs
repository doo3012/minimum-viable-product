using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.Me;

public static class UpdateMyProfileEndpoint
{
    public static void MapUpdateMyProfile(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/staff/me", async (
            UpdateMyProfileRequest req,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user.FindFirst("sub")!.Value);
            try
            {
                await mediator.Send(
                    new UpdateMyProfileCommand(userId, req.FirstName, req.LastName), ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        })
        .RequireAuthorization()
        .WithName("UpdateMyProfile")
        .WithTags("Staff")
        .Produces(200)
        .Produces(404)
        .Produces(401);
    }
}

public record UpdateMyProfileRequest(string FirstName, string LastName);
