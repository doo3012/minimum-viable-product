using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.SetPassword;

public record SetPasswordCommand(Guid StaffId, string NewPassword)
    : IRequest<Unit>, ITenantScoped, IAuthorizeRole
{
    public string[] AllowedRoles => ["Owner", "Admin"];
}
