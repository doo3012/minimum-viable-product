'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { loginSchema, LoginFormData } from '@/schemas/login.schema';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, setBuAssignments, setActiveBuId } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: LoginFormData) => api.post('/auth/login', data),
    onSuccess: async (res) => {
      const { userId, role, mustChangePassword, companyName, firstName, lastName } = res.data;
      const globalRole = role === 'Owner' ? 'Owner' : 'User';
      setAuth({ userId, globalRole, mustChangePassword, companyName, firstName, lastName });

      if (mustChangePassword) {
        router.push('/change-password');
        return;
      }

      // Fetch BU assignments
      try {
        const buRes = await api.get('/staff/me/bu-assignments');
        setBuAssignments(buRes.data);
        const firstBu = buRes.data[0];
        if (firstBu) {
          setActiveBuId(firstBu.buId);
          router.push(`/bu/${firstBu.buId}/dashboard`);
        } else {
          router.push('/bu/management');
        }
      } catch {
        router.push('/bu/management');
      }
    },
    onError: () => {
      Swal.fire('Login failed', 'Invalid username or password.', 'error');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm space-y-4"
      >
        <h1 className="text-2xl font-bold text-gray-800">Sign In</h1>

        <div>
          <label className="block text-sm font-medium text-gray-700">Username</label>
          <input
            {...register('username')}
            autoComplete="username"
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.username && (
            <p className="text-red-500 text-xs mt-1">{errors.username.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input
            {...register('password')}
            type="password"
            autoComplete="current-password"
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.password && (
            <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Signing in...' : 'Sign In'}
        </button>

        <p className="text-center text-sm text-gray-500">
          New company?{' '}
          <a href="/onboard" className="text-blue-600 hover:underline">
            Register here
          </a>
        </p>
      </form>
    </div>
  );
}
