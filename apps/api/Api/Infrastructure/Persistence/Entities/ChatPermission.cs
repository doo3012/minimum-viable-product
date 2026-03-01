namespace Api.Infrastructure.Persistence.Entities;

public class ChatPermission
{
    public Guid Id { get; set; }
    public Guid StaffId { get; set; }
    public Guid BuId { get; set; }
    public DateTime GrantedAt { get; set; }
}
