using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.RemoveBu;

public static class RemoveStaffBuEndpoint
{
    public static void MapRemoveStaffBu(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/staff/{staffId:guid}/bu/{buId:guid}", async (
            Guid staffId, Guid buId,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new RemoveStaffBuCommand(staffId, buId) { CompanyId = companyId };
            try
            {
                await mediator.Send(cmd, ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        }).RequireAuthorization()
          .WithName("RemoveStaffBu")
          .WithTags("Staff")
          .Produces(200)
          .Produces(404)
          .Produces(401)
          .Produces(403);
    }
}
