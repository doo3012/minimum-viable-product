using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.BusinessUnits.Create;
public record CreateBuCommand(string Name) : IRequest<Guid>, ITenantScoped
{
    public Guid CompanyId { get; set; } // set by TenantBehavior / endpoint
}
