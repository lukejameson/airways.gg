using System.Data;
using Microsoft.Extensions.Options;
using Microsoft.OpenApi.Models;
using Npgsql;
using Service.Settings;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "My API", Version = "v1" });
    c.EnableAnnotations();             // This method should now be available
    // c.DescribeStringEnumsInCamelCase(); // Optional: if you want camelCase for string enums
});

builder.Services.AddScoped<IDbConnection>(provider =>
{
    var configuration = provider.GetRequiredService<IConfiguration>();
    var connectionString = configuration.GetConnectionString("DefaultConnection");

    if (string.IsNullOrEmpty(connectionString))
    {
        throw new InvalidOperationException("Connection string 'DefaultConnection' not found.");
    }

    return new NpgsqlConnection(connectionString);
});

builder.Services.Configure<Config>(builder.Configuration.GetSection("Config"));

builder.Services
  .AddHttpClient<IScraperService, ScraperService>((sp, client) =>
  {
      var cfg = sp.GetRequiredService<IOptions<Config>>().Value;
      client.BaseAddress = new Uri(cfg.Url);
  });

// Data Workers
builder.Services.AddScoped<IPortDelaysWorker, PortDelaysWorker>();
builder.Services.AddScoped<IDataService, DataService>();

builder.Services.AddSingleton<IScraperService, ScraperService>();


var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseAuthentication();
app.MapControllers();

app.Run();
