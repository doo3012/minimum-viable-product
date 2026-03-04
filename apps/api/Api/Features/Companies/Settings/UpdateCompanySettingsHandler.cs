using Api.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;
namespace Api.Features.Companies.Settings;

public class UpdateCompanySettingsHandler(AppDbContext db)
    : IRequestHandler<UpdateCompanySettingsCommand>
{
    public async Task Handle(UpdateCompanySettingsCommand cmd, CancellationToken ct)
    {
        var company = await db.Companies
            .FirstOrDefaultAsync(c => c.Id == cmd.CompanyId, ct)
            ?? throw new KeyNotFoundException("Company not found");

        company.Name = cmd.CompanyName;
        company.Address = cmd.Address;
        company.ContactNumber = cmd.ContactNumber;
        await db.SaveChangesAsync(ct);
    }
}
