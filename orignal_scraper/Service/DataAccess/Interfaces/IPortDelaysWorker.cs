public interface IPortDelaysWorker
{
    Task<IEnumerable<Flight>> GetArrivalsByDateRange(DateTime StartDate, DateTime EndDate);
    Task<IEnumerable<Flight>> GetDepaturesByDateRange(DateTime StartDate, DateTime EndDate);

    Task<bool> DoesArrivalExist(DateTime start, DateTime end);
    Task<bool> DoesDepartureExist(DateTime start, DateTime end);

    Task<bool> InsertArrival(Flight flight);
    Task<bool> InsertDeparture(Flight flight);

    Task<AirlineDelayStats> GetAirlineAverageDelays(string airline, DateTime startDate, DateTime endDate);
    Task<AirlineLocationDelayStats> GetAirlineLocationAverageDelays(string airline, string location, DateTime startDate, DateTime endDate);
    Task<AirlineLocationDelayStats> GetDelayStats(string? airline, string? location, DateTime startDate, DateTime endDate);
    Task<FlightPerformanceStats> GetFlightPerformanceStats(string? airline, string? location, DateTime startDate, DateTime endDate, string? flightType = null);
    Task<IEnumerable<MontlyFlightPerformanceStats>> GetMonthlyFlightPerformanceStats(string? airline, string? location, DateTime startDate, DateTime endDate, string? flightType = null);
}
