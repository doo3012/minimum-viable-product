using MediatR;
namespace Api.Features.Auth.Login;

public static class LoginEndpoint
{
    public static void MapLogin(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/auth/login", async (
            LoginRequest req, IMediator mediator,
            HttpContext ctx, CancellationToken ct) =>
        {
            try {
                var result = await mediator.Send(new LoginCommand(req.Username, req.Password), ct);
                ctx.Response.Cookies.Append("auth_token", result.Token, new CookieOptions {
                    HttpOnly = true, SameSite = SameSiteMode.Strict,
                    Secure = false,
                    Expires = DateTimeOffset.UtcNow.AddHours(24)
                });
                return Results.Ok(new {
                    result.UserId, result.Role, result.MustChangePassword
                });
            }
            catch (UnauthorizedAccessException) {
                return Results.Unauthorized();
            }
        })
        .WithName("Login")
        .WithTags("Auth")
        .Produces(200)
        .Produces(401);

        app.MapPost("/api/auth/logout", (HttpContext ctx) => {
            ctx.Response.Cookies.Delete("auth_token");
            return Results.Ok();
        })
        .WithName("Logout")
        .WithTags("Auth")
        .Produces(200);
    }
}
public record LoginRequest(string Username, string Password);
