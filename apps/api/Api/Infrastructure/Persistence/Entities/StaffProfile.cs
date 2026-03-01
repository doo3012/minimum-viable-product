namespace Api.Infrastructure.Persistence.Entities;

public class StaffProfile
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid? UserId { get; set; }
    public string FirstName { get; set; } = "";
    public string LastName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public ICollection<StaffBu> StaffBus { get; set; } = [];
}
