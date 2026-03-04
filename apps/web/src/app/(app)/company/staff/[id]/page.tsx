'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Required').max(100),
  lastName: z.string().min(1, 'Required').max(100),
});
type ProfileData = z.infer<typeof profileSchema>;

interface StaffBuInfo {
  buId: string;
  buName: string;
  email: string;
  hasChatAccess: boolean;
}

interface StaffDetail {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  buAssignments: StaffBuInfo[];
}

interface BusinessUnit {
  id: string;
  name: string;
}

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { globalRole } = useAuthStore();
  const [selectedBuId, setSelectedBuId] = useState('');

  const { data, isLoading } = useQuery<StaffDetail>({
    queryKey: ['staff', id],
    queryFn: () => api.get(`/staff/${id}`).then((r) => r.data),
  });

  const { data: allBus } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    values: data ? { firstName: data.firstName, lastName: data.lastName } : undefined,
  });

  const updateProfile = useMutation({
    mutationFn: (d: ProfileData) => api.put(`/staff/${id}`, d),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      Swal.fire('Saved!', 'Profile updated.', 'success');
    },
    onError: () => Swal.fire('Error', 'Update failed.', 'error'),
  });

  const addBu = useMutation({
    mutationFn: (buId: string) => api.post(`/staff/${id}/bu/${buId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff', id] });
      setSelectedBuId('');
    },
    onError: () => Swal.fire('Error', 'Failed to add BU.', 'error'),
  });

  const removeBu = useMutation({
    mutationFn: (buId: string) => api.delete(`/staff/${id}/bu/${buId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', id] }),
    onError: () => Swal.fire('Error', 'Failed to remove BU.', 'error'),
  });

  const grantChat = useMutation({
    mutationFn: (buId: string) => api.post('/chat-permissions', { staffId: id, buId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', id] }),
    onError: () => Swal.fire('Error', 'Failed to grant chat access.', 'error'),
  });

  const revokeChat = useMutation({
    mutationFn: async (buId: string) => {
      const permsRes = await api.get(`/business-units/${buId}/chat-permissions`);
      const perm = permsRes.data.find((p: { staffId: string }) => p.staffId === id);
      if (perm) await api.delete(`/chat-permissions/${perm.id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', id] }),
    onError: () => Swal.fire('Error', 'Failed to revoke chat access.', 'error'),
  });

  const resetPassword = useMutation({
    mutationFn: () => api.post(`/staff/${id}/reset-password`),
    onSuccess: (res) => {
      Swal.fire('Password Reset', `New password: ${res.data.newPassword}`, 'success');
    },
    onError: () => Swal.fire('Error', 'Reset failed.', 'error'),
  });

  const setPasswordMutation = useMutation({
    mutationFn: (newPassword: string) => api.put(`/staff/${id}/password`, { newPassword }),
    onSuccess: () => Swal.fire('Saved!', 'Password has been set.', 'success'),
    onError: () => Swal.fire('Error', 'Set password failed.', 'error'),
  });

  // BUs not yet assigned to this staff
  const assignedBuIds = new Set(data?.buAssignments.map((b) => b.buId) ?? []);
  const availableBus = allBus?.filter((bu) => !assignedBuIds.has(bu.id)) ?? [];

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (!data) return <p className="text-red-500">Staff member not found.</p>;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.push('/company/staff')} className="text-gray-500 hover:text-gray-700 text-sm">
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {data.firstName} {data.lastName}
        </h1>
        <span className="text-sm bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{data.role}</span>
      </div>

      {/* Profile Form */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">Profile</h2>
        <form
          onSubmit={handleSubmit((d) => updateProfile.mutate(d))}
          className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name</label>
              <input
                {...register('firstName')}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.firstName && (
                <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name</label>
              <input
                {...register('lastName')}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.lastName && (
                <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {updateProfile.isPending ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </section>

      {/* BU Assignments */}
      <section>
        <h2 className="text-lg font-semibold text-gray-700 mb-3">BU Assignments</h2>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Add BU row */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-100">
            <select
              value={selectedBuId}
              onChange={(e) => setSelectedBuId(e.target.value)}
              className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select BU to add...</option>
              {availableBus.map((bu) => (
                <option key={bu.id} value={bu.id}>{bu.name}</option>
              ))}
            </select>
            <button
              onClick={() => { if (selectedBuId) addBu.mutate(selectedBuId); }}
              disabled={!selectedBuId || addBu.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              + Add
            </button>
          </div>

          {/* BU table */}
          {data.buAssignments.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">BU Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Chat Access</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.buAssignments.map((bu) => (
                  <tr key={bu.buId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{bu.buName}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          bu.hasChatAccess
                            ? revokeChat.mutate(bu.buId)
                            : grantChat.mutate(bu.buId)
                        }
                        disabled={grantChat.isPending || revokeChat.isPending}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          bu.hasChatAccess ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            bu.hasChatAccess ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => removeBu.mutate(bu.buId)}
                        disabled={removeBu.isPending}
                        className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-sm text-center py-6">No BU assignments yet.</p>
          )}
        </div>
      </section>

      {/* Password Section */}
      {(globalRole === 'Owner' || globalRole === 'Admin') && (
        <section>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Password</h2>
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Reset Password</h3>
              <p className="text-xs text-gray-500 mb-3">
                Generate a new random password. The staff member will be required to change it on next login.
              </p>
              <button
                onClick={() => resetPassword.mutate()}
                disabled={resetPassword.isPending}
                className="bg-orange-500 text-white px-4 py-2 rounded-md text-sm hover:bg-orange-600 disabled:opacity-50"
              >
                {resetPassword.isPending ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
            <hr />
            <SetPasswordForm
              onSubmit={(pw) => setPasswordMutation.mutate(pw)}
              isPending={setPasswordMutation.isPending}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function SetPasswordForm({ onSubmit, isPending }: { onSubmit: (pw: string) => void; isPending: boolean }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Set Password</h3>
      <p className="text-xs text-gray-500 mb-3">
        Set a specific password for this staff member.
      </p>
      <div className="space-y-3">
        <input
          type="password"
          placeholder="New password (min 8 chars)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => {
            if (pw.length < 8) {
              Swal.fire('Error', 'Password must be at least 8 characters.', 'error');
              return;
            }
            if (pw !== confirm) {
              Swal.fire('Error', 'Passwords do not match.', 'error');
              return;
            }
            onSubmit(pw);
            setPw('');
            setConfirm('');
          }}
          disabled={isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? 'Setting...' : 'Set Password'}
        </button>
      </div>
    </div>
  );
}
