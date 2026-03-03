'use client';

import { TopNav } from './TopNav';
import { DynamicSidebar } from './DynamicSidebar';

export function AppShell({
  activeBuId,
  children,
}: {
  activeBuId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopNav activeBuId={activeBuId} />
      <div className="flex flex-1 min-h-0">
        <DynamicSidebar activeBuId={activeBuId} />
        <main className="flex-1 bg-gray-50 p-8 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
