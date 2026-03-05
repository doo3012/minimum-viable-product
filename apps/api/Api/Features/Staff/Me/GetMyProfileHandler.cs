using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.Me;

public class GetMyProfileHandler(AppDbContext db)
    : IRequestHandler<GetMyProfileQuery, MyProfileDto?>
{
    public async Task<MyProfileDto?> Handle(GetMyProfileQuery query, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .Include(s => s.User)
            .Include(s => s.StaffBus)
            .FirstOrDefaultAsync(s => s.UserId == query.UserId, ct);

        if (staff is null) return null;

        var buIds = staff.StaffBus.Select(sb => sb.BuId).ToList();
        var bus = await db.BusinessUnits
            .Where(bu => buIds.Contains(bu.Id))
            .ToDictionaryAsync(bu => bu.Id, ct);

        var assignments = staff.StaffBus.Select(sb => new MyBuAssignmentDto(
            sb.BuId,
            bus.TryGetValue(sb.BuId, out var bu) ? bu.Name : "",
            sb.Email
        )).ToList();

        return new MyProfileDto(
            staff.Id,
            staff.FirstName,
            staff.LastName,
            staff.User?.Role ?? "",
            staff.User?.Username ?? "",
            assignments);
    }
}
