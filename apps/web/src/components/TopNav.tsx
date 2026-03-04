'use client';

import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export function TopNav() {
  const { clearAuth, companyName, firstName, lastName } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    clearAuth();
    router.push('/login');
  };

  return (
    <header className="h-14 bg-gray-900 text-white flex items-center justify-between px-6 border-b border-gray-700">
      <div className="font-semibold text-lg">{companyName || 'MVP Platform'}</div>
      <div className="flex items-center gap-4">
        {firstName && (
          <span className="text-sm text-gray-300">
            {firstName} {lastName}
          </span>
        )}
        <button
          onClick={handleLogout}
          className="text-sm text-gray-300 hover:text-white transition"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
