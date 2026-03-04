'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';

export function BuSwitcher({ activeBuId }: { activeBuId?: string }) {
  const { buAssignments, activeBuId: storedBuId, setActiveBuId } = useAuthStore();
  const router = useRouter();

  if (buAssignments.length === 0) return null;

  const effectiveBuId = activeBuId || storedBuId || buAssignments[0]?.buId;

  const handleChange = (buId: string) => {
    setActiveBuId(buId);
    router.push(`/bu/${buId}/dashboard`);
  };

  if (buAssignments.length === 1) {
    return (
      <span className="text-sm text-gray-300">{buAssignments[0].buName}</span>
    );
  }

  return (
    <select
      value={effectiveBuId || ''}
      onChange={(e) => handleChange(e.target.value)}
      className="bg-gray-800 text-white text-sm rounded px-3 py-1.5 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {buAssignments.map((bu) => (
        <option key={bu.buId} value={bu.buId}>
          {bu.buName}
        </option>
      ))}
    </select>
  );
}
