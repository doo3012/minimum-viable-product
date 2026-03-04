'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';

export default function BuDashboardPage() {
  const { buAssignments, setActiveBuId } = useAuthStore();
  const router = useRouter();

  const handleSelect = (buId: string) => {
    setActiveBuId(buId);
    router.push(`/bu/${buId}/staff`);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Business Units</h1>
      <p className="text-gray-500">Select a business unit to manage.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {buAssignments.map((bu) => (
          <button
            key={bu.buId}
            onClick={() => handleSelect(bu.buId)}
            className="block text-left bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
          >
            <h2 className="text-base font-semibold text-gray-800">{bu.buName}</h2>
            <p className="text-sm text-gray-500 mt-1">{bu.role}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
