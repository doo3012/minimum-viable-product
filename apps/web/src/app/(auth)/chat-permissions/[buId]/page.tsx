'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
}

interface Permission {
  id: string;
  staffId: string;
}

export default function ChatPermissionsPage({ params }: { params: Promise<{ buId: string }> }) {
  const { buId } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { role } = useAuthStore();

  if (role !== 'Owner') {
    return (
      <div className="text-red-500">
        Access denied. Only Owners can manage chat permissions.
      </div>
    );
  }

  return <PermissionsContent buId={buId} queryClient={queryClient} router={router} />;
}

function PermissionsContent({
  buId,
  queryClient,
  router,
}: {
  buId: string;
  queryClient: ReturnType<typeof useQueryClient>;
  router: ReturnType<typeof useRouter>;
}) {
  const { data: staff, isLoading: loadingStaff } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data),
  });

  const { data: permissions, isLoading: loadingPerms } = useQuery<Permission[]>({
    queryKey: ['chat-permissions', buId],
    queryFn: () => api.get(`/business-units/${buId}/chat-permissions`).then((r) => r.data),
  });

  const grant = useMutation({
    mutationFn: (staffId: string) => api.post('/chat-permissions', { staffId, buId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat-permissions', buId] }),
    onError: () => Swal.fire('Error', 'Failed to grant access.', 'error'),
  });

  const revoke = useMutation({
    mutationFn: (permId: string) => api.delete(`/chat-permissions/${permId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat-permissions', buId] }),
    onError: () => Swal.fire('Error', 'Failed to revoke access.', 'error'),
  });

  async function handleToggle(member: StaffMember, perm: Permission | undefined) {
    if (perm) {
      const result = await Swal.fire({
        title: 'Revoke access?',
        text: `Remove chat access for ${member.firstName} ${member.lastName}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Revoke',
        confirmButtonColor: '#dc2626',
      });
      if (result.isConfirmed) revoke.mutate(perm.id);
    } else {
      grant.mutate(member.id);
    }
  }

  if (loadingStaff || loadingPerms) return <p className="text-gray-500">Loading…</p>;

  const permMap = new Map(permissions?.map((p) => [p.staffId, p]));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/chat-permissions')}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Chat Permissions</h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Staff Member</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Chat Access</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {staff?.map((member) => {
              const perm = permMap.get(member.id);
              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">
                    {member.firstName} {member.lastName}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        perm
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {perm ? 'Has Access' : 'No Access'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(member, perm)}
                      className={`text-sm font-medium ${
                        perm
                          ? 'text-red-600 hover:underline'
                          : 'text-blue-600 hover:underline'
                      }`}
                    >
                      {perm ? 'Revoke' : 'Grant'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
