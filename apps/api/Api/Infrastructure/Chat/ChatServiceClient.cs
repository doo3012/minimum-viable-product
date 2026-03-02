using System.Net.Http.Json;
using System.Text.Json;

namespace Api.Infrastructure.Chat;

public class ChatServiceClient(HttpClient http) : IChatServiceClient
{
    public async Task<Guid?> GetWorkspaceIdByBuIdAsync(Guid buId, CancellationToken ct = default)
    {
        var resp = await http.GetAsync($"/api/workspaces/by-bu/{buId}", ct);
        if (!resp.IsSuccessStatusCode) return null;
        var doc = await resp.Content.ReadFromJsonAsync<JsonElement>(ct);
        return doc.GetProperty("ID").GetGuid();
    }

    public async Task AddMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default)
    {
        await http.PostAsJsonAsync(
            $"/api/workspaces/{workspaceId}/members",
            new { user_id = userId }, ct);
    }

    public async Task RemoveMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct = default)
    {
        await http.DeleteAsync(
            $"/api/workspaces/{workspaceId}/members/{userId}", ct);
    }
}
