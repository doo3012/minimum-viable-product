'use client';

import { use } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import Link from 'next/link';
import Swal from 'sweetalert2';

interface StaffBuDto {
  buId: string;
  buName: string;
  email: string;
  role: string;
  hasChatAccess: boolean;
}

interface StaffDto {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
  role: string;
  buCount: number;
  buAssignments: StaffBuDto[];
}

export default function BuStaffPage({
  params,
}: {
  params: Promise<{ buId: string }>;
}) {
  const { buId } = use(params);
  const { globalRole, buAssignments } = useAuthStore();
  const activeBu = buAssignments.find((b) => b.buId === buId);
  const buRole = activeBu?.role;

  const isOwner = globalRole === 'Owner';
  const isAdmin = globalRole === 'Admin' || buRole === 'Admin' || isOwner;

  const { data, isLoading, isError } = useQuery<StaffDto[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data),
  });

  // Filter staff to only those assigned to this BU and compute derived role for display and sorting
  const buStaff = (data || [])
    .filter((s) => s.buAssignments.some((b) => b.buId === buId))
    .map((s) => {
      const buAssignment = s.buAssignments.find((b) => b.buId === buId);
      const displayRole = (s.role === 'Admin' || s.role === 'Owner')
        ? s.role
        : (buAssignment?.role ?? s.role);
      return { ...s, buAssignment, displayRole };
    })
    .sort((a, b) => a.displayRole.localeCompare(b.displayRole));

  const resetPwdMutation = useMutation({
    mutationFn: (staffId: string) => api.post(`/staff/${staffId}/reset-password`).then(r => r.data),
    onSuccess: (data) => {
      Swal.fire({
        title: 'Password Reset',
        html: `The password has been reset successfully.<br><br><b>New Password:</b> <code>${data.newPassword}</code><br><br>Please copy this password and share it with the staff member securely.`,
        icon: 'success',
        confirmButtonText: 'OK'
      });
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      const message = err.response?.data?.error || err.message || 'Failed to reset password.';
      Swal.fire('Error', message, 'error');
    }
  });

  const handleResetPassword = async (staffId: string, name: string) => {
    const result = await Swal.fire({
      title: 'Reset Password?',
      text: `Are you sure you want to reset the password for ${name}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      confirmButtonText: 'Yes, reset it!'
    });

    if (result.isConfirmed) {
      resetPwdMutation.mutate(staffId);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">
        {activeBu?.buName ?? 'Business Unit'} — Staff
      </h1>

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && <p className="text-red-500">Failed to load staff.</p>}

      {buStaff && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
                {isAdmin && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                )}
                {isAdmin && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                )}
                {isAdmin && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {buStaff.map((staff) => {
                const buAssignment = staff.buAssignment;
                const displayRole = staff.displayRole;
                return (
                  <tr key={staff.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {staff.firstName} {staff.lastName}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-700">
                        {buAssignment?.email ?? '—'}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-700">
                        {displayRole}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {isOwner && (
                            <Link
                              href={`/company/staff/${staff.id}`}
                              className="text-blue-600 hover:underline text-sm"
                            >
                              Edit
                            </Link>
                          )}
                          {(isOwner || (isAdmin && displayRole === 'Staff')) ? (
                            <button
                              onClick={() => handleResetPassword(staff.id, `${staff.firstName} ${staff.lastName}`)}
                              disabled={resetPwdMutation.isPending}
                              className="text-red-600 hover:underline text-sm disabled:opacity-50"
                            >
                              Reset Password
                            </button>
                          ) : null}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {buStaff.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    No staff assigned to this business unit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
