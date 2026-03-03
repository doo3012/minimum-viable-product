'use client';

import { useAuthStore } from '@/stores/authStore';

export default function CompanySettingsPage() {
  const { globalRole } = useAuthStore();

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can view company settings.</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Company Settings</h1>
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <p className="text-gray-500">Company settings and details management coming soon.</p>
      </div>
    </div>
  );
}
