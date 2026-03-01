namespace Api.Infrastructure.Persistence.Entities;

public class Company
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public string Address { get; set; } = "";
    public string ContactNumber { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public ICollection<BusinessUnit> BusinessUnits { get; set; } = [];
    public ICollection<User> Users { get; set; } = [];
}
