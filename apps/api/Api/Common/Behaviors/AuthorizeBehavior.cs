using Api.Common.Exceptions;
using Api.Common.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Http;

namespace Api.Common.Behaviors;

public class AuthorizeBehavior<TRequest, TResponse>(
    IHttpContextAccessor httpContextAccessor)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IAuthorizeRole
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var role = httpContextAccessor.HttpContext?.User
            .FindFirst("global_role")?.Value;

        if (role == null || !request.AllowedRoles.Contains(role))
            throw new ForbiddenException();

        return await next();
    }
}
