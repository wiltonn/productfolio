import { useRef, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type OnChangeFn,
} from '@tanstack/react-table';

interface VirtualTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  rowHeight?: number;
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  globalFilter?: string;
  onRowClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function VirtualTable<T>({
  data,
  columns,
  rowHeight = 52,
  enableRowSelection = false,
  rowSelection = {},
  onRowSelectionChange,
  sorting = [],
  onSortingChange,
  globalFilter = '',
  onRowClick,
  getRowId,
  isLoading = false,
  emptyMessage = 'No items found',
}: VirtualTableProps<T>) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [internalSorting, setInternalSorting] = useState<SortingState>(sorting);
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>(rowSelection);

  // Sync external state
  useEffect(() => {
    setInternalSorting(sorting);
  }, [sorting]);

  useEffect(() => {
    setInternalSelection(rowSelection);
  }, [rowSelection]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: internalSorting,
      rowSelection: internalSelection,
      globalFilter,
    },
    onSortingChange: (updater) => {
      const newSorting = typeof updater === 'function' ? updater(internalSorting) : updater;
      setInternalSorting(newSorting);
      onSortingChange?.(updater);
    },
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === 'function' ? updater(internalSelection) : updater;
      setInternalSelection(newSelection);
      onRowSelectionChange?.(updater);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableRowSelection,
    getRowId: getRowId as (row: T) => string,
  });

  const { rows } = table.getRowModel();

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => rowHeight,
    overscan: 15,
  });

  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
  const paddingBottom = virtualRows.length > 0
    ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
    : 0;

  const handleRowClick = useCallback(
    (row: T) => {
      onRowClick?.(row);
    },
    [onRowClick]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-surface-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-sm font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-surface-500">
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
        </svg>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={tableContainerRef}
      className="overflow-auto relative"
      style={{ maxHeight: 'calc(100vh - 380px)', minHeight: '400px' }}
    >
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-surface-50/95 backdrop-blur-sm border-b border-surface-200">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                  className={`
                    px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider
                    text-surface-500 select-none
                    ${header.column.getCanSort() ? 'cursor-pointer hover:text-surface-700 transition-colors' : ''}
                  `}
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <div className="flex items-center gap-1.5">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanSort() && (
                      <span className="w-4 h-4 flex items-center justify-center">
                        {{
                          asc: (
                            <svg className="w-3.5 h-3.5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                            </svg>
                          ),
                          desc: (
                            <svg className="w-3.5 h-3.5 text-accent-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          ),
                        }[header.column.getIsSorted() as string] ?? (
                          <svg className="w-3.5 h-3.5 opacity-0 group-hover:opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                          </svg>
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr>
              <td style={{ height: `${paddingTop}px` }} colSpan={columns.length} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const isSelected = row.getIsSelected();
            return (
              <tr
                key={row.id}
                data-index={virtualRow.index}
                className={`
                  group transition-colors duration-100
                  ${isSelected ? 'bg-accent-50/70' : 'hover:bg-surface-50/80'}
                  ${onRowClick ? 'cursor-pointer' : ''}
                `}
                onClick={() => handleRowClick(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="px-4 py-3 text-surface-700 border-b border-surface-100/80"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td style={{ height: `${paddingBottom}px` }} colSpan={columns.length} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
