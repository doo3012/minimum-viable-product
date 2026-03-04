using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.List;

public record ListStaffQuery : IRequest<IEnumerable<StaffDto>>, ITenantScoped;

public record StaffBuDto(Guid BuId, string BuName, string Email, bool HasChatAccess);
public record StaffDto(
    Guid Id, string FirstName, string LastName, Guid? UserId,
    string Role, int BuCount,
    IEnumerable<StaffBuDto> BuAssignments);
