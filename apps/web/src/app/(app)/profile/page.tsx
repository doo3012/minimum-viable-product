'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface MyProfile {
  staffId: string;
  firstName: string;
  lastName: string;
  role: string;
  buAssignments: { buId: string; buName: string; email: string }[];
}

export default function ProfilePage() {
  const { globalRole } = useAuthStore();

  const { data, isLoading, isError } = useQuery<MyProfile>({
    queryKey: ['my-profile'],
    queryFn: () => api.get('/staff/me').then((r) => r.data),
  });

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
      <h1 className="text-2xl font-bold text-gray-800">My Profile</h1>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
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
      </div>

      {data.buAssignments.length > 0 && (
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
