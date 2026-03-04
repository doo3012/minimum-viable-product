using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.UpdateProfile;

public static class UpdateStaffProfileEndpoint
{
    public static void MapUpdateStaffProfile(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/staff/{id:guid}", async (
            Guid id, UpdateStaffProfileRequest req,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new UpdateStaffProfileCommand(id, req.FirstName, req.LastName)
                { CompanyId = companyId };
            try
            {
                await mediator.Send(cmd, ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        }).RequireAuthorization()
          .WithName("UpdateStaffProfile")
          .WithTags("Staff")
          .Produces(200)
          .Produces(404)
          .Produces(401)
          .Produces(403);
    }
}
public record UpdateStaffProfileRequest(string FirstName, string LastName);
