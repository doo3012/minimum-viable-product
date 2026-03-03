using MediatR;
using System.Security.Claims;
namespace Api.Features.Staff.Create;

public static class CreateStaffEndpoint
{
    public static void MapCreateStaff(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/staff", async (
            CreateStaffRequest req, IMediator mediator,
            ClaimsPrincipal user, CancellationToken ct) =>
        {
            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var cmd = new CreateStaffCommand(
                req.FirstName, req.LastName, req.Role, req.BuId, req.Email, req.BuRole)
            { CompanyId = companyId };
            try
            {
                var id = await mediator.Send(cmd, ct);
                return Results.Created($"/api/staff/{id}", new { id });
            }
            catch (InvalidOperationException ex)
            {
                return Results.Conflict(new { error = ex.Message });
            }
        }).RequireAuthorization()
        .WithName("CreateStaff")
        .WithTags("Staff")
        .Produces(201)
        .Produces(401)
        .Produces(403)
        .Produces(409);
    }
}
public record CreateStaffRequest(
    string FirstName, string LastName, string Role, Guid BuId, string Email, string? BuRole);
