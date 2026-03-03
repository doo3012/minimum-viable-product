'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

const navItems = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/business-units', label: 'Business Units' },
  { href: '/staff', label: 'Staff' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { globalRole, clearAuth } = useAuthStore();

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    clearAuth();
    router.push('/login');
  }

  async function handleMyProfile() {
    try {
      const res = await api.get('/staff/me');
      router.push(`/staff/${res.data.staffId}`);
    } catch {
      // Owner created at onboard may not have a staff profile
    }
  }

  return (
    <aside className="w-56 min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-700">
        <span className="text-lg font-semibold">MVP Platform</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname.startsWith(item.href)
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {item.label}
          </Link>
        ))}

        {globalRole === 'Owner' && (
          <Link
            href="/chat-permissions"
            className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              pathname.startsWith('/chat-permissions')
                ? 'bg-gray-700 text-white'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            Chat Permissions
          </Link>
        )}
      </nav>

      <div className="px-3 py-4 border-t border-gray-700 space-y-1">
        <button
          onClick={handleMyProfile}
          className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          My Profile
        </button>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
