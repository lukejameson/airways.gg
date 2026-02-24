
public interface IDataService
{
    Task<bool> DoesDataExist(DateTime start, DateTime end, FlightType type);
    Task ProcessData(IEnumerable<Flight> flights, FlightType type);
}
