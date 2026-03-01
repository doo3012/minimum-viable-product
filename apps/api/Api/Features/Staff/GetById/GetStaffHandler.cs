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
            .Include(s => s.StaffBus)
            .FirstOrDefaultAsync(s => s.Id == query.StaffId, ct);
        if (s is null) return null;
        return new StaffDto(s.Id, s.FirstName, s.LastName, s.UserId,
            s.StaffBus.Select(b => new StaffBuDto(b.BuId, b.Email)));
    }
}
