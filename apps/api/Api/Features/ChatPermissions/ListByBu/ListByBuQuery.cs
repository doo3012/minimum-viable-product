using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.ChatPermissions.ListByBu;

public record ListByBuQuery(Guid BuId) : IRequest<IEnumerable<ChatPermissionDto>>, ITenantScoped;
public record ChatPermissionDto(Guid Id, Guid StaffId, Guid BuId, DateTime GrantedAt);
