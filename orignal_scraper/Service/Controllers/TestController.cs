using Microsoft.AspNetCore.Mvc;

namespace Port.Delays.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TestController : ControllerBase
{
    private readonly IPortDelaysWorker _portDelaysWorker;
    private readonly IScraperService _scraperService;
    private readonly IDataService _dataService;

    public TestController(IPortDelaysWorker portDelaysWorker, IScraperService scraperService, IDataService dataService)
    {
        _portDelaysWorker = portDelaysWorker;
        _scraperService = scraperService;
        _dataService = dataService;
    }

    [HttpGet]
    [Route("Arrival")]
    public async Task<IEnumerable<Flight>> GetArrivalForDate([FromQuery] DateTime date)
    {
        return await _scraperService.GetFlight(date, FlightType.Arrival);
    }

    [HttpGet]
    [Route("Depature")]
    public async Task<IEnumerable<Flight>> GetDeparturesForDate([FromQuery] DateTime date)
    {
        return await _scraperService.GetFlight(date, FlightType.Departure);
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

    // [HttpPost]
    // [Route("Arrival")]
    // public async Task<bool> InsertArrival([FromBody] Flight flight)
    // {
    //     return await _portDelaysWorker.InsertArrival(flight);
    // }

    // [HttpPost]
    // [Route("Departure")]
    // public async Task<bool> InsertDepature([FromBody] Flight flight)
    // {
    //     return await _portDelaysWorker.InsertDeparture(flight);
    // }
}
