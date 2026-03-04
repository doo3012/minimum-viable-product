using Api.Infrastructure.Persistence;
using Api.Infrastructure.Persistence.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.AddBu;

public class AddStaffBuHandler(AppDbContext db) : IRequestHandler<AddStaffBuCommand, Guid>
{
    public async Task<Guid> Handle(AddStaffBuCommand cmd, CancellationToken ct)
    {
        var exists = await db.StaffBus
            .AnyAsync(sb => sb.StaffId == cmd.StaffId && sb.BuId == cmd.BuId, ct);
        if (exists)
            throw new InvalidOperationException("Staff is already assigned to this BU");

        var profile = await db.StaffProfiles
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == cmd.StaffId, ct)
            ?? throw new InvalidOperationException("Staff not found");

        var staffBu = new StaffBu
        {
            Id = Guid.NewGuid(),
            StaffId = cmd.StaffId,
            BuId = cmd.BuId,
            Email = profile.User?.Username ?? "",
            Role = "Staff",
            CreatedAt = DateTime.UtcNow
        };
        db.StaffBus.Add(staffBu);
        await db.SaveChangesAsync(ct);
        return staffBu.Id;
    }
}
