using MediatR;
namespace Api.Features.Companies.Settings;

public record UpdateCompanySettingsCommand(
    Guid CompanyId,
    string CompanyName,
    string Address,
    string ContactNumber
) : IRequest;
