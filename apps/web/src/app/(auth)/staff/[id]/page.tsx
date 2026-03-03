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

interface StaffDetail {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  buAssignments: { buId: string; buName: string; email: string }[];
}

export default function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { globalRole } = useAuthStore();
  const [tab, setTab] = useState<'profile' | 'bu' | 'password'>('profile');

  const { data, isLoading } = useQuery<StaffDetail>({
    queryKey: ['staff', id],
    queryFn: () => api.get(`/staff/${id}`).then((r) => r.data),
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

  const updateBuEmail = useMutation({
    mutationFn: ({ buId, email }: { buId: string; email: string }) =>
      api.put(`/staff/${id}/bu-scoped`, { buId, email }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', id] }),
    onError: () => Swal.fire('Error', 'Update failed.', 'error'),
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

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (!data) return <p className="text-red-500">Staff member not found.</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm">
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {data.firstName} {data.lastName}
        </h1>
        <span className="text-sm bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{data.role}</span>
      </div>

      <div className="flex border-b border-gray-200">
        {(['profile', 'bu'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'profile' ? 'Global Profile' : 'BU-Scoped Data'}
          </button>
        ))}
        {(globalRole === 'Owner' || globalRole === 'Admin') && (
          <button
            onClick={() => setTab('password')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'password'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Password
          </button>
        )}
      </div>

      {tab === 'profile' && (
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
            {updateProfile.isPending ? 'Saving…' : 'Save Profile'}
          </button>
        </form>
      )}

      {tab === 'bu' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Business Unit</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.buAssignments.map((row) => (
                <BuScopedRow
                  key={row.buId}
                  row={row}
                  onSave={(email) => updateBuEmail.mutate({ buId: row.buId, email })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'password' && (
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
              {resetPassword.isPending ? 'Resetting\u2026' : 'Reset Password'}
            </button>
          </div>
          <hr />
          <SetPasswordForm
            onSubmit={(pw) => setPasswordMutation.mutate(pw)}
            isPending={setPasswordMutation.isPending}
          />
        </div>
      )}
    </div>
  );
}

function BuScopedRow({
  row,
  onSave,
}: {
  row: { buId: string; buName: string; email: string };
  onSave: (email: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(row.email);

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-gray-700">{row.buName}</td>
      <td className="px-4 py-3 text-gray-700">
        {editing ? (
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : (
          row.email
        )}
      </td>
      <td className="px-4 py-3">
        {editing ? (
          <div className="flex gap-2">
            <button
              onClick={() => {
                onSave(email);
                setEditing(false);
              }}
              className="text-blue-600 hover:underline text-sm"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEmail(row.email);
                setEditing(false);
              }}
              className="text-gray-500 hover:underline text-sm"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-blue-600 hover:underline text-sm"
          >
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}

function SetPasswordForm({ onSubmit, isPending }: { onSubmit: (pw: string) => void; isPending: boolean }) {
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Set Password</h3>
      <p className="text-xs text-gray-500 mb-3">
        Set a specific password for this staff member. They will be required to change it on next login.
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
          {isPending ? 'Setting\u2026' : 'Set Password'}
        </button>
      </div>
    </div>
  );
}
