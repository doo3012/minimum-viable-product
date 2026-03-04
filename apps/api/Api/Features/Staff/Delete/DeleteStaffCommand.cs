using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Delete;

public record DeleteStaffCommand(Guid StaffId) : IRequest, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
