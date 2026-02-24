using System.ComponentModel.DataAnnotations.Schema;

public class AirlineDelayStats
{
    [Column("airline")]
    public required string Airline { get; set; }

    [Column("avg_arrival_delay_minutes")]
    public decimal AvgArrivalDelayMinutes { get; set; }

    [Column("avg_departure_delay_minutes")]
    public decimal AvgDepartureDelayMinutes { get; set; }

    [Column("total_arrivals")]
    public long TotalArrivals { get; set; }

    [Column("total_departures")]
    public long TotalDepartures { get; set; }
}
