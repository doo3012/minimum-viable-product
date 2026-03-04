using MediatR;
namespace Api.Features.Companies.Settings;

public record GetCompanySettingsQuery(Guid CompanyId) : IRequest<CompanySettingsDto?>;

public record CompanySettingsDto(
    Guid CompanyId,
    string CompanyName,
    string Address,
    string ContactNumber);
