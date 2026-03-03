'use client';

import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarItem {
  label: string;
  href: string;
  show: boolean;
}

export function DynamicSidebar({ activeBuId }: { activeBuId?: string }) {
  const { globalRole, buAssignments } = useAuthStore();
  const pathname = usePathname();

  const isOwner = globalRole === 'Owner';
  const activeBu = buAssignments.find((b) => b.buId === activeBuId);
  const buRole = activeBu?.role;
  const isAdmin = buRole === 'Admin' || isOwner;
  const hasChatAccess = activeBu?.hasChatAccess ?? false;

  const items: SidebarItem[] = [
    // Global (Owner only)
    { label: 'Company Settings', href: '/company/settings', show: isOwner },
    { label: 'BU Management', href: '/bu/management', show: isOwner },
    { label: 'Global Staff', href: '/company/staff', show: isOwner },
    { label: 'BU Access Control', href: '/company/access-control', show: isOwner },

    // BU-scoped
    ...(activeBuId
      ? [
          { label: 'Dashboard', href: `/bu/${activeBuId}/dashboard`, show: true },
          { label: 'BU Staff', href: `/bu/${activeBuId}/staff`, show: isAdmin },
          { label: 'Chat', href: `/bu/${activeBuId}/chat`, show: hasChatAccess || isOwner },
        ]
      : []),

    // Personal
    { label: 'My Profile', href: '/profile', show: true },
  ];

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col border-r border-gray-700 min-h-0">
      <nav className="flex-1 py-4 overflow-y-auto">
        {items
          .filter((item) => item.show)
          .map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-6 py-2.5 text-sm transition ${
                  isActive
                    ? 'bg-gray-700 text-white border-l-2 border-blue-400'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
