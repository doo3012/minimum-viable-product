using MediatR;
using System.Security.Claims;
namespace Api.Features.BusinessUnits.Delete;

public static class DeleteBuEndpoint
{
    public static void MapDeleteBu(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/business-units/{id:guid}", async (
            Guid id, IMediator mediator,
            ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new DeleteBuCommand(id) { CompanyId = companyId };
            try
            {
                await mediator.Send(cmd, ct);
                return Results.NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("DeleteBusinessUnit")
        .WithTags("BusinessUnits")
        .Produces(204)
        .Produces(401)
        .Produces(403)
        .Produces(409);
    }
}
