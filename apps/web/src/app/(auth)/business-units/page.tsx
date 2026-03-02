'use client';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

interface BusinessUnit {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

const col = createColumnHelper<BusinessUnit>();

const columns = [
  col.accessor('name', { header: 'Name' }),
  col.accessor('isDefault', {
    header: 'Default',
    cell: (info) => (info.getValue() ? 'Yes' : '—'),
  }),
  col.accessor('createdAt', {
    header: 'Created At',
    cell: (info) => new Date(info.getValue()).toLocaleDateString(),
  }),
];

export default function BusinessUnitsPage() {
  const router = useRouter();
  const { role } = useAuthStore();
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data, isLoading, isError } = useQuery<BusinessUnit[]>({
    queryKey: ['business-units'],
    queryFn: () => api.get('/business-units').then((r) => r.data),
  });

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Business Units</h1>
        {(role === 'Owner' || role === 'Admin') && (
          <button
            onClick={() => router.push('/business-units/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700"
          >
            + New Business Unit
          </button>
        )}
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
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
                        ? ' ↑'
                        : header.column.getIsSorted() === 'desc'
                          ? ' ↓'
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
