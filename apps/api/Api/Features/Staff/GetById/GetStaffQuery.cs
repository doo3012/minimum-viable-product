using Api.Common.Interfaces;
using Api.Features.Staff.List;
using MediatR;
namespace Api.Features.Staff.GetById;

public record GetStaffQuery(Guid StaffId) : IRequest<StaffDto?>, ITenantScoped;
