using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Companies.Settings;

public class GetCompanySettingsHandler(AppDbContext db)
    : IRequestHandler<GetCompanySettingsQuery, CompanySettingsDto?>
{
    public async Task<CompanySettingsDto?> Handle(
        GetCompanySettingsQuery query, CancellationToken ct)
    {
        var company = await db.Companies
            .FirstOrDefaultAsync(c => c.Id == query.CompanyId, ct);

        if (company is null) return null;

        return new CompanySettingsDto(
            company.Id,
            company.Name,
            company.Address,
            company.ContactNumber);
    }
}
