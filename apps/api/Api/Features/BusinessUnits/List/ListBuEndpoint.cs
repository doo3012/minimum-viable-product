using MediatR;
using System.Security.Claims;
namespace Api.Features.BusinessUnits.List;
public static class ListBuEndpoint
{
    public static void MapListBu(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/business-units", async (
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var result = await mediator.Send(new ListBuQuery(), ct);
            return Results.Ok(result);
        }).RequireAuthorization();
    }
}
