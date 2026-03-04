// apps/api/Api/Program.cs
using Api.Common.Behaviors;
using Api.Common.Exceptions;
using Api.Common.Jwt;
using Api.Features.Auth.ChangePassword;
using Api.Features.Auth.Login;
using Api.Features.BusinessUnits.Create;
using Api.Features.BusinessUnits.Delete;
using Api.Features.BusinessUnits.List;
using Api.Features.ChatPermissions.Grant;
using Api.Features.ChatTokens.CreateChatToken;
using Api.Features.ChatPermissions.ListByBu;
using Api.Features.ChatPermissions.Revoke;
using Api.Features.Companies.Onboard;
using Api.Features.Companies.Settings;
using Api.Features.Staff.Create;
using Api.Features.Staff.GetById;
using Api.Features.Staff.List;
using Api.Features.Staff.Me;
using Api.Features.Staff.MyBuAssignments;
using Api.Features.Staff.ResetPassword;
using Api.Features.Staff.SetPassword;
using Api.Features.Staff.AddBu;
using Api.Features.Staff.Delete;
using Api.Features.Staff.RemoveBu;
using Api.Features.Staff.UpdateBuScoped;
using Api.Features.Staff.UpdateProfile;
using Api.Infrastructure.Chat;
using Api.Infrastructure.Messaging;
using Api.Infrastructure.Persistence;
using MassTransit;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Postgres"))
       .UseSnakeCaseNamingConvention());

builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton<JwtService>();
builder.Services.AddSingleton<INatsPublisher, NatsPublisher>();
builder.Services.AddHttpClient<IChatServiceClient, ChatServiceClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Chat:BaseUrl"] ?? "http://chat:8080");
});

builder.Services.AddMediatR(cfg => {
    cfg.RegisterServicesFromAssemblyContaining<Program>();
    cfg.AddOpenBehavior(typeof(AuthorizeBehavior<,>));
    cfg.AddOpenBehavior(typeof(TenantBehavior<,>));
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
});
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// MassTransit with RabbitMQ + EF Core Outbox
builder.Services.AddMassTransit(x =>
{
    x.AddEntityFrameworkOutbox<AppDbContext>(o =>
    {
        o.UsePostgres();
        o.UseBusOutbox();
    });

    x.UsingRabbitMq((context, cfg) =>
    {
        cfg.Host(builder.Configuration["RabbitMQ:Host"] ?? "rabbitmq", "/", h =>
        {
            h.Username(builder.Configuration["RabbitMQ:Username"] ?? "guest");
            h.Password(builder.Configuration["RabbitMQ:Password"] ?? "guest");
        });
        cfg.ConfigureEndpoints(context);
    });
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt => {
        opt.MapInboundClaims = false;
        opt.TokenValidationParameters = new TokenValidationParameters {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Secret"]!))
        };
        // Read JWT from cookie
        opt.Events = new JwtBearerEvents {
            OnMessageReceived = ctx => {
                ctx.Token = ctx.Request.Cookies["auth_token"];
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();

app.Use(async (context, next) =>
{
    try { await next(); }
    catch (ForbiddenException)
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsJsonAsync(new { error = "Forbidden" });
    }
    catch (KeyNotFoundException ex)
    {
        context.Response.StatusCode = 404;
        await context.Response.WriteAsJsonAsync(new { error = ex.Message });
    }
});

app.MapOpenApi();
app.MapScalarApiReference();

// Companies
app.MapOnboard();

// Auth
app.MapLogin();
app.MapChangePassword();

// Business Units
app.MapCreateBu();
app.MapDeleteBu();
app.MapListBu();

// Staff
app.MapCreateStaff();
app.MapListStaff();
app.MapGetMyProfile();   // MUST be before MapGetStaff
app.MapUpdateMyProfile();
app.MapGetMyBuAssignments();
app.MapGetStaff();
app.MapUpdateBuScoped();
app.MapResetPassword();
app.MapSetPassword();
app.MapDeleteStaff();
app.MapUpdateStaffProfile();
app.MapAddStaffBu();
app.MapRemoveStaffBu();

// Company Settings
app.MapGetCompanySettings();
app.MapUpdateCompanySettings();

// Chat Permissions
app.MapGrantPermission();
app.MapRevokePermission();
app.MapListPermissionsByBu();

// Chat Tokens
app.MapCreateChatToken();

app.Run();

// Required for WebApplicationFactory in tests
public partial class Program { }
