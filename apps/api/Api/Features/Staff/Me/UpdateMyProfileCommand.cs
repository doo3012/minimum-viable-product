using MediatR;
namespace Api.Features.Staff.Me;

public record UpdateMyProfileCommand(
    Guid UserId, string FirstName, string LastName
) : IRequest;
