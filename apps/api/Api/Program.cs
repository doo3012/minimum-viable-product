// apps/api/Api/Program.cs
using Api.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

// (configure additional services here - subsequent tasks fill this in)
var app = builder.Build();
app.Run();

// Required for WebApplicationFactory in tests
public partial class Program { }
