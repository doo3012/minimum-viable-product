using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.ChatPermissions.Revoke;

public record RevokePermissionCommand(Guid PermissionId)
    : IRequest<Unit>, ITenantScoped, IAuthorizeRole
{
    public string[] AllowedRoles => ["Owner"];
}
