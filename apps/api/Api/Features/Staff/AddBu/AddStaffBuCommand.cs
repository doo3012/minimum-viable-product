using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.AddBu;

public record AddStaffBuCommand(Guid StaffId, Guid BuId) : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
