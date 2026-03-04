using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.RemoveBu;

public record RemoveStaffBuCommand(Guid StaffId, Guid BuId) : IRequest, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
