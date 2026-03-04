'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

const schema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function ChangePasswordPage() {
  const router = useRouter();
  const store = useAuthStore();
  const { setAuth, setBuAssignments, setActiveBuId } = store;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: (data: FormData) =>
      api.post('/auth/change-password', { newPassword: data.newPassword }),
    onSuccess: async () => {
      if (store.userId && store.globalRole) setAuth({
        userId: store.userId, globalRole: store.globalRole, mustChangePassword: false,
        companyName: store.companyName ?? '', firstName: store.firstName ?? '', lastName: store.lastName ?? '',
      });
      await Swal.fire('Password updated!', 'You can now use your new password.', 'success');

      // Fetch BU assignments and redirect
      try {
        const buRes = await api.get('/staff/me/bu-assignments');
        setBuAssignments(buRes.data);
        if (buRes.data.length > 1) {
          router.push('/bu/dashboard');
        } else if (buRes.data.length === 1) {
          setActiveBuId(buRes.data[0].buId);
          router.push(`/bu/${buRes.data[0].buId}/staff`);
        } else {
          const role = store.globalRole;
          router.push(role === 'Owner' ? '/bu/management' : '/login');
        }
      } catch {
        router.push('/bu/management');
      }
    },
    onError: () => {
      Swal.fire('Error', 'Failed to change password. Please try again.', 'error');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm space-y-4"
      >
        <h1 className="text-2xl font-bold text-gray-800">Change Password</h1>
        <p className="text-sm text-gray-500">
          Your account requires a password change before continuing.
        </p>

        <div>
          <label className="block text-sm font-medium text-gray-700">New Password</label>
          <input
            {...register('newPassword')}
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.newPassword && (
            <p className="text-red-500 text-xs mt-1">{errors.newPassword.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
          <input
            {...register('confirmPassword')}
            type="password"
            autoComplete="new-password"
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.confirmPassword && (
            <p className="text-red-500 text-xs mt-1">{errors.confirmPassword.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
