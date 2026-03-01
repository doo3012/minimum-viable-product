'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  role: z.enum(['Admin', 'Staff']).refine((v) => v !== undefined, 'Role is required'),
  buId: z.string().uuid('Please select a business unit'),
  email: z.string().email('Invalid email').min(1, 'Email is required'),
});
type FormData = z.infer<typeof schema>;

interface BusinessUnit {
  id: string;
  name: string;
}

export default function NewStaffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const { data: bus } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/staff', data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] });
      await Swal.fire('Created!', 'Staff member has been added.', 'success');
      router.push('/staff');
    },
    onError: () => {
      Swal.fire('Error', 'Failed to create staff member.', 'error');
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">New Staff Member</h1>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
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

        <div>
          <label className="block text-sm font-medium text-gray-700">Role</label>
          <select
            {...register('role')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select role…</option>
            <option value="Admin">Admin</option>
            <option value="Staff">Staff</option>
          </select>
          {errors.role && (
            <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Business Unit</label>
          <select
            {...register('buId')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select BU…</option>
            {bus?.map((bu) => (
              <option key={bu.id} value={bu.id}>
                {bu.name}
              </option>
            ))}
          </select>
          {errors.buId && (
            <p className="text-red-500 text-xs mt-1">{errors.buId.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email (BU-scoped)</label>
          <input
            {...register('email')}
            type="email"
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating…' : 'Create'}
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
