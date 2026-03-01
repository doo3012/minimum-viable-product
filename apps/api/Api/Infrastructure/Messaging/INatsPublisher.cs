namespace Api.Infrastructure.Messaging;
public interface INatsPublisher
{
    Task PublishAsync<T>(string subject, T payload, CancellationToken ct = default);
}
