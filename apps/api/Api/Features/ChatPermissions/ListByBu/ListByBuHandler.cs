using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.ChatPermissions.ListByBu;

public class ListByBuHandler(AppDbContext db)
    : IRequestHandler<ListByBuQuery, IEnumerable<ChatPermissionDto>>
{
    public async Task<IEnumerable<ChatPermissionDto>> Handle(ListByBuQuery query, CancellationToken ct)
    {
        return await db.ChatPermissions
            .Where(p => p.BuId == query.BuId)
            .Select(p => new ChatPermissionDto(p.Id, p.StaffId, p.BuId, p.GrantedAt))
            .ToListAsync(ct);
    }
}
