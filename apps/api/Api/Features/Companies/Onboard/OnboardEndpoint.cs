using MediatR;
namespace Api.Features.Companies.Onboard;

public static class OnboardEndpoint
{
    public static void MapOnboard(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/companies/onboard", async (
            OnboardRequest req,
            IMediator mediator,
            CancellationToken ct) =>
        {
            try {
                var result = await mediator.Send(
                    new OnboardCommand(req.CompanyName, req.Address, req.ContactNumber, req.FirstName, req.LastName, req.Email), ct);
                return Results.Ok(result);
            }
            catch (InvalidOperationException ex) {
                return Results.Conflict(new { error = ex.Message });
            }
        })
        .WithName("OnboardCompany")
        .WithTags("Companies")
        .Produces<OnboardResult>(200)
        .Produces(409);
    }
}

public record OnboardRequest(string CompanyName, string Address, string ContactNumber, string FirstName, string LastName, string Email);
