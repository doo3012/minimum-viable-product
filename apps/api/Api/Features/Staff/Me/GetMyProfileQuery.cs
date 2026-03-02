using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.Staff.Me;

public record GetMyProfileQuery(Guid UserId) : IRequest<Guid?>, ITenantScoped;
