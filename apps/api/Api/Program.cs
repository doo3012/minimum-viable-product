// apps/api/Api/Program.cs
using Api.Common.Behaviors;
using Api.Common.Jwt;
using Api.Features.Auth.ChangePassword;
using Api.Features.Auth.Login;
using Api.Features.BusinessUnits.Create;
using Api.Features.BusinessUnits.List;
using Api.Features.ChatPermissions.Grant;
using Api.Features.ChatPermissions.ListByBu;
using Api.Features.ChatPermissions.Revoke;
using Api.Features.Companies.Onboard;
using Api.Features.Staff.Create;
using Api.Features.Staff.GetById;
using Api.Features.Staff.List;
using Api.Features.Staff.UpdateBuScoped;
using Api.Infrastructure.Messaging;
using Api.Infrastructure.Persistence;
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

builder.Services.AddMediatR(cfg => {
    cfg.RegisterServicesFromAssemblyContaining<Program>();
    cfg.AddOpenBehavior(typeof(TenantBehavior<,>));
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
});
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt => {
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
app.MapOpenApi();
app.MapScalarApiReference();

// Companies
app.MapOnboard();

// Auth
app.MapLogin();
app.MapChangePassword();

// Business Units
app.MapCreateBu();
app.MapListBu();

// Staff
app.MapCreateStaff();
app.MapListStaff();
app.MapGetStaff();
app.MapUpdateBuScoped();

// Chat Permissions
app.MapGrantPermission();
app.MapRevokePermission();
app.MapListPermissionsByBu();

await NatsStreamBootstrap.EnsureStreamAsync(app.Configuration);

app.Run();

// Required for WebApplicationFactory in tests
public partial class Program { }
