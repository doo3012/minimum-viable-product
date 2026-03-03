using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;

namespace Api.Features.Staff.MyBuAssignments;

public class GetMyBuAssignmentsHandler(
    IHttpContextAccessor httpContextAccessor,
    AppDbContext db) : IRequestHandler<GetMyBuAssignmentsQuery, List<BuAssignmentDto>>
{
    public async Task<List<BuAssignmentDto>> Handle(
        GetMyBuAssignmentsQuery request,
        CancellationToken cancellationToken)
    {
        var userId = Guid.Parse(
            httpContextAccessor.HttpContext!.User.FindFirst("sub")!.Value);
        var globalRole = httpContextAccessor.HttpContext!.User
            .FindFirst("global_role")?.Value;

        // Owner sees all BUs in the company
        if (globalRole == "Owner")
        {
            var companyId = Guid.Parse(
                httpContextAccessor.HttpContext!.User.FindFirst("company_id")!.Value);

            return await db.BusinessUnits
                .Where(bu => bu.CompanyId == companyId)
                .Select(bu => new BuAssignmentDto(
                    bu.Id,
                    bu.Name,
                    "Owner",
                    true))
                .ToListAsync(cancellationToken);
        }

        // Non-Owner: return only assigned BUs with their localized role
        var staff = await db.StaffProfiles
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(s => s.UserId == userId, cancellationToken);

        if (staff == null) return [];

        return await db.StaffBus
            .Where(sb => sb.StaffId == staff.Id)
            .Join(db.BusinessUnits.IgnoreQueryFilters(),
                sb => sb.BuId,
                bu => bu.Id,
                (sb, bu) => new { sb, bu })
            .GroupJoin(db.ChatPermissions,
                x => new { x.sb.StaffId, x.sb.BuId },
                cp => new { cp.StaffId, cp.BuId },
                (x, cps) => new { x.sb, x.bu, HasChat = cps.Any() })
            .Select(x => new BuAssignmentDto(
                x.bu.Id,
                x.bu.Name,
                x.sb.Role,
                x.HasChat))
            .ToListAsync(cancellationToken);
    }
}
