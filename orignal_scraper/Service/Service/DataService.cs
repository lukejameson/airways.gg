
public class DataService : IDataService
{
    private readonly IPortDelaysWorker _portDelaysWorker;

    public DataService(IPortDelaysWorker portDelaysWorker)
    {
        _portDelaysWorker = portDelaysWorker;
    }

    public async Task<bool> DoesDataExist(DateTime start, DateTime end, FlightType type)
    {
        if (type == FlightType.Arrival)
        {
            return await _portDelaysWorker.DoesArrivalExist(start, end);
        }
        else
        {
            return await _portDelaysWorker.DoesDepartureExist(start, end);
        }
    }

    public async Task ProcessData(IEnumerable<Flight> flights, FlightType type)
    {
        if (type == FlightType.Arrival)
        {
            foreach (var flight in flights)
            {
                await _portDelaysWorker.InsertArrival(flight);
            }
        }
        else
        {
            foreach (var flight in flights)
            {
                await _portDelaysWorker.InsertDeparture(flight);
            }
        }
    }
}
