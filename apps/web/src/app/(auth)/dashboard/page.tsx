'use client';
import { useAuthStore } from '@/stores/authStore';

export default function DashboardPage() {
  const { role } = useAuthStore();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back. You are signed in as {role ?? 'user'}.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Business Units" description="Manage your company's business units" href="/business-units" />
        <StatCard title="Staff" description="View and manage staff members" href="/staff" />
        {role === 'Owner' && (
          <StatCard title="Chat Permissions" description="Control chat access per BU" href="/chat-permissions" />
        )}
      </div>
    </div>
  );
}

function StatCard({ title, description, href }: { title: string; description: string; href: string }) {
  return (
    <a
      href={href}
      className="block bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow"
    >
      <h2 className="text-base font-semibold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500 mt-1">{description}</p>
    </a>
  );
}
