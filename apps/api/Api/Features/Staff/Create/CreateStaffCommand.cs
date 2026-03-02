using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Create;

public record CreateStaffCommand(
    string FirstName, string LastName,
    string Role, Guid BuId, string Email)
    : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner", "Admin"];
}
