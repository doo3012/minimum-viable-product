using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.ResetPassword;

public record ResetPasswordCommand(Guid StaffId)
    : IRequest<string>, ITenantScoped, IAuthorizeRole
{
    public string[] AllowedRoles => ["Owner", "Admin"];
}
