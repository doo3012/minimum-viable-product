using Api.Common.Behaviors;
using Api.Common.Interfaces;
using Api.Infrastructure.Persistence;
using FluentAssertions;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using System.Security.Claims;

namespace Api.Tests.Common;

public class TenantBehaviorTests
{
    [Fact]
    public async Task Should_SetTenantOnDbContext_WhenRequestIsTenantScoped()
    {
        var companyId = Guid.NewGuid();
        var httpContextAccessor = Substitute.For<IHttpContextAccessor>();
        var httpContext = new DefaultHttpContext();
        httpContext.User = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim("company_id", companyId.ToString())
        ]));
        httpContextAccessor.HttpContext.Returns(httpContext);

        var dbOptions = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase("test")
            .Options;
        var db = new AppDbContext(dbOptions);

        var behavior = new TenantBehavior<TestTenantRequest, Unit>(httpContextAccessor, db);
        var next = Substitute.For<RequestHandlerDelegate<Unit>>();

        await behavior.Handle(new TestTenantRequest(), next, CancellationToken.None);

        await next.Received(1).Invoke();
    }
}

public class TestTenantRequest : IRequest<Unit>, ITenantScoped { }
