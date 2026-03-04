using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.AddBu;

public static class AddStaffBuEndpoint
{
    public static void MapAddStaffBu(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/staff/{staffId:guid}/bu/{buId:guid}", async (
            Guid staffId, Guid buId,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new AddStaffBuCommand(staffId, buId) { CompanyId = companyId };
            try
            {
                var id = await mediator.Send(cmd, ct);
                return Results.Created($"/api/staff/{staffId}/bu/{buId}", new { id });
            }
            catch (InvalidOperationException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }
        }).RequireAuthorization()
          .WithName("AddStaffBu")
          .WithTags("Staff")
          .Produces(201)
          .Produces(409)
          .Produces(401)
          .Produces(403);
    }
}
