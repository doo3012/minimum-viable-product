using MediatR;
using System.Security.Claims;
namespace Api.Features.Companies.Settings;

public static class GetCompanySettingsEndpoint
{
    public static void MapGetCompanySettings(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/companies/me", async (
            IMediator mediator, ClaimsPrincipal user, CancellationToken ct) =>
        {
            var globalRole = user.FindFirst("global_role")?.Value;
            if (globalRole != "Owner")
                return Results.Forbid();

            var companyId = Guid.Parse(user.FindFirst("company_id")!.Value);
            var result = await mediator.Send(new GetCompanySettingsQuery(companyId), ct);
            if (result is null) return Results.NotFound();
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("GetCompanySettings")
        .WithTags("Companies")
        .Produces<CompanySettingsDto>(200)
        .Produces(403)
        .Produces(404)
        .Produces(401);
    }
}
