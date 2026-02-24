using System.Globalization;
using AngleSharp;
using Microsoft.Extensions.Options;
using Service.Settings;

public class ScraperService : IScraperService
{
    private readonly Config _config;
    private readonly HttpClient _client;

    public ScraperService(IOptions<Config> config, HttpClient client)
    {
        _config = config.Value;
        _client = client;
    }

    public async Task<IEnumerable<Flight>> GetFlight(DateTime date, FlightType type)
    {
        return await GetFlightRecords(date, type);
    }

    public async Task<IEnumerable<Flight>> GetFlightsForRange(DateTime start, DateTime end, FlightType type)
    {
        var dates = new List<DateTime>();
        var flights = new List<Flight>();

        for (var dt = start.Date; dt <= end.Date; dt = dt.AddDays(1))
        {
            dates.Add(dt);
        }

        foreach (var date in dates)
        {
            var flight = await GetFlightRecords(date, type).ConfigureAwait(false);

            flights.AddRange(flight);
        }

        return flights;
    }

    private async Task<IEnumerable<Flight>> GetFlightRecords(DateTime date, FlightType type)
    {
        var tableLocator = type == FlightType.Arrival ? "table-arrivals" : "table-departures";
        var statusLocator = type == FlightType.Arrival ? "Landed" : "Airborne";

        var token = CancellationToken.None;
        var parsedDate = date.ToString("ddMMyyyy");
        var parsedUrl = $"{_config.Url}/{parsedDate}";

        var response = await GetStringAsync(parsedUrl, token);

        var context = BrowsingContext.New();
        var document = await context.OpenAsync(req => req.Content(response));

        var flighs = new List<Flight>();

        var table = document.QuerySelector($"table#{tableLocator}");

        if (table != null)
        {
            var rows = table.QuerySelectorAll("tbody.list > tr[data-search='true']");

            foreach (var row in rows)
            {
                var cells = row.QuerySelectorAll("td").ToList();

                var airline = cells[0]
                  .QuerySelector("span")
                  ?.TextContent
                  .Trim()
                  ?? "Unknown";

                var timeStr = cells[1].TextContent.Trim();
                var time = DateTime.ParseExact(timeStr, "HH:mm", CultureInfo.InvariantCulture);
                var scheduledDateTime = date.Date.Add(time.TimeOfDay);
                var location = cells[2].TextContent.Trim();
                var flightCode = cells[3].TextContent.Trim();

                var landedDiv = cells[4]
                    .QuerySelectorAll("div.status-change")
                    .FirstOrDefault(div =>
                    {
                        var comment = div.QuerySelector("span.comment")
                                            ?.TextContent
                                            .Trim() ?? "";
                        return comment.StartsWith($"{statusLocator}", StringComparison.OrdinalIgnoreCase);
                    });

                DateTime actualDateTime;
                if (landedDiv != null)
                {
                    var comment = landedDiv
                      .QuerySelector("span.comment")!
                      .TextContent
                      .Trim();

                    // Handle different formats for arrivals vs departures
                    if (type == FlightType.Departure)
                    {
                        // For departures: "Airborne at HH:mm"
                        var atIndex = comment.LastIndexOf(" at ");
                        if (atIndex != -1)
                        {
                            var actualTimeStr = comment.Substring(atIndex + 4); // Skip " at "
                            if (DateTime.TryParseExact(actualTimeStr, "HH:mm",
                                  CultureInfo.InvariantCulture,
                                  DateTimeStyles.None,
                                  out var actualTime))
                            {
                                actualDateTime = date.Date.Add(actualTime.TimeOfDay);
                            }
                            else
                            {
                                actualDateTime = scheduledDateTime;
                            }
                        }
                        else
                        {
                            actualDateTime = scheduledDateTime;
                        }
                    }
                    else
                    {
                        // For arrivals: "Landed HH:mm" (original format)
                        var parts = comment.Split(' ', 2);
                        if (parts.Length == 2 &&
                            DateTime.TryParseExact(parts[1], "HH:mm",
                              CultureInfo.InvariantCulture,
                              DateTimeStyles.None,
                              out var actualTime))
                        {
                            actualDateTime = date.Date.Add(actualTime.TimeOfDay);
                        }
                        else
                        {
                            actualDateTime = scheduledDateTime;
                        }
                    }
                }
                else
                {
                    // No status found; default to scheduled
                    actualDateTime = scheduledDateTime;
                }

                flighs.Add(new Flight
                {
                    Airline = airline,
                    Location = location,
                    Code = flightCode,
                    ScheduledTime = scheduledDateTime,
                    ActualTime = actualDateTime
                });
            }
        }


        return flighs;
    }

    private async Task<string> GetStringAsync(string url, CancellationToken ct = default)
    {
        var resp = await _client.GetAsync(url, ct).ConfigureAwait(false);
        resp.EnsureSuccessStatusCode();
        return await resp.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
    }
}
