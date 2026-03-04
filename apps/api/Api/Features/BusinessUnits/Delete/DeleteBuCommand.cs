using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.BusinessUnits.Delete;

public record DeleteBuCommand(Guid BuId) : IRequest, ITenantScoped, IAuthorizeRole
{
    public Guid CompanyId { get; set; }
    public string[] AllowedRoles => ["Owner"];
}
