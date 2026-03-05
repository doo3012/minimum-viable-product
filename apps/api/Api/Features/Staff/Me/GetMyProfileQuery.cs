using MediatR;
namespace Api.Features.Staff.Me;

public record GetMyProfileQuery(Guid UserId) : IRequest<MyProfileDto?>;

public record MyProfileDto(
    Guid StaffId,
    string FirstName,
    string LastName,
    string Role,
    string Username,
    List<MyBuAssignmentDto> BuAssignments);

public record MyBuAssignmentDto(Guid BuId, string BuName, string Email);
