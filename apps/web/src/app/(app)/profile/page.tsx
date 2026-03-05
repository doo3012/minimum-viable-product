'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import Swal from 'sweetalert2';

interface MyProfile {
  staffId: string;
  firstName: string;
  lastName: string;
  role: string;
  username: string;
  buAssignments: { buId: string; buName: string; email: string }[];
}

export default function ProfilePage() {
  const { globalRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const { data, isLoading, isError } = useQuery<MyProfile>({
    queryKey: ['my-profile'],
    queryFn: () => api.get('/staff/me').then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: (payload: { firstName: string; lastName: string }) =>
      api.put('/staff/me', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-profile'] });
      setEditing(false);
      Swal.fire('Saved', 'Profile updated successfully.', 'success');
    },
    onError: () => {
      Swal.fire('Error', 'Failed to update profile.', 'error');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (pwd: string) => api.post('/auth/change-password', { newPassword: pwd }),
    onSuccess: () => {
      setChangingPassword(false);
      setNewPassword('');
      setConfirmPassword('');
      Swal.fire('Success', 'Password changed successfully.', 'success');
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      const message = err.response?.data?.error || err.message || 'Failed to change password.';
      Swal.fire('Error', message, 'error');
    },
  });

  const startEditing = () => {
    if (!data) return;
    setFirstName(data.firstName);
    setLastName(data.lastName);
    setEditing(true);
  };

  const handleSave = () => {
    if (!firstName.trim() || !lastName.trim()) return;
    mutation.mutate({ firstName: firstName.trim(), lastName: lastName.trim() });
  };

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
        <p className="text-gray-500">Could not load profile information.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>
        {!editing && (
          <button
            onClick={startEditing}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            Edit
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
        {editing ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  First Name
                </label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Last Name
                </label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {mutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  First Name
                </label>
                <p className="mt-1 text-gray-800">{data.firstName}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Last Name
                </label>
                <p className="mt-1 text-gray-800">{data.lastName}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Global Role
              </label>
              <p className="mt-1 text-gray-800">{globalRole ?? data.role}</p>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Username (Email)
              </label>
              <p className="mt-1 text-gray-800">{data.username}</p>
            </div>
          </>
        )}
      </div>

      {/* Change Password Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mt-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Security</h2>
        {changingPassword ? (
          <div className="space-y-4 max-w-sm">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  if (!newPassword.trim()) return;
                  if (newPassword !== confirmPassword) {
                    Swal.fire('Error', 'Passwords do not match.', 'error');
                    return;
                  }
                  passwordMutation.mutate(newPassword);
                }}
                disabled={passwordMutation.isPending || !newPassword.trim()}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 transition"
              >
                {passwordMutation.isPending ? 'Updating...' : 'Update Password'}
              </button>
              <button
                onClick={() => {
                  setChangingPassword(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setChangingPassword(true)}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition"
          >
            Change Password
          </button>
        )}
      </div>

      {data.buAssignments?.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Business Unit Assignments</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Business Unit</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.buAssignments.map((bu) => (
                  <tr key={bu.buId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{bu.buName}</td>
                    <td className="px-4 py-3 text-gray-700">{bu.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
