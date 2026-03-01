'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { onboardSchema, OnboardFormData } from '@/schemas/onboard.schema';

export default function OnboardPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OnboardFormData>({
    resolver: zodResolver(onboardSchema),
  });

  const mutation = useMutation({
    mutationFn: (data: OnboardFormData) =>
      api.post('/companies/onboard', {
        companyName: data.companyName,
        address: data.address,
        contactNumber: data.contactNumber,
      }),
    onSuccess: (res) => {
      Swal.fire({
        title: 'Company registered!',
        html: `Your login credentials:<br><b>Username:</b> ${res.data.username}<br><b>Password:</b> ${res.data.defaultPassword}`,
        icon: 'success',
        confirmButtonText: 'Go to Login',
      }).then(() => router.push('/login'));
    },
    onError: () => {
      Swal.fire('Error', 'Onboarding failed. Please try again.', 'error');
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-4"
      >
        <h1 className="text-2xl font-bold text-gray-800">Register Your Company</h1>

        <div>
          <label className="block text-sm font-medium text-gray-700">Company Name</label>
          <input
            {...register('companyName')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.companyName && (
            <p className="text-red-500 text-xs mt-1">{errors.companyName.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Address</label>
          <textarea
            {...register('address')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.address && (
            <p className="text-red-500 text-xs mt-1">{errors.address.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Contact Number</label>
          <input
            {...register('contactNumber')}
            className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.contactNumber && (
            <p className="text-red-500 text-xs mt-1">{errors.contactNumber.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Registering...' : 'Register Company'}
        </button>
      </form>
    </div>
  );
}
