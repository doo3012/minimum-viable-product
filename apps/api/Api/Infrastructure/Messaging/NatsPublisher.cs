using System.Text.Json;
using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace Api.Infrastructure.Messaging;

public class NatsPublisher : INatsPublisher
{
    private readonly NatsJSContext _js;

    public NatsPublisher(IConfiguration config)
    {
        var url = config["Nats:Url"] ?? "nats://nats:4222";
        var conn = new NatsConnection(new NatsOpts { Url = url });
        _js = new NatsJSContext(conn);
    }

    public async Task PublishAsync<T>(string subject, T payload, CancellationToken ct = default)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(payload);
        await _js.PublishAsync(subject, bytes, cancellationToken: ct);
    }
}
