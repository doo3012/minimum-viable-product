using MediatR;
namespace Api.Features.ChatPermissions.ListByBu;

public static class ListByBuEndpoint
{
    public static void MapListPermissionsByBu(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/business-units/{buId:guid}/chat-permissions", async (
            Guid buId, IMediator mediator, CancellationToken ct) =>
            Results.Ok(await mediator.Send(new ListByBuQuery(buId), ct))
        ).RequireAuthorization()
         .WithName("ListChatPermissionsByBu")
         .WithTags("ChatPermissions")
         .Produces<IEnumerable<ChatPermissionDto>>(200)
         .Produces(401);
    }
}
