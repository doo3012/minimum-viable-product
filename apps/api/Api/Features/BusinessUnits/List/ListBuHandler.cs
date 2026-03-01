using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.BusinessUnits.List;
public class ListBuHandler(AppDbContext db)
    : IRequestHandler<ListBuQuery, IEnumerable<BusinessUnitDto>>
{
    public async Task<IEnumerable<BusinessUnitDto>> Handle(ListBuQuery query, CancellationToken ct)
    {
        return await db.BusinessUnits
            .Select(b => new BusinessUnitDto(b.Id, b.Name, b.IsDefault, b.CreatedAt))
            .ToListAsync(ct);
    }
}
