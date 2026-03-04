'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';
import Swal from 'sweetalert2';

interface StaffBuInfo {
  buId: string;
  buName: string;
  email: string;
  hasChatAccess: boolean;
}

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  buCount: number;
  buAssignments: StaffBuInfo[];
}

export default function CompanyStaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { globalRole } = useAuthStore();

  const { data, isLoading, isError } = useQuery<StaffMember[]>({
    queryKey: ['staff'],
    queryFn: () => api.get('/staff').then((r) => r.data),
    enabled: globalRole === 'Owner',
  });

  const deleteMutation = useMutation({
    mutationFn: (staffId: string) => api.delete(`/staff/${staffId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      Swal.fire('Deleted!', 'Staff member has been removed.', 'success');
    },
    onError: () => Swal.fire('Error', 'Failed to delete staff member.', 'error'),
  });

  const handleDelete = async (staff: StaffMember) => {
    const result = await Swal.fire({
      title: 'Delete Staff?',
      text: `Are you sure you want to delete ${staff.firstName} ${staff.lastName}? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      confirmButtonText: 'Delete',
    });
    if (result.isConfirmed) {
      deleteMutation.mutate(staff.id);
    }
  };

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can view the global staff directory.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Global Staff</h1>
        <button
          onClick={() => router.push('/company/staff/new')}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          + New Staff
        </button>
      </div>

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && <p className="text-red-500">Failed to load staff.</p>}

      {data && (
        <div className="space-y-3">
          {data.map((staff) => (
            <div
              key={staff.id}
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-4"
            >
              {/* Row 1: Name, Role, Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">
                    {staff.firstName} {staff.lastName}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                    {staff.role}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => router.push(`/company/staff/${staff.id}`)}
                    className="text-sm text-blue-600 hover:text-blue-800 px-3 py-1 rounded border border-blue-200 hover:bg-blue-50 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(staff)}
                    disabled={deleteMutation.isPending}
                    className="text-sm text-red-600 hover:text-red-800 px-3 py-1 rounded border border-red-200 hover:bg-red-50 transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Row 2: BU badges with chat status */}
              {staff.buAssignments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {staff.buAssignments.map((bu) => (
                    <span
                      key={bu.buId}
                      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
                        bu.hasChatAccess
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          bu.hasChatAccess ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      />
                      {bu.buName}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {data.length === 0 && (
            <p className="text-gray-500 text-center py-8">No staff members found.</p>
          )}
        </div>
      )}
    </div>
  );
}
