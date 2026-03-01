using MediatR;
namespace Api.Features.Auth.Login;
public record LoginCommand(string Username, string Password) : IRequest<LoginResult>;
public record LoginResult(string Token, bool MustChangePassword, Guid UserId, string Role);
