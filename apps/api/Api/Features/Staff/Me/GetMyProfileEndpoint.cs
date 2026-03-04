using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.Me;

public static class GetMyProfileEndpoint
{
    public static void MapGetMyProfile(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/staff/me", async (
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user.FindFirst("sub")!.Value);
            var result = await mediator.Send(new GetMyProfileQuery(userId), ct);
            if (result is null) return Results.NotFound();
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("GetMyProfile")
        .WithTags("Staff")
        .Produces<MyProfileDto>(200)
        .Produces(404)
        .Produces(401);
    }
}
