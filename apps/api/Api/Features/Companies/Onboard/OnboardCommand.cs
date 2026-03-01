using MediatR;
namespace Api.Features.Companies.Onboard;

public record OnboardCommand(
    string CompanyName,
    string Address,
    string ContactNumber) : IRequest<OnboardResult>;

public record OnboardResult(Guid CompanyId, string Username, string DefaultPassword);
