using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Staff.Me;

public class GetMyProfileHandler(AppDbContext db)
    : IRequestHandler<GetMyProfileQuery, Guid?>
{
    public async Task<Guid?> Handle(GetMyProfileQuery query, CancellationToken ct)
    {
        var staff = await db.StaffProfiles
            .FirstOrDefaultAsync(s => s.UserId == query.UserId, ct);
        return staff?.Id;
    }
}
