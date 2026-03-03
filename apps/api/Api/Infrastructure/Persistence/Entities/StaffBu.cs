namespace Api.Infrastructure.Persistence.Entities;

public class StaffBu
{
    public Guid Id { get; set; }
    public Guid StaffId { get; set; }
    public Guid BuId { get; set; }
    public string Email { get; set; } = "";
    public string Role { get; set; } = "Staff";
    public DateTime CreatedAt { get; set; }
    public BusinessUnit Bu { get; set; } = null!;
}
