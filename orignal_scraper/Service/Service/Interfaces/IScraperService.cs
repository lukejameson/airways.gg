
public interface IScraperService
{
    Task<IEnumerable<Flight>> GetFlightsForRange(DateTime start, DateTime end, FlightType type);
    Task<IEnumerable<Flight>> GetFlight(DateTime date, FlightType type);
}
