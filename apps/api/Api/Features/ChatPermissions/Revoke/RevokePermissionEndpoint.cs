using MediatR;
namespace Api.Features.ChatPermissions.Revoke;

public static class RevokePermissionEndpoint
{
    public static void MapRevokePermission(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/chat-permissions/{id:guid}", async (
            Guid id, IMediator mediator, CancellationToken ct) =>
        {
            try {
                await mediator.Send(new RevokePermissionCommand(id), ct);
                return Results.Ok();
            }
            catch (KeyNotFoundException) { return Results.NotFound(); }
        }).RequireAuthorization();
    }
}
