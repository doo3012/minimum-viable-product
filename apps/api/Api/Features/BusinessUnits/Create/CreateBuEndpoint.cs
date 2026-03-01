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
            var cmd = new CreateBuCommand(req.Name) { CompanyId = companyId };
            var id = await mediator.Send(cmd, ct);
            return Results.Created($"/api/business-units/{id}", new { id });
        }).RequireAuthorization();
    }
}
public record CreateBuRequest(string Name);
