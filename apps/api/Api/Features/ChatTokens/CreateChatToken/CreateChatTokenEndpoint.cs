using MediatR;

namespace Api.Features.ChatTokens.CreateChatToken;

public static class CreateChatTokenEndpoint
{
    public static void MapCreateChatToken(this WebApplication app) =>
        app.MapPost("/api/chat-tokens",
            async (CreateChatTokenCommand cmd, IMediator mediator) =>
                Results.Ok(await mediator.Send(cmd)))
        .RequireAuthorization();
}
