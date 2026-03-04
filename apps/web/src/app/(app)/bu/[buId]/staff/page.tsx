'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import Link from 'next/link';

interface StaffBuDto {
  buId: string;
  buName: string;
  email: string;
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
  const isAdmin = buRole === 'Admin' || isOwner;

  const { data, isLoading, isError } = useQuery<StaffDto[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data),
  });

  // Filter staff to only those assigned to this BU
  const buStaff = data?.filter((s) =>
    s.buAssignments.some((b) => b.buId === buId)
  );

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
                {isOwner && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Role</th>
                )}
                {isAdmin && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                )}
                {isOwner && (
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {buStaff.map((staff) => {
                const buAssignment = staff.buAssignments.find((b) => b.buId === buId);
                return (
                  <tr key={staff.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">
                      {staff.firstName} {staff.lastName}
                    </td>
                    {isOwner && (
                      <td className="px-4 py-3 text-gray-700">{staff.role}</td>
                    )}
                    {isAdmin && (
                      <td className="px-4 py-3 text-gray-700">
                        {buAssignment?.email ?? '—'}
                      </td>
                    )}
                    {isOwner && (
                      <td className="px-4 py-3">
                        <Link
                          href={`/company/staff/${staff.id}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          Edit
                        </Link>
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
