using System.ComponentModel.DataAnnotations.Schema;

public class FlightPerformanceStats
{
    [Column("airline")]
    public required string Airline { get; set; }

    [Column("location")]
    public required string Location { get; set; }

    [Column("flight_type")]
    public required string FlightType { get; set; }

    [Column("total_flights")]
    public long TotalFlights { get; set; }

    [Column("on_time_flights")]
    public long OnTimeFlights { get; set; }

    [Column("on_time_percentage")]
    public decimal OnTimePercentage { get; set; }

    [Column("early_flights")]
    public long EarlyFlights { get; set; }

    [Column("early_percentage")]
    public decimal EarlyPercentage { get; set; }

    [Column("delayed_flights")]
    public long DelayedFlights { get; set; }

    [Column("delayed_percentage")]
    public decimal DelayedPercentage { get; set; }

    [Column("avg_delay_minutes")]
    public decimal AvgDelayMinutes { get; set; }

    [Column("max_delay_minutes")]
    public decimal MaxDelayMinutes { get; set; }

    [Column("flights_with_no_actual_time")]
    public long FlightsWithNoActualTime { get; set; }

    [Column("no_actual_time_percentage")]
    public decimal NoActualTimePercentage { get; set; }

    // New properties for late flight counts and percentages
    [Column("late_5_minutes_count")]
    public long Late5MinutesCount { get; set; }

    [Column("late_5_minutes_percentage")]
    public decimal Late5MinutesPercentage { get; set; }

    [Column("late_10_minutes_count")]
    public long Late10MinutesCount { get; set; }

    [Column("late_10_minutes_percentage")]
    public decimal Late10MinutesPercentage { get; set; }

    [Column("late_15_minutes_count")]
    public long Late15MinutesCount { get; set; }

    [Column("late_15_minutes_percentage")]
    public decimal Late15MinutesPercentage { get; set; }

    [Column("late_30_minutes_count")]
    public long Late30MinutesCount { get; set; }

    [Column("late_30_minutes_percentage")]
    public decimal Late30MinutesPercentage { get; set; }
}
