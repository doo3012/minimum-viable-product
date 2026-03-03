'use client';

import { AppShell } from '@/components/AppShell';

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
