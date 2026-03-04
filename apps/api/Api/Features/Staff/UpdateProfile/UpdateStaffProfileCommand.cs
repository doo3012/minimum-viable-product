using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.UpdateProfile;

public record UpdateStaffProfileCommand(
    Guid StaffId, string FirstName, string LastName
) : IRequest, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
