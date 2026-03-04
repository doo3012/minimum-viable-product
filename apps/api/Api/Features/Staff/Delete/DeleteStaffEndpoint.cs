using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.Delete;

public static class DeleteStaffEndpoint
{
    public static void MapDeleteStaff(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/staff/{id:guid}", async (
            Guid id, IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new DeleteStaffCommand(id) { CompanyId = companyId };
            try
            {
                await mediator.Send(cmd, ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        }).RequireAuthorization()
          .WithName("DeleteStaff")
          .WithTags("Staff")
          .Produces(200)
          .Produces(404)
          .Produces(401)
          .Produces(403);
    }
}
