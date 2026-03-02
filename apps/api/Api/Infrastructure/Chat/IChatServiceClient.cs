namespace Api.Infrastructure.Chat;

public interface IChatServiceClient
{
    Task<Guid?> GetWorkspaceIdByBuIdAsync(Guid buId, CancellationToken ct = default);
    Task AddMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default);
    Task RemoveMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default);
}
