namespace Service.Settings;

public class Config
{
    public string Section => "Config";

    public required string Url { get; set; }

}
