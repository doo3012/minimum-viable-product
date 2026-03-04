using MediatR;
using System.Security.Claims;
namespace Api.Features.Companies.Settings;

public static class UpdateCompanySettingsEndpoint
{
    public static void MapUpdateCompanySettings(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/companies/me", async (
            UpdateCompanySettingsRequest req,
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var globalRole = user.FindFirst("global_role")?.Value;
            if (globalRole != "Owner")
                return Results.Forbid();

            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            try
            {
                await mediator.Send(new UpdateCompanySettingsCommand(
                    companyId, req.CompanyName, req.Address, req.ContactNumber), ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        })
        .RequireAuthorization()
        .WithName("UpdateCompanySettings")
        .WithTags("Companies")
        .Produces(200)
        .Produces(403)
        .Produces(404)
        .Produces(401);
    }
}

public record UpdateCompanySettingsRequest(
    string CompanyName, string Address, string ContactNumber);
