'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Swal from 'sweetalert2';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface BusinessUnit {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

const col = createColumnHelper<BusinessUnit>();

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
});
type FormData = z.infer<typeof schema>;

export default function BuManagementPage() {
  const { globalRole, setBuAssignments } = useAuthStore();
  const queryClient = useQueryClient();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, isError } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
    enabled: globalRole === 'Owner',
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: (formData: FormData) => api.post('/business-units', formData),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['business-units'] });

      // Refresh BU assignments so sidebar updates immediately
      try {
        const buRes = await api.get('/staff/me/bu-assignments');
        setBuAssignments(buRes.data);
      } catch {}

      await Swal.fire('Created!', 'Business unit has been created.', 'success');
      reset();
      setShowForm(false);
    },
    onError: () => {
      Swal.fire('Error', 'Failed to create business unit.', 'error');
    },
  });

  const columns = [
    col.accessor('name', { header: 'Name' }),
    col.accessor('isDefault', {
      header: 'Type',
      cell: (info) => (info.getValue() ? 'Head Quarter' : '\u2014'),
    }),
    col.accessor('createdAt', {
      header: 'Created At',
      cell: (info) => new Date(info.getValue()).toLocaleDateString(),
    }),
  ];

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (globalRole !== 'Owner') {
    return <p className="text-red-500">Access denied. Only Owners can manage business units.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">BU Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : '+ New Business Unit'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit((formData) => createMutation.mutate(formData))}
          className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4 max-w-lg"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              {...register('name')}
              className="mt-1 w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && (
              <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-blue-600 text-white px-5 py-2 rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </button>
        </form>
      )}

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && <p className="text-red-500">Failed to load business units.</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc'
                        ? ' \u2191'
                        : header.column.getIsSorted() === 'desc'
                          ? ' \u2193'
                          : ''}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-700">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
