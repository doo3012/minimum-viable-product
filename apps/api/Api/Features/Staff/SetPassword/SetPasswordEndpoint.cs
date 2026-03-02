using MediatR;
namespace Api.Features.Staff.SetPassword;

public static class SetPasswordEndpoint
{
    public static void MapSetPassword(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/staff/{id:guid}/password", async (
            Guid id, SetPasswordRequest req,
            IMediator mediator, CancellationToken ct) =>
        {
            try
            {
                await mediator.Send(new SetPasswordCommand(id, req.NewPassword), ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("SetStaffPassword")
        .WithTags("Staff")
        .Produces(200)
        .Produces(404)
        .Produces(401)
        .Produces(403);
    }
}
public record SetPasswordRequest(string NewPassword);
