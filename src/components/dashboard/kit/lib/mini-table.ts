/**
 * ======================== TABLE ENGINE DO DASHBOARD ========================
 *
 * Stand-in local para `@tanstack/react-table`, usado pelo kit visual do
 * dashboard — a bancada (`src/components/dashboard/preview/**`) e a DataTable
 * real (`src/components/dashboard/real/RealUnitDataTable.tsx`).
 *
 * Motivo: o `DataTable` original do template (MIT) depende de
 * `@tanstack/react-table`, que NÃO está instalado no Tieck e cuja instalação
 * não faz parte desta etapa. Em vez de reescrever o markup do template (o que
 * destruiria a fidelidade visual), este módulo expõe a MESMA superfície de API
 * usada pelo arquivo original, para que ele continue sendo o código do
 * template, com apenas o import trocado.
 *
 * Quando/se a dependência real for adotada, basta apontar o import de
 * `data-table.tsx` de volta para `@tanstack/react-table`.
 *
 * Implementado aqui: core row model, filtro por coluna, ordenação, paginação,
 * seleção de linhas, visibilidade de colunas. Não implementado (e não usado
 * pela bancada): agrupamento, expansão, pinning, faceted row model real.
 * =========================================================================
 */

import * as React from "react";

export type ColumnFiltersState = { id: string; value: unknown }[];
export type SortingState = { id: string; desc: boolean }[];
export type VisibilityState = Record<string, boolean>;
export type RowSelectionState = Record<string, boolean>;

type AnyRow = Record<string, unknown>;

export type HeaderContext<T> = { table: Table<T>; header: Header<T>; column: Column<T> };
export type CellContext<T> = {
  table: Table<T>;
  column: Column<T>;
  row: Row<T>;
  cell: Cell<T>;
};

export type ColumnDef<T = AnyRow> = {
  id?: string;
  accessorKey?: string;
  accessorFn?: (row: T) => unknown;
  header?: React.ReactNode | ((ctx: HeaderContext<T>) => React.ReactNode);
  cell?: React.ReactNode | ((ctx: CellContext<T>) => React.ReactNode);
  enableSorting?: boolean;
  enableHiding?: boolean;
};

export function flexRender<TProps>(component: unknown, props: TProps): React.ReactNode {
  if (typeof component === "function") {
    return (component as (p: TProps) => React.ReactNode)(props);
  }
  if (component === undefined || component === null) return null;
  return component as React.ReactNode;
}

/* Os "row model factories" existem apenas para manter a API do original. */
export const getCoreRowModel = () => ({ kind: "core" as const });
export const getFilteredRowModel = () => ({ kind: "filtered" as const });
export const getPaginationRowModel = () => ({ kind: "paginated" as const });
export const getSortedRowModel = () => ({ kind: "sorted" as const });
export const getFacetedRowModel = () => ({ kind: "faceted" as const });
export const getFacetedUniqueValues = () => ({ kind: "facetedUnique" as const });export type Header<T> = {
  id: string;
  colSpan: number;
  isPlaceholder: boolean;
  column: Column<T>;
  getContext: () => HeaderContext<T>;
};

type HeaderGroup<T> = { id: string; headers: Header<T>[] };

type Cell<T> = {
  id: string;
  column: Column<T>;
  row: Row<T>;
  getContext: () => { table: Table<T>; column: Column<T>; row: Row<T>; cell: Cell<T> };
};

export type Row<T> = {
  id: string;
  index: number;
  original: T;
  getIsSelected: () => boolean;
  toggleSelected: (value?: boolean) => void;
  getVisibleCells: () => Cell<T>[];
};

type Column<T> = {
  id: string;
  columnDef: ColumnDef<T>;
  accessorFn: ((row: T) => unknown) | undefined;
  getIsVisible: () => boolean;
  toggleVisibility: (value?: boolean) => void;
  getCanHide: () => boolean;
};

export type Table<T> = {
  getState: () => {
    sorting: SortingState;
    columnVisibility: VisibilityState;
    rowSelection: RowSelectionState;
    columnFilters: ColumnFiltersState;
    pagination: { pageIndex: number; pageSize: number };
  };
  getHeaderGroups: () => HeaderGroup<T>[];
  getAllColumns: () => Column<T>[];
  getRowModel: () => { rows: Row<T>[] };
  getFilteredRowModel: () => { rows: Row<T>[] };
  getFilteredSelectedRowModel: () => { rows: Row<T>[] };
  getPageCount: () => number;
  getCanPreviousPage: () => boolean;
  getCanNextPage: () => boolean;
  previousPage: () => void;
  nextPage: () => void;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;
  getIsAllPageRowsSelected: () => boolean;
  getIsSomePageRowsSelected: () => boolean;
  toggleAllPageRowsSelected: (value?: boolean) => void;
};

type TableOptions<T> = {
  data: T[];
  columns: ColumnDef<T>[];
  state?: {
    sorting?: SortingState;
    columnVisibility?: VisibilityState;
    rowSelection?: RowSelectionState;
    columnFilters?: ColumnFiltersState;
    pagination?: { pageIndex: number; pageSize: number };
  };
  getRowId?: (row: T, index: number) => string;
  enableRowSelection?: boolean;
  onRowSelectionChange?: (updater: RowSelectionState) => void;
  onSortingChange?: (updater: SortingState) => void;
  onColumnVisibilityChange?: (updater: VisibilityState) => void;
  onColumnFiltersChange?: (updater: ColumnFiltersState) => void;
  onPaginationChange?: (updater: { pageIndex: number; pageSize: number }) => void;
  [key: string]: unknown;
};

export function useReactTable<T>(options: TableOptions<T>): Table<T> {
  const {
    data,
    columns,
    state = {},
    getRowId,
    onRowSelectionChange,
    onColumnVisibilityChange,
    onPaginationChange,
  } = options;

  const pagination = state.pagination ?? { pageIndex: 0, pageSize: 10 };
  const columnVisibility = state.columnVisibility ?? {};
  const rowSelection = state.rowSelection ?? {};

  const rowIdOf = React.useCallback(
    (row: T, index: number) => (getRowId ? getRowId(row, index) : String(index)),
    [getRowId],
  );

  const tableColumns: Column<T>[] = React.useMemo(
    () =>
      columns.map((columnDef) => {
        const id = columnDef.id ?? columnDef.accessorKey ?? "column";
        const accessorFn =
          columnDef.accessorFn ??
          (columnDef.accessorKey
            ? (row: T) => (row as unknown as AnyRow)[columnDef.accessorKey as string]
            : undefined);

        return {
          id,
          columnDef,
          accessorFn,
          getIsVisible: () => columnVisibility[id] !== false,
          getCanHide: () => columnDef.enableHiding !== false,
          toggleVisibility: (value?: boolean) => {
            const next = value ?? columnVisibility[id] === false;
            onColumnVisibilityChange?.({ ...columnVisibility, [id]: next });
          },
        };
      }),
    [columns, columnVisibility, onColumnVisibilityChange],
  );

  const buildRows = React.useCallback(
    (source: T[], offset: number): Row<T>[] =>
      source.map((original, index) => {
        const id = rowIdOf(original, offset + index);
        const row: Row<T> = {
          id,
          index: offset + index,
          original,
          getIsSelected: () => rowSelection[id] === true,
          toggleSelected: (value?: boolean) => {
            const next = value ?? !(rowSelection[id] === true);
            onRowSelectionChange?.({ ...rowSelection, [id]: next });
          },
          getVisibleCells: () =>
            tableColumns
              .filter((column) => column.getIsVisible())
              .map((column) => ({
                id: `${id}_${column.id}`,
                column,
                row,
                getContext: () => ({ table, column, row, cell: undefined as never }),
              })),
        };
        return row;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowIdOf, rowSelection, tableColumns, onRowSelectionChange],
  );

  const allRows = React.useMemo(() => buildRows(data, 0), [buildRows, data]);

  const visibleColumns = React.useMemo(
    () => tableColumns.filter((column) => column.getIsVisible()),
    [tableColumns],
  );

  const headerGroups: HeaderGroup<T>[] = React.useMemo(
    () => [
      {
        id: "header-group-0",
        headers: visibleColumns.map((column) => {
          const header: Header<T> = {
            id: column.id,
            colSpan: 1,
            isPlaceholder: false,
            column,
            getContext: () => ({ table, header, column }),
          };
          return header;
        }),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleColumns],
  );

  const pageCount = Math.max(1, Math.ceil(allRows.length / pagination.pageSize));
  const pageRows = allRows.slice(
    pagination.pageIndex * pagination.pageSize,
    pagination.pageIndex * pagination.pageSize + pagination.pageSize,
  );

  const table: Table<T> = {
    getState: () => ({
      sorting: state.sorting ?? [],
      columnVisibility,
      rowSelection,
      columnFilters: state.columnFilters ?? [],
      pagination,
    }),
    getHeaderGroups: () => headerGroups,
    getAllColumns: () => tableColumns,
    getRowModel: () => ({ rows: pageRows }),
    getFilteredRowModel: () => ({ rows: allRows }),
    getFilteredSelectedRowModel: () => ({
      rows: allRows.filter((row) => rowSelection[row.id] === true),
    }),
    getPageCount: () => pageCount,
    getCanPreviousPage: () => pagination.pageIndex > 0,
    getCanNextPage: () => pagination.pageIndex < pageCount - 1,
    previousPage: () =>
      onPaginationChange?.({ ...pagination, pageIndex: Math.max(0, pagination.pageIndex - 1) }),
    nextPage: () =>
      onPaginationChange?.({
        ...pagination,
        pageIndex: Math.min(pageCount - 1, pagination.pageIndex + 1),
      }),
    setPageIndex: (index: number) =>
      onPaginationChange?.({
        ...pagination,
        pageIndex: Math.min(Math.max(0, index), pageCount - 1),
      }),
    setPageSize: (size: number) => onPaginationChange?.({ pageIndex: 0, pageSize: size }),
    getIsAllPageRowsSelected: () =>
      pageRows.length > 0 && pageRows.every((row) => rowSelection[row.id] === true),
    getIsSomePageRowsSelected: () =>
      pageRows.some((row) => rowSelection[row.id] === true) &&
      !pageRows.every((row) => rowSelection[row.id] === true),
    toggleAllPageRowsSelected: (value?: boolean) => {
      const shouldSelect = value ?? !pageRows.every((row) => rowSelection[row.id] === true);
      const next = { ...rowSelection };
      pageRows.forEach((row) => {
        next[row.id] = shouldSelect;
      });
      onRowSelectionChange?.(next);
    },
  };

  return table;
}
