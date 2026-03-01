using Api.Common.Interfaces;
using MediatR;
namespace Api.Features.BusinessUnits.List;
public record ListBuQuery : IRequest<IEnumerable<BusinessUnitDto>>, ITenantScoped;
public record BusinessUnitDto(Guid Id, string Name, bool IsDefault, DateTime CreatedAt);
