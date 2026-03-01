namespace Api.Infrastructure.Persistence.Entities;

public class User
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public string Username { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "";          // "Owner" | "Admin" | "Staff"
    public bool MustChangePassword { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public Company Company { get; set; } = null!;
}
