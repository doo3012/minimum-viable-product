'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface BusinessUnit {
  id: string;
  name: string;
}

export default function ChatPermissionsIndexPage() {
  const router = useRouter();
  const { role } = useAuthStore();

  const { data: bus, isLoading } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
    enabled: role === 'Owner',
  });

  if (role !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can manage chat permissions.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Chat Permissions</h1>
      <p className="text-gray-500">Select a business unit to manage chat access.</p>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {bus?.map((bu) => (
          <button
            key={bu.id}
            onClick={() => router.push(`/chat-permissions/${bu.id}`)}
            className="block text-left bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <h2 className="text-base font-semibold text-gray-800">{bu.name}</h2>
            <p className="text-sm text-gray-500 mt-1">Manage chat access →</p>
          </button>
        ))}
      </div>
    </div>
  );
}
