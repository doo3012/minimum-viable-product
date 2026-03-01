using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Create;

public record CreateStaffCommand(
    string FirstName, string LastName,
    string Role, Guid BuId, string Email)
    : IRequest<Guid>, ITenantScoped
{
    public Guid CompanyId { get; set; }
}
