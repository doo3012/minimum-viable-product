using MediatR;

namespace Api.Features.Staff.MyBuAssignments;

public record GetMyBuAssignmentsQuery : IRequest<List<BuAssignmentDto>>;

public record BuAssignmentDto(
    Guid BuId,
    string BuName,
    string Role,
    bool HasChatAccess);
