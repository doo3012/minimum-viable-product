using MediatR;

namespace Api.Features.ChatTokens.CreateChatToken;

public record CreateChatTokenCommand(Guid BuId) : IRequest<ChatTokenResult>;

public record ChatTokenResult(string Token);
