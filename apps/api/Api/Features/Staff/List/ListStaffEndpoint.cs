using MediatR;
namespace Api.Features.Staff.List;

public static class ListStaffEndpoint
{
    public static void MapListStaff(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/staff", async (IMediator mediator, CancellationToken ct) =>
            Results.Ok(await mediator.Send(new ListStaffQuery(), ct))
        ).RequireAuthorization()
        .WithName("ListStaff")
        .WithTags("Staff")
        .Produces<IEnumerable<StaffDto>>(200)
        .Produces(401);
    }
}
