namespace Api.Infrastructure.Messaging.Events;

public record BusinessUnitCreated(
    Guid BuId,
    string BuName,
    Guid OwnerUserId,
    Guid CompanyId);
