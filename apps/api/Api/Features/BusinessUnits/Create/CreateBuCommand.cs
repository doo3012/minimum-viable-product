using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.BusinessUnits.Create;
public record CreateBuCommand(string Name) : IRequest<Guid>, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner", "Admin"];
}
