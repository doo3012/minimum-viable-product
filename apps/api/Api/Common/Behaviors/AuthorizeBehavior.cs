using Api.Common.Exceptions;
using Api.Common.Interfaces;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Api.Common.Behaviors;

public class AuthorizeBehavior<TRequest, TResponse>(
    IHttpContextAccessor httpContextAccessor,
    AppDbContext db)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : IAuthorizeRole
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var globalRole = httpContextAccessor.HttpContext?.User
            .FindFirst("global_role")?.Value;

        // Owner bypasses all checks
        if (globalRole == "Owner")
            return await next();

        // For non-Owner users, resolve BU-scoped role if the request is BU-scoped
        if (request is IBuScoped buScoped)
        {
            var userId = httpContextAccessor.HttpContext?.User
                .FindFirst("sub")?.Value;

            if (userId == null)
                throw new ForbiddenException();

            var userGuid = Guid.Parse(userId);

            // Look up the user's role in this specific BU via staff_bu
            var buRole = await db.StaffBus
                .Where(sb => sb.BuId == buScoped.BuId)
                .Join(db.StaffProfiles.IgnoreQueryFilters(),
                    sb => sb.StaffId,
                    sp => sp.Id,
                    (sb, sp) => new { sb.Role, sp.UserId })
                .Where(x => x.UserId == userGuid)
                .Select(x => x.Role)
                .FirstOrDefaultAsync(cancellationToken);

            if (buRole == null || !request.AllowedRoles.Contains(buRole))
                throw new ForbiddenException();
        }
        else
        {
            // Non-BU-scoped request — only Owner can access (and Owner already passed above)
            // If we're here, the user is NOT an Owner, so deny
            throw new ForbiddenException();
        }

        return await next();
    }
}
