namespace Api.Infrastructure.Persistence.Entities;

public class BusinessUnit
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public string Name { get; set; } = "";
    public bool IsDefault { get; set; }
    public DateTime CreatedAt { get; set; }
    public Company Company { get; set; } = null!;
}
