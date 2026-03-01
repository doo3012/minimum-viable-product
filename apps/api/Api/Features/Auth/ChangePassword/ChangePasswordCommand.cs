using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Auth.ChangePassword;
public record ChangePasswordCommand(Guid UserId, string NewPassword)
    : IRequest<Unit>, ITenantScoped;
