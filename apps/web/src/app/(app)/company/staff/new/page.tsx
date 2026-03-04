'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.enum(['Admin', 'Staff'], { required_error: 'Role is required' }),
});
type FormData = z.infer<typeof schema>;

interface BusinessUnit {
  id: string;
  name: string;
}

interface PendingBu {
  buId: string;
  buName: string;
  chatAccess: boolean;
}

export default function NewStaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { globalRole } = useAuthStore();
  const [pendingBus, setPendingBus] = useState<PendingBu[]>([]);
  const [selectedBuId, setSelectedBuId] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { data: allBus } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
  });

  // BUs not yet added to pending list
  const assignedBuIds = new Set(pendingBus.map((b) => b.buId));
  const availableBus = allBus?.filter((bu) => !assignedBuIds.has(bu.id)) ?? [];

  const handleAddBu = () => {
    if (!selectedBuId) return;
    const bu = allBus?.find((b) => b.id === selectedBuId);
    if (!bu) return;
    setPendingBus((prev) => [...prev, { buId: bu.id, buName: bu.name, chatAccess: false }]);
    setSelectedBuId('');
  };

  const handleRemoveBu = (buId: string) => {
    setPendingBus((prev) => prev.filter((b) => b.buId !== buId));
  };

  const handleToggleChat = (buId: string) => {
    setPendingBus((prev) =>
      prev.map((b) => (b.buId === buId ? { ...b, chatAccess: !b.chatAccess } : b))
    );
  };

  const mutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (pendingBus.length === 0) {
        throw new Error('Please add at least one BU assignment.');
      }

      // Create staff with first BU (required by current API)
      const firstBu = pendingBus[0];
      const res = await api.post('/staff', {
        ...formData,
        buId: firstBu.buId,
        email: '',
      });
      const staffId = res.data.id;

      // Add remaining BUs
      for (let i = 1; i < pendingBus.length; i++) {
        await api.post(`/staff/${staffId}/bu/${pendingBus[i].buId}`);
      }

      // Grant chat access where toggled
      for (const bu of pendingBus) {
        if (bu.chatAccess) {
          await api.post('/chat-permissions', { staffId, buId: bu.buId });
        }
      }

      return staffId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      await Swal.fire('Created!', 'Staff member has been added.', 'success');
      router.push('/company/staff');
    },
    onError: (err: Error) => {
      Swal.fire('Error', err.message || 'Failed to create staff member.', 'error');
    },
  });

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can create staff.</p>;
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700 text-sm">
          &larr; Back
        </button>
        <h1 className="text-2xl font-bold text-gray-800">New Staff Member</h1>
      </div>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="space-y-8"
      >
        {/* Profile Section */}
        <section className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700">Profile</h2>
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
          <div>
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select
              {...register('role')}
              className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select role...</option>
              <option value="Admin">Admin</option>
              <option value="Staff">Staff</option>
            </select>
            {errors.role && (
              <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>
            )}
          </div>
        </section>

        {/* BU Assignments Section */}
        <section className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-700 mb-3">BU Assignments</h2>
            <div className="flex items-center gap-3">
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
                type="button"
                onClick={handleAddBu}
                disabled={!selectedBuId}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                + Add
              </button>
            </div>
          </div>

          {pendingBus.length > 0 ? (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">BU Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Chat Access</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingBus.map((bu) => (
                  <tr key={bu.buId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{bu.buName}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleChat(bu.buId)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          bu.chatAccess ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            bu.chatAccess ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleRemoveBu(bu.buId)}
                        className="text-sm text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 text-sm text-center py-6">
              Add at least one BU assignment.
            </p>
          )}
        </section>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Staff'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="bg-gray-100 text-gray-700 px-5 py-2 rounded-md text-sm hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
