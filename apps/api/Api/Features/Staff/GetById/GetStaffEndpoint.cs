using MediatR;
namespace Api.Features.Staff.GetById;

public static class GetStaffEndpoint
{
    public static void MapGetStaff(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/staff/{id:guid}", async (Guid id, IMediator mediator, CancellationToken ct) =>
        {
            var result = await mediator.Send(new GetStaffQuery(id), ct);
            return result is null ? Results.NotFound() : Results.Ok(result);
        }).RequireAuthorization();
    }
}
