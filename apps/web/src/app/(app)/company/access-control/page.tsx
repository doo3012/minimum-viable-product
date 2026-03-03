'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface BusinessUnit {
  id: string;
  name: string;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
}

interface Permission {
  id: string;
  staffId: string;
}

export default function AccessControlPage() {
  const { globalRole } = useAuthStore();
  const [selectedBuId, setSelectedBuId] = useState<string | null>(null);

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can manage access control.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">BU Access Control</h1>
      <p className="text-gray-500">Select a business unit to manage chat access.</p>
      {selectedBuId ? (
        <PermissionsPanel buId={selectedBuId} onBack={() => setSelectedBuId(null)} />
      ) : (
        <BuCards onSelect={setSelectedBuId} />
      )}
    </div>
  );
}

function BuCards({ onSelect }: { onSelect: (buId: string) => void }) {
  const { data: bus, isLoading } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
  });

  if (isLoading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {bus?.map((bu) => (
        <button
          key={bu.id}
          onClick={() => onSelect(bu.id)}
          className="block text-left bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
        >
          <h2 className="text-base font-semibold text-gray-800">{bu.name}</h2>
          <p className="text-sm text-gray-500 mt-1">Manage chat access &rarr;</p>
        </button>
      ))}
    </div>
  );
}

function PermissionsPanel({ buId, onBack }: { buId: string; onBack: () => void }) {
  const queryClient = useQueryClient();

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

  if (loadingStaff || loadingPerms) return <p className="text-gray-500">Loading...</p>;

  const permMap = new Map(permissions?.map((p) => [p.staffId, p]));

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-gray-500 hover:text-gray-700 text-sm"
      >
        &larr; Back to business units
      </button>

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
