using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Create;

public record CreateStaffCommand(
    string FirstName, string LastName,
    string Role, Guid BuId, string Email,
    string? BuRole) : IRequest<CreateStaffResult>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}

public record CreateStaffResult(Guid Id, string Username, string DefaultPassword);
