'use client';

import { use } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { ChatBox } from '@/components/ChatBox';

export default function ChatPage({ params }: { params: Promise<{ buId: string }> }) {
  const { buId } = use(params);
  const { globalRole, buAssignments } = useAuthStore();
  const activeBu = buAssignments.find((b) => b.buId === buId);

  const isOwner = globalRole === 'Owner';
  const hasChatAccess = activeBu?.hasChatAccess ?? false;

  if (!isOwner && !hasChatAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
        <svg
          className="w-16 h-16 mb-4 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Access Restricted</h2>
        <p className="text-sm">Please contact your Company Owner to enable chat access.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">
        {activeBu?.buName ?? 'Business Unit'} — Chat
      </h1>
      <ChatBox buId={buId} />
    </div>
  );
}
