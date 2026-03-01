using Api.Common.Interfaces;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;

namespace Api.Common.Behaviors;

public class TenantBehavior<TRequest, TResponse>(
    IHttpContextAccessor httpContextAccessor,
    AppDbContext db)
    : IPipelineBehavior<TRequest, TResponse>
    where TRequest : ITenantScoped
{
    public async Task<TResponse> Handle(
        TRequest request,
        RequestHandlerDelegate<TResponse> next,
        CancellationToken cancellationToken)
    {
        var claim = httpContextAccessor.HttpContext?.User
            .FindFirst("company_id")?.Value;

        if (Guid.TryParse(claim, out var companyId))
            db.SetTenant(companyId);

        return await next();
    }
}
