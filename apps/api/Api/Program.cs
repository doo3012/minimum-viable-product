// apps/api/Api/Program.cs
var builder = WebApplication.CreateBuilder(args);
// (configure services here - subsequent tasks fill this in)
var app = builder.Build();
app.Run();

// Required for WebApplicationFactory in tests
public partial class Program { }
