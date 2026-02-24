
using System.Data;
using Dapper;

public class PortDelaysWorker : IPortDelaysWorker
{
    private readonly IDbConnection _connection;

    public PortDelaysWorker(IDbConnection connection)
    {
        _connection = connection;
    }

    public async Task<bool> DoesArrivalExist(DateTime start, DateTime end)
    {
        return await _connection.ExecuteScalarAsync<bool>(
          "SELECT check_arrivals_data(@p_start, @p_end)",
          new { p_start = start, p_end = end }
        );
    }

    public async Task<bool> DoesDepartureExist(DateTime start, DateTime end)
    {
        return await _connection.ExecuteScalarAsync<bool>(
          "SELECT check_departures_data(@p_start, @p_end)",
          new { p_start = start, p_end = end }
        );
    }

    public async Task<IEnumerable<Flight>> GetArrivalsByDateRange(DateTime StartDate, DateTime EndDate)
    {
        var records = await _connection.QueryAsync<Flight>("SELECT * FROM read_arrivals_date(@_start_date, @_end_date)", new
        {
            _start_date = StartDate,
            _end_date = EndDate
        });

        return records;
    }

    public async Task<IEnumerable<Flight>> GetDepaturesByDateRange(DateTime StartDate, DateTime EndDate)
    {
        var records = await _connection.QueryAsync<Flight>("SELECT * FROM read_departure_date(@_start_date, @_end_date)", new
        {
            _start_date = StartDate,
            _end_date = EndDate
        });

        return records;
    }

    public async Task<bool> InsertArrival(Flight flight)
    {
        var result = await _connection.ExecuteAsync("insert_arrivals", new
        {
            _airline = flight.Airline,
            _location = flight.Location,
            _code = flight.Code,
            _scheduled_time = flight.ScheduledTime.ToUniversalTime(),
            _actual_time = flight.ActualTime.ToUniversalTime()
        }, commandType: CommandType.StoredProcedure);

        return result > 0;
    }

    public async Task<bool> InsertDeparture(Flight flight)
    {
        var result = await _connection.ExecuteAsync("insert_departures", new
        {
            _airline = flight.Airline,
            _location = flight.Location,
            _code = flight.Code,
            _scheduled_time = flight.ScheduledTime.ToUniversalTime(),
            _actual_time = flight.ActualTime.ToUniversalTime()
        }, commandType: CommandType.StoredProcedure);

        return result > 0;
    }

    public async Task<AirlineDelayStats> GetAirlineAverageDelays(string airline, DateTime startDate, DateTime endDate)
    {
        // Try with dynamic first to see if we get any results
        var dynamicResults = await _connection.QueryAsync(
            "SELECT * FROM get_airline_average_delays(@_airline, @_start_date, @_end_date)",
            new
            {
                _airline = airline,
                _start_date = startDate,
                _end_date = endDate
            });

        var dynamicResult = dynamicResults.FirstOrDefault();

        if (dynamicResult != null)
        {
            return new AirlineDelayStats
            {
                Airline = dynamicResult.airline ?? airline,
                AvgArrivalDelayMinutes = dynamicResult.avg_arrival_delay_minutes ?? 0,
                AvgDepartureDelayMinutes = dynamicResult.avg_departure_delay_minutes ?? 0,
                TotalArrivals = dynamicResult.total_arrivals ?? 0,
                TotalDepartures = dynamicResult.total_departures ?? 0
            };
        }

        // Fallback if no results
        return new AirlineDelayStats { Airline = airline };
    }

    public async Task<AirlineLocationDelayStats> GetAirlineLocationAverageDelays(string airline, string location, DateTime startDate, DateTime endDate)
    {
        var result = await _connection.QueryFirstOrDefaultAsync<AirlineLocationDelayStats>(
            "SELECT * FROM get_airline_location_average_delays(@_airline, @_location, @_start_date, @_end_date)",
            new
            {
                _airline = airline,
                _location = location,
                _start_date = startDate,
                _end_date = endDate
            });

        return result ?? new AirlineLocationDelayStats { Airline = airline, Location = location };
    }

    public async Task<AirlineLocationDelayStats> GetDelayStats(string? airline, string? location, DateTime startDate, DateTime endDate)
    {
        // Try with dynamic first to see if we get any results
        var dynamicResults = await _connection.QueryAsync(
            "SELECT * FROM get_delay_stats(@_start_date, @_end_date, @_airline, @_location)",
            new
            {
                _start_date = startDate,
                _end_date = endDate,
                _airline = airline,
                _location = location
            });

        var dynamicResult = dynamicResults.FirstOrDefault();

        if (dynamicResult != null)
        {
            return new AirlineLocationDelayStats
            {
                Airline = dynamicResult.airline ?? airline ?? "All Airlines",
                Location = dynamicResult.location ?? location ?? "All Locations",
                AvgArrivalDelayMinutes = dynamicResult.avg_arrival_delay_minutes ?? 0,
                AvgDepartureDelayMinutes = dynamicResult.avg_departure_delay_minutes ?? 0,
                TotalArrivals = dynamicResult.total_arrivals ?? 0,
                TotalDepartures = dynamicResult.total_departures ?? 0
            };
        }

        return new AirlineLocationDelayStats
        {
            Airline = airline ?? "All Airlines",
            Location = location ?? "All Locations"
        };
    }

    public async Task<FlightPerformanceStats> GetFlightPerformanceStats(
        string? airline,
        string? location,
        DateTime startDate,
        DateTime endDate,
        string? flightType = null)
    {
        // Try with dynamic first to see if we get any results
        var dynamicResults = await _connection.QueryAsync(
            "SELECT * FROM get_flight_performance_stats(@_start_date, @_end_date, @_airline, @_location, @_flight_type)",
            new
            {
                _start_date = startDate,
                _end_date = endDate,
                _airline = airline,
                _location = location,
                _flight_type = flightType
            });

        var dynamicResult = dynamicResults.FirstOrDefault();

        if (dynamicResult != null)
        {
            return new FlightPerformanceStats
            {
                Airline = dynamicResult.airline ?? airline ?? "All Airlines",
                Location = dynamicResult.location ?? location ?? "All Locations",
                FlightType = dynamicResult.flight_type ?? "All",
                TotalFlights = dynamicResult.total_flights ?? 0,
                OnTimeFlights = dynamicResult.on_time_flights ?? 0,
                OnTimePercentage = dynamicResult.on_time_percentage ?? 0,
                EarlyFlights = dynamicResult.early_flights ?? 0,
                EarlyPercentage = dynamicResult.early_percentage ?? 0,
                DelayedFlights = dynamicResult.delayed_flights ?? 0,
                DelayedPercentage = dynamicResult.delayed_percentage ?? 0,
                AvgDelayMinutes = dynamicResult.avg_delay_minutes ?? 0,
                MaxDelayMinutes = dynamicResult.max_delay_minutes ?? 0,
                FlightsWithNoActualTime = dynamicResult.flights_with_no_actual_time ?? 0,
                NoActualTimePercentage = dynamicResult.no_actual_time_percentage ?? 0,
                Late5MinutesCount = dynamicResult.late_5_minutes_count ?? 0,
                Late5MinutesPercentage = dynamicResult.late_5_minutes_percentage ?? 0,
                Late10MinutesCount = dynamicResult.late_10_minutes_count ?? 0,
                Late10MinutesPercentage = dynamicResult.late_10_minutes_percentage ?? 0,
                Late15MinutesCount = dynamicResult.late_15_minutes_count ?? 0,
                Late15MinutesPercentage = dynamicResult.late_15_minutes_percentage ?? 0,
                Late30MinutesCount = dynamicResult.late_30_minutes_count ?? 0,
                Late30MinutesPercentage = dynamicResult.late_30_minutes_percentage ?? 0
            };
        }

        return new FlightPerformanceStats
        {
            Airline = airline ?? "All Airlines",
            Location = location ?? "All Locations",
            FlightType = "All"
        };
    }

    public async Task<IEnumerable<MontlyFlightPerformanceStats>> GetMonthlyFlightPerformanceStats(
        string? airline,
        string? location,
        DateTime startDate,
        DateTime endDate,
        string? flightType = null)
    {
        var results = await _connection.QueryAsync(
            "SELECT * FROM get_monthly_flight_performance_stats(@_start_date, @_end_date, @_airline, @_location, @_flight_type)",
            new
            {
                _start_date = startDate,
                _end_date = endDate,
                _airline = airline,
                _location = location,
                _flight_type = flightType
            });

        return results.Select(row => new MontlyFlightPerformanceStats
        {
            Year = row.year ?? 0,
            Month = row.month ?? 0,
            MonthName = row.month_name ?? "",
            Airline = row.airline ?? airline ?? "All Airlines",
            Location = row.location ?? location ?? "All Locations",
            FlightType = row.flight_type ?? "All",
            TotalFlights = row.total_flights ?? 0,
            OnTimeFlights = row.on_time_flights ?? 0,
            OnTimePercentage = row.on_time_percentage ?? 0,
            EarlyFlights = row.early_flights ?? 0,
            EarlyPercentage = row.early_percentage ?? 0,
            DelayedFlights = row.delayed_flights ?? 0,
            DelayedPercentage = row.delayed_percentage ?? 0,
            AvgDelayMinutes = row.avg_delay_minutes ?? 0,
            MaxDelayMinutes = row.max_delay_minutes ?? 0,
            FlightsWithNoActualTime = row.flights_with_no_actual_time ?? 0,
            NoActualTimePercentage = row.no_actual_time_percentage ?? 0,
            Late5MinutesCount = row.late_5_minutes_count ?? 0,
            Late5MinutesPercentage = row.late_5_minutes_percentage ?? 0,
            Late10MinutesCount = row.late_10_minutes_count ?? 0,
            Late10MinutesPercentage = row.late_10_minutes_percentage ?? 0,
            Late15MinutesCount = row.late_15_minutes_count ?? 0,
            Late15MinutesPercentage = row.late_15_minutes_percentage ?? 0,
            Late30MinutesCount = row.late_30_minutes_count ?? 0,
            Late30MinutesPercentage = row.late_30_minutes_percentage ?? 0
        }).ToList();
    }
}
