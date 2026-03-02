using MediatR;
using System.Security.Claims;
namespace Api.Features.BusinessUnits.Create;

public static class CreateBuEndpoint
{
    public static void MapCreateBu(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/business-units", async (
            CreateBuRequest req, IMediator mediator,
            ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var userId = Guid.Parse(user.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? user.FindFirst("sub")!.Value);
            var cmd = new CreateBuCommand(req.Name) { CompanyId = companyId, UserId = userId };
            var id = await mediator.Send(cmd, ct);
            return Results.Created($"/api/business-units/{id}", new { id });
        })
        .RequireAuthorization()
        .WithName("CreateBusinessUnit")
        .WithTags("BusinessUnits")
        .Produces(201)
        .Produces(401)
        .Produces(403);
    }
}
public record CreateBuRequest(string Name);
