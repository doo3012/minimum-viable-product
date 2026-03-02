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
            var result = await mediator.Send(
                new OnboardCommand(req.CompanyName, req.Address, req.ContactNumber), ct);
            return Results.Ok(result);
        })
        .WithName("OnboardCompany")
        .WithTags("Companies")
        .Produces<OnboardResult>(200);
    }
}

public record OnboardRequest(string CompanyName, string Address, string ContactNumber);
