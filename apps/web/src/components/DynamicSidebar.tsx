'use client';

import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface MenuItem {
  label: string;
  href: string;
}

interface MenuSection {
  items: MenuItem[];
  separator?: boolean;
}

export function DynamicSidebar({ activeBuId }: { activeBuId?: string }) {
  const { globalRole, buAssignments, activeBuId: storedBuId } = useAuthStore();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(true);

  const isOwner = globalRole === 'Owner';
  const isMultiBu = buAssignments.length > 1;
  const effectiveBuId = activeBuId || storedBuId || buAssignments[0]?.buId;
  const activeBu = buAssignments.find((b) => b.buId === effectiveBuId);
  const hasChatAccess = activeBu?.hasChatAccess ?? false;

  const sections: MenuSection[] = [];

  // BU Dashboard (multi-BU only)
  if (isMultiBu) {
    sections.push({
      items: [{ label: 'BU Dashboard', href: '/bu/dashboard' }],
      separator: !!effectiveBuId,
    });
  }

  // BU-scoped items (when a BU is selected or single-BU)
  if (effectiveBuId) {
    const buItems: MenuItem[] = [
      { label: 'BU Staff', href: `/bu/${effectiveBuId}/staff` },
    ];
    if (hasChatAccess || isOwner) {
      buItems.push({ label: 'Chat', href: `/bu/${effectiveBuId}/chat` });
    }
    sections.push({ items: buItems, separator: true });
  }

  // Personal
  sections.push({
    items: [{ label: 'My Profile', href: '/profile' }],
  });

  const settingsItems: MenuItem[] = isOwner
    ? [
        { label: 'Company Settings', href: '/company/settings' },
        { label: 'BU Management', href: '/bu/management' },
        { label: 'Global Staff', href: '/company/staff' },
      ]
    : [];

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col border-r border-gray-700 min-h-0">
      <nav className="flex-1 py-4 overflow-y-auto">
        {sections.map((section, si) => (
          <div key={si}>
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
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
            {section.separator && (
              <div className="my-2 mx-4 border-t border-gray-700" />
            )}
          </div>
        ))}

        {/* Settings drilldown (Owner only) */}
        {settingsItems.length > 0 && (
          <div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="w-full flex items-center justify-between px-6 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition"
            >
              <span>Settings</span>
              <span className="text-xs">{settingsOpen ? '▾' : '▸'}</span>
            </button>
            {settingsOpen &&
              settingsItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block pl-10 pr-6 py-2 text-sm transition ${
                      isActive
                        ? 'bg-gray-700 text-white border-l-2 border-blue-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
          </div>
        )}
      </nav>
    </aside>
  );
}
