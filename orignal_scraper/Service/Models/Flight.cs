using System.ComponentModel.DataAnnotations.Schema;

public class Flight : IEquatable<Flight>
{
    public required string Airline { get; set; }
    public required string Location { get; set; }
    public required string Code { get; set; }

    [Column("scheduledtime")]
    public DateTimeOffset ScheduledTime { get; set; }

    [Column("actualtime")]
    public DateTimeOffset ActualTime { get; set; }

    public bool Equals(Flight? other)
    {
        if (other == null) return false;
        // Compare by flight code and scheduled date to identify same flight
        return Code == other.Code &&
               ScheduledTime.Date == other.ScheduledTime.Date;
    }

    public override int GetHashCode()
    {
        return HashCode.Combine(Code, ScheduledTime.Date);
    }
}
