'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useAuthStore } from '@/stores/authStore';
import { api } from '@/lib/api';

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
}

const col = createColumnHelper<StaffMember>();

export default function BuStaffPage({
  params,
}: {
  params: Promise<{ buId: string }>;
}) {
  const { buId } = use(params);
  const { buAssignments } = useAuthStore();
  const activeBu = buAssignments.find((b) => b.buId === buId);
  const [sorting, setSorting] = useState<SortingState>([]);

  const { data, isLoading, isError } = useQuery<StaffMember[]>({
    queryKey: ['bu-staff', buId],
    queryFn: () => api.get(`/business-units/${buId}/staff`).then((r) => r.data),
  });

  const columns = [
    col.accessor((row) => `${row.firstName} ${row.lastName}`, {
      id: 'fullName',
      header: 'Full Name',
    }),
    col.accessor('role', { header: 'Role' }),
    col.accessor('email', { header: 'Email' }),
  ];

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
      <h1 className="text-2xl font-bold text-gray-800">
        {activeBu?.buName ?? 'Business Unit'} — Staff
      </h1>

      {isLoading && <p className="text-gray-500">Loading...</p>}
      {isError && <p className="text-red-500">Failed to load staff.</p>}

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
