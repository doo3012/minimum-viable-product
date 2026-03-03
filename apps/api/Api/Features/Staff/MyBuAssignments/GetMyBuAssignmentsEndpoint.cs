using MediatR;

namespace Api.Features.Staff.MyBuAssignments;

public static class GetMyBuAssignmentsEndpoint
{
    public static void MapGetMyBuAssignments(this WebApplication app) =>
        app.MapGet("/api/staff/me/bu-assignments",
            async (IMediator mediator) =>
                Results.Ok(await mediator.Send(new GetMyBuAssignmentsQuery())))
        .RequireAuthorization();
}
