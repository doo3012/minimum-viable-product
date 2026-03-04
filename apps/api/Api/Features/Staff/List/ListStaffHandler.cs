using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.List;

public class ListStaffHandler(AppDbContext db)
    : IRequestHandler<ListStaffQuery, IEnumerable<StaffDto>>
{
    public async Task<IEnumerable<StaffDto>> Handle(ListStaffQuery query, CancellationToken ct)
    {
        return await db.StaffProfiles
            .Include(s => s.User)
            .Include(s => s.StaffBus).ThenInclude(sb => sb.Bu)
            .Select(s => new StaffDto(
                s.Id, s.FirstName, s.LastName, s.UserId,
                s.User != null ? s.User.Role : "",
                s.User != null ? s.User.Username : "",
                s.StaffBus.Count,
                s.StaffBus.Select(b => new StaffBuDto(
                    b.BuId, b.Bu.Name, b.Email,
                    db.ChatPermissions.Any(cp => cp.StaffId == s.Id && cp.BuId == b.BuId)))))
            .ToListAsync(ct);
    }
}
