using Microsoft.AspNetCore.Mvc;

namespace Service.Controllers;

[ApiController]
[Route("api/Scraper")]
public class ScraperService : ControllerBase
{
    private readonly IPortDelaysWorker _portDelaysWorker;
    private readonly IScraperService _scraperService;
    private readonly IDataService _dataService;

    public ScraperService(IPortDelaysWorker portDelaysWorker, IScraperService scraperService, IDataService dataService)
    {
        _portDelaysWorker = portDelaysWorker;
        _scraperService = scraperService;
        _dataService = dataService;
    }

    [HttpGet]
    [Route("Arrivals")]
    public async Task<IEnumerable<Flight>> GetArrivalsForDateRange([FromQuery] DateTime start, [FromQuery] DateTime end, [FromQuery] bool writeToDb = false)
    {
        var scrapedFlights = await _scraperService.GetFlightsForRange(start, end, FlightType.Arrival);
        var doesDataExist = await _dataService.DoesDataExist(start, end, FlightType.Arrival);

        if (doesDataExist)
        {
            var existingFlights = await _portDelaysWorker.GetArrivalsByDateRange(start, end);
            var missingFlights = scrapedFlights.Except(existingFlights).ToList();

            if (missingFlights.Any())
            {
                await _dataService.ProcessData(missingFlights, FlightType.Arrival);
            }

            return scrapedFlights;
        }

        if (writeToDb)
        {
            await _dataService.ProcessData(scrapedFlights, FlightType.Arrival);
        }

        return scrapedFlights;
    }

    [HttpGet]
    [Route("Depatures")]
    public async Task<IEnumerable<Flight>> GetDeparturesForDateRange([FromQuery] DateTime start, [FromQuery] DateTime end, [FromQuery] bool writeToDb = false)
    {
        var scrapedFlights = await _scraperService.GetFlightsForRange(start, end, FlightType.Departure);
        var doesDataExist = await _dataService.DoesDataExist(start, end, FlightType.Departure);

        if (doesDataExist)
        {
            var existingFlights = await _portDelaysWorker.GetDepaturesByDateRange(start, end);
            var missingFlights = scrapedFlights.Except(existingFlights).ToList();

            if (missingFlights.Any())
            {
                await _dataService.ProcessData(missingFlights, FlightType.Departure);
            }

            return scrapedFlights;
        }

        if (writeToDb)
        {
            await _dataService.ProcessData(scrapedFlights, FlightType.Departure);
        }

        return scrapedFlights;
    }

}
