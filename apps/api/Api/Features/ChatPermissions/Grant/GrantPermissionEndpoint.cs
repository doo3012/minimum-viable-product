using MediatR;
namespace Api.Features.ChatPermissions.Grant;

public static class GrantPermissionEndpoint
{
    public static void MapGrantPermission(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/chat-permissions", async (
            GrantPermissionRequest req, IMediator mediator, CancellationToken ct) =>
        {
            try {
                var id = await mediator.Send(new GrantPermissionCommand(req.StaffId, req.BuId), ct);
                return Results.Created($"/api/chat-permissions/{id}", new { id });
            }
            catch (InvalidOperationException ex) {
                return Results.Conflict(new { error = ex.Message });
            }
        }).RequireAuthorization()
          .WithName("GrantChatPermission")
          .WithTags("ChatPermissions")
          .Produces(201)
          .Produces(409)
          .Produces(401);
    }
}
public record GrantPermissionRequest(Guid StaffId, Guid BuId);
