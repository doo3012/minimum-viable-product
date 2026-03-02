using MediatR;
namespace Api.Features.Staff.UpdateBuScoped;

public static class UpdateBuScopedEndpoint
{
    public static void MapUpdateBuScoped(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/staff/{staffId:guid}/bu/{buId:guid}", async (
            Guid staffId, Guid buId,
            UpdateBuScopedRequest req, IMediator mediator, CancellationToken ct) =>
        {
            await mediator.Send(new UpdateBuScopedCommand(staffId, buId, req.Email), ct);
            return Results.Ok();
        }).RequireAuthorization()
        .WithName("UpdateStaffBuScoped")
        .WithTags("Staff")
        .Produces(200)
        .Produces(401);
    }
}
public record UpdateBuScopedRequest(string Email);
