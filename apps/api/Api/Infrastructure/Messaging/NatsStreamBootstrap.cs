using NATS.Client.Core;
using NATS.Client.JetStream;
using NATS.Client.JetStream.Models;

namespace Api.Infrastructure.Messaging;

public static class NatsStreamBootstrap
{
    public static async Task EnsureStreamAsync(IConfiguration config)
    {
        var url = config["Nats:Url"] ?? "nats://nats:4222";
        var conn = new NatsConnection(new NatsOpts { Url = url });
        await conn.ConnectAsync();
        var js = new NatsJSContext(conn);
        try {
            await js.CreateStreamAsync(new StreamConfig("PLATFORM_EVENTS", ["bu.*"]) {
                Retention = StreamConfigRetention.Workqueue
            });
        } catch { /* stream may already exist */ }
    }
}
