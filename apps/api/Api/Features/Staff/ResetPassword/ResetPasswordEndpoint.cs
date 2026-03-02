using MediatR;
namespace Api.Features.Staff.ResetPassword;

public static class ResetPasswordEndpoint
{
    public static void MapResetPassword(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/staff/{id:guid}/reset-password", async (
            Guid id, IMediator mediator, CancellationToken ct) =>
        {
            try
            {
                var newPassword = await mediator.Send(new ResetPasswordCommand(id), ct);
                return Results.Ok(new { newPassword });
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
            catch (InvalidOperationException ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        })
        .RequireAuthorization()
        .WithName("ResetStaffPassword")
        .WithTags("Staff")
        .Produces(200)
        .Produces(404)
        .Produces(401)
        .Produces(403);
    }
}
