using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.ChatPermissions.Grant;

public record GrantPermissionCommand(Guid StaffId, Guid BuId)
    : IRequest<Guid>, ITenantScoped;
