'use client';

import { use } from 'react';
import { useAuthStore } from '@/stores/authStore';

export default function BuDashboardPage({
  params,
}: {
  params: Promise<{ buId: string }>;
}) {
  const { buId } = use(params);
  const { buAssignments } = useAuthStore();
  const activeBu = buAssignments.find((b) => b.buId === buId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">
        {activeBu?.buName ?? 'Business Unit'} — Dashboard
      </h1>
      <p className="text-gray-600">BU operational dashboard.</p>
    </div>
  );
}
