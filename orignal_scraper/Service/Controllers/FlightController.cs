using System.ComponentModel;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/Flight")]
public class FlightController : ControllerBase
{
    private readonly IPortDelaysWorker _portDelaysWorker;
    private readonly IScraperService _scraperService;
    private readonly IDataService _dataService;

    public FlightController(IPortDelaysWorker portDelaysWorker, IScraperService scraperService, IDataService dataService)
    {
        _portDelaysWorker = portDelaysWorker;
        _scraperService = scraperService;
        _dataService = dataService;
    }


    [HttpGet]
    [Route("GetArrivals")]
    public async Task<IEnumerable<Flight>> GetArrivalsForDateRange([FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
    {
        return await _portDelaysWorker.GetArrivalsByDateRange(startDate, endDate);
    }

    [HttpGet]
    [Route("GetDepartures")]
    public async Task<IEnumerable<Flight>> GetDeparturesForDateRange([FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
    {
        return await _portDelaysWorker.GetDepaturesByDateRange(startDate, endDate);
    }

    [HttpGet]
    [Route("GetAirlineDelayStats")]
    public async Task<AirlineDelayStats> GetAirlineAverageDelays([FromQuery] string airline, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
    {
        return await _portDelaysWorker.GetAirlineAverageDelays(airline, startDate, endDate);
    }

    [HttpGet]
    [Route("GetAirlineLocationDelayStats")]
    public async Task<AirlineLocationDelayStats> GetAirlineLocationAverageDelays([FromQuery] string airline, [FromQuery] string location, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
    {

        return await _portDelaysWorker.GetAirlineLocationAverageDelays(airline, location, startDate, endDate);
    }

    [HttpGet]
    [Route("GetDelayStats")]
    public async Task<AirlineLocationDelayStats> GetDelayStats([FromQuery] string? airline, [FromQuery] string? location, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate)
    {
        return await _portDelaysWorker.GetDelayStats(airline, location, startDate, endDate);
    }

    [HttpGet]
    [Route("GetFlightPerformanceStats")]
    public async Task<FlightPerformanceStats> GetFlightPerformanceStats([FromQuery] string? airline, [FromQuery] string? location, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate, [FromQuery] string? flightType = null)
    {
        return await _portDelaysWorker.GetFlightPerformanceStats(airline, location, startDate, endDate, flightType);
    }

    [HttpGet]
    [Route("GetMonthlyFlightPerformanceStats")]
    public async Task<IEnumerable<MontlyFlightPerformanceStats>> GetMonthlyFlightPerformanceStats([FromQuery] string? airline, [FromQuery] string? location, [FromQuery] DateTime startDate, [FromQuery] DateTime endDate, [FromQuery] string? flightType = null)
    {
        return await _portDelaysWorker.GetMonthlyFlightPerformanceStats(airline, location, startDate, endDate, flightType);
    }
}
