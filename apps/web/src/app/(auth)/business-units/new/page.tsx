'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
});
type FormData = z.infer<typeof schema>;

export default function NewBusinessUnitPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/business-units', data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['business-units'] });
      await Swal.fire('Created!', 'Business unit has been created.', 'success');
      router.push('/business-units');
    },
    onError: () => {
      Swal.fire('Error', 'Failed to create business unit.', 'error');
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">New Business Unit</h1>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700">Name</label>
          <input
            {...register('name')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.name && (
            <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
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
