'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import Swal from 'sweetalert2';

interface CompanySettings {
  companyId: string;
  companyName: string;
  address: string;
  contactNumber: string;
}

export default function CompanySettingsPage() {
  const { globalRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ companyName: '', address: '', contactNumber: '' });

  const { data, isLoading, isError } = useQuery<CompanySettings>({
    queryKey: ['company-settings'],
    queryFn: () => api.get('/companies/me').then((r) => r.data),
    enabled: globalRole === 'Owner',
  });

  const mutation = useMutation({
    mutationFn: (payload: typeof form) => api.put('/companies/me', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-settings'] });
      setEditing(false);
      Swal.fire('Saved', 'Company settings updated successfully.', 'success');
    },
    onError: () => {
      Swal.fire('Error', 'Failed to update company settings.', 'error');
    },
  });

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can view company settings.</p>;
  }

  const startEditing = () => {
    if (!data) return;
    setForm({
      companyName: data.companyName,
      address: data.address,
      contactNumber: data.contactNumber,
    });
    setEditing(true);
  };

  const handleSave = () => {
    if (!form.companyName.trim() || !form.address.trim() || !form.contactNumber.trim()) return;
    mutation.mutate({
      companyName: form.companyName.trim(),
      address: form.address.trim(),
      contactNumber: form.contactNumber.trim(),
    });
  };

  if (isLoading) return <p className="text-gray-500">Loading...</p>;
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Company Settings</h1>
        <p className="text-gray-500">Could not load company settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Company Settings</h1>
        {!editing && (
          <button
            onClick={startEditing}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
          >
            Edit
          </button>
        )}
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4">
        {editing ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Company Name
              </label>
              <input
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Address
              </label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={3}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Contact Number
              </label>
              <input
                value={form.contactNumber}
                onChange={(e) => setForm({ ...form, contactNumber: e.target.value })}
                className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSave}
                disabled={mutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {mutation.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Company Name
              </label>
              <p className="mt-1 text-gray-800">{data.companyName}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Address
              </label>
              <p className="mt-1 text-gray-800">{data.address}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
                Contact Number
              </label>
              <p className="mt-1 text-gray-800">{data.contactNumber}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
