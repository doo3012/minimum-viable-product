using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.UpdateBuScoped;

public record UpdateBuScopedCommand(Guid StaffId, Guid BuId, string Email)
    : IRequest<Unit>, ITenantScoped;
