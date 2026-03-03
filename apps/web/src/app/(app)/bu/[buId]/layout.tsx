'use client';

import { use } from 'react';
import { AppShell } from '@/components/AppShell';

export default function BuLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ buId: string }>;
}) {
  const { buId } = use(params);
  return <AppShell activeBuId={buId}>{children}</AppShell>;
}
