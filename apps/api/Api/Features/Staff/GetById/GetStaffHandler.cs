using Api.Features.Staff.List;
using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.GetById;

public class GetStaffHandler(AppDbContext db)
    : IRequestHandler<GetStaffQuery, StaffDto?>
{
    public async Task<StaffDto?> Handle(GetStaffQuery query, CancellationToken ct)
    {
        var s = await db.StaffProfiles
            .Include(s => s.User)
            .Include(s => s.StaffBus).ThenInclude(sb => sb.Bu)
            .FirstOrDefaultAsync(s => s.Id == query.StaffId, ct);
        if (s is null) return null;

        var chatPermissions = await db.ChatPermissions
            .Where(cp => cp.StaffId == s.Id)
            .ToListAsync(ct);

        return new StaffDto(s.Id, s.FirstName, s.LastName, s.UserId,
            s.User?.Role ?? "",
            s.StaffBus.Count,
            s.StaffBus.Select(b => new StaffBuDto(
                b.BuId, b.Bu.Name, b.Email,
                chatPermissions.Any(cp => cp.BuId == b.BuId))));
    }
}
