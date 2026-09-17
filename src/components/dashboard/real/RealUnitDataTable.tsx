/*
 * ============== DESEMPENHO POR UNIDADE (DATA TABLE REAL) ==================
 *
 * Shell do `DataTable` do template MIT
 * `shadcn-dashboard-landing-template` (app/dashboard-1): Tabs com badges,
 * "Customize Columns" (DropdownMenu com DropdownMenuCheckboxItem), container
 * `overflow-hidden rounded-lg border`, `TableHeader` em `bg-muted` sticky,
 * `TableBody` com checkbox de seleção, rodapé de seleção, "Rows per page",
 * "Page X of Y" e os quatro botões de paginação.
 *
 * Todo o chrome acima é o markup original. O que muda é o CONTEÚDO:
 *   data.json (tarefas fictícias) → `UnitComplianceRow[]` real do Tieck
 *   colunas target/limit/reviewer → métricas reais por unidade
 *
 * Preservado do painel atual: ordenação por severidade (regra real de
 * `lib/operational-status`), clique na linha/teclado → drill-down da unidade,
 * colunas completas (nenhuma removida) e RBAC herdado da rota.
 *
 * NÃO transplantados nesta etapa (com motivo):
 *   • drag handle (`@dnd-kit`) — reordenar unidade não tem semântica real e a
 *     ordem vem da regra de severidade; continua apenas na bancada.
 *   • "Add Section" — não existe equivalente no Tieck.
 *   • drawer de detalhe da linha (TableCellViewer) — o drill-down real é a
 *     rota `/unidades/$unitId/operacao`, que a linha já abre.
 *   • inputs Target/Limit e Select Reviewer — não existem como edição real.
 *
 * As tabs filtram LOCALMENTE o mesmo dataset (nenhuma consulta nova):
 *   Visão geral · Atenção · Falhas críticas · Atrasos
 * =========================================================================
 */

import * as React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  CircleCheckBig,
  Columns2,
  Loader,
  OctagonAlert,
  TriangleAlert,
} from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from "../kit/lib/mini-table";

import type { UnitComplianceRow } from "@/hooks/useUnitCompliance";
import { STATUS_META, getOperationalStatus, type OperationalStatus } from "@/lib/operational-status";
import { Badge } from "../kit/ui/badge";
import { Button } from "../kit/ui/button";
import { Checkbox } from "../kit/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../kit/ui/dropdown-menu";
import { Label } from "../kit/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../kit/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../kit/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../kit/ui/tabs";

type UnitRow = UnitComplianceRow;

type SortKey =
  | "unitName"
  | "operacao"
  | "planejamento"
  | "programadas"
  | "vencidas"
  | "concluidas"
  | "noPrazo"
  | "comAtraso"
  | "abertas"
  | "falhas"
  | "evidencias";

const COLUMN_LABELS: Record<string, string> = {
  unidade: "Unidade",
  status: "Status",
  operacao: "Operação agora",
  planejamento: "Planejamento",
  programadas: "Programadas",
  vencidas: "Vencidas",
  concluidas: "Concluídas",
  noPrazo: "No prazo",
  comAtraso: "Com atraso",
  abertas: "Abertas em atraso",
  falhas: "Falhas críticas",
  evidencias: "Evidências",
};

type ViewKey = "visao" | "atencao" | "falhas" | "atrasos";

const VIEWS: { key: ViewKey; label: string; matches: (row: UnitRow, status: OperationalStatus) => boolean }[] = [
  { key: "visao", label: "Visão geral", matches: () => true },
  {
    key: "atencao",
    label: "Atenção",
    matches: (_row, status) => status === "atencao" || status === "critico",
  },
  { key: "falhas", label: "Falhas críticas", matches: (row) => row.criticalFailures > 0 },
  { key: "atrasos", label: "Atrasos", matches: (row) => row.overdueOpenTasks > 0 },
];

function statusOf(row: UnitRow): OperationalStatus {
  return getOperationalStatus({
    dueCompliancePercentage: row.dueCompliancePercentage,
    dueWeightTotal: row.dueWeightTotal,
    criticalFailures: row.criticalFailures,
    overdueOpenTasks: row.overdueOpenTasks,
    completedLate: row.completedLate,
  });
}

function percent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

/** Marcador de ordenação do header — micro-ação sem alterar a densidade. */
function SortHeader({
  label,
  sortKey,
  sort,
  onToggle,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  onToggle: (key: SortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const Icon = sort?.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      {active && <Icon className="h-3 w-3" />}
    </button>
  );
}

function StatusCell({ status }: { status: OperationalStatus }) {
  const label = STATUS_META[status].label;
  return (
    <Badge variant="outline" className="text-muted-foreground px-1.5">
      {status === "padrao" ? (
        <CircleCheckBig className="text-green-500 dark:text-green-400" />
      ) : status === "atencao" ? (
        <TriangleAlert className="text-amber-500 dark:text-amber-400" />
      ) : status === "critico" ? (
        <OctagonAlert className="text-rose-500 dark:text-rose-400" />
      ) : (
        <Loader />
      )}
      {label}
    </Badge>
  );
}

export function RealUnitDataTable({
  rows,
  loading,
  onRowClick,
  className,
}: {
  rows: UnitRow[];
  loading: boolean;
  onRowClick: (row: UnitRow) => void;
  /** Classe extra no contêiner (ex.: microinteração de hover do preview). */
  className?: string;
}) {
  const [view, setView] = React.useState<ViewKey>("visao");
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({});
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 });

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current && current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "desc" },
    );
  };

  const sorted = React.useMemo(() => {
    const copy = [...rows];
    if (!sort) {
      // Ordem real do painel: críticas → atenção → padrão → sem base.
      copy.sort(
        (a, b) => STATUS_META[statusOf(a)].order - STATUS_META[statusOf(b)].order,
      );
      return copy;
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    const pick = (row: UnitRow): string | number => {
      switch (sort.key) {
        case "unitName":
          return row.unitName.toLowerCase();
        case "operacao":
          return row.dueCompliancePercentage ?? -1;
        case "planejamento":
          return row.compliancePercentage ?? -1;
        case "programadas":
          return row.totalScheduledTasks;
        case "vencidas":
          return row.totalDueTasks;
        case "concluidas":
          return row.completedTasks;
        case "noPrazo":
          return row.completedOnTime;
        case "comAtraso":
          return row.completedLate;
        case "abertas":
          return row.overdueOpenTasks;
        case "falhas":
          return row.criticalFailures;
        case "evidencias":
          return row.pendingEvidences;
        default:
          return 0;
      }
    };
    copy.sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
    return copy;
  }, [rows, sort]);

  const byView = React.useMemo(() => {
    const map = {} as Record<ViewKey, UnitRow[]>;
    for (const definition of VIEWS) {
      map[definition.key] = sorted.filter((row) => definition.matches(row, statusOf(row)));
    }
    return map;
  }, [sorted]);

  const columns = React.useMemo<ColumnDef<UnitRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
              aria-label="Selecionar todas"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(value) => row.toggleSelected(!!value)}
              aria-label="Selecionar linha"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "unidade",
        accessorFn: (row) => row.unitName,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.unidade}
            sortKey="unitName"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => (
          <Button
            variant="link"
            className="text-foreground w-fit px-0 text-left"
            onClick={() => onRowClick(row.original)}
          >
            {row.original.unitName}
          </Button>
        ),
        enableHiding: false,
      },
      {
        id: "status",
        accessorFn: (row) => STATUS_META[statusOf(row)].label,
        header: COLUMN_LABELS.status,
        cell: ({ row }) => <StatusCell status={statusOf(row.original)} />,
      },
      {
        id: "operacao",
        accessorFn: (row) => row.dueCompliancePercentage ?? -1,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.operacao}
            sortKey="operacao"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{percent(row.original.dueCompliancePercentage)}</span>
        ),
      },
      {
        id: "planejamento",
        accessorFn: (row) => row.compliancePercentage ?? -1,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.planejamento}
            sortKey="planejamento"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => (
          <span className="tabular-nums">{percent(row.original.compliancePercentage)}</span>
        ),
      },
      {
        id: "programadas",
        accessorFn: (row) => row.totalScheduledTasks,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.programadas}
            sortKey="programadas"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.totalScheduledTasks}</span>,
      },
      {
        id: "vencidas",
        accessorFn: (row) => row.totalDueTasks,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.vencidas}
            sortKey="vencidas"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.totalDueTasks}</span>,
      },
      {
        id: "concluidas",
        accessorFn: (row) => row.completedTasks,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.concluidas}
            sortKey="concluidas"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.completedTasks}</span>,
      },
      {
        id: "noPrazo",
        accessorFn: (row) => row.completedOnTime,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.noPrazo}
            sortKey="noPrazo"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.completedOnTime}</span>,
      },
      {
        id: "comAtraso",
        accessorFn: (row) => row.completedLate,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.comAtraso}
            sortKey="comAtraso"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.completedLate}</span>,
      },
      {
        id: "abertas",
        accessorFn: (row) => row.overdueOpenTasks,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.abertas}
            sortKey="abertas"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.overdueOpenTasks}</span>,
      },
      {
        id: "falhas",
        accessorFn: (row) => row.criticalFailures,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.falhas}
            sortKey="falhas"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.criticalFailures}</span>,
      },
      {
        id: "evidencias",
        accessorFn: (row) => row.pendingEvidences,
        header: () => (
          <SortHeader
            label={COLUMN_LABELS.evidencias}
            sortKey="evidencias"
            sort={sort}
            onToggle={toggleSort}
          />
        ),
        cell: ({ row }) => <span className="tabular-nums">{row.original.pendingEvidences}</span>,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sort, onRowClick],
  );

  const table = useReactTable<UnitRow>({
    data: byView[view],
    columns,
    state: { columnVisibility, rowSelection, pagination },
    getRowId: (row) => row.unitId,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
  });

  const changeView = (next: string) => {
    setView(next as ViewKey);
    // Trocar de visão muda o conjunto: voltar para a primeira página.
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  const emptyLabel = loading ? "Carregando unidades…" : "Sem unidades no período.";

  return (
    <div className={["flex flex-col gap-4", className].filter(Boolean).join(" ")}>
      <h3 className="text-sm font-semibold tracking-tight px-4 lg:px-6">
        Desempenho por unidade
      </h3>
      <Tabs value={view} onValueChange={changeView} className="w-full flex-col justify-start gap-6">
        <div className="flex items-center justify-between px-4 lg:px-6 flex-wrap gap-3">
          <Label htmlFor="view-selector" className="sr-only">
            Visão
          </Label>
          <Select value={view} onValueChange={changeView}>
            <SelectTrigger
              className="flex w-fit sm:hidden cursor-pointer"
              size="sm"
              id="view-selector"
            >
              <SelectValue placeholder="Selecionar visão" />
            </SelectTrigger>
            <SelectContent>
              {VIEWS.map((definition) => (
                <SelectItem key={definition.key} value={definition.key}>
                  {definition.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <TabsList className="**:data-[slot=badge]:bg-muted-foreground/30 hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1 sm:flex">
            {VIEWS.map((definition) => (
              <TabsTrigger
                key={definition.key}
                value={definition.key}
                className="cursor-pointer"
              >
                {definition.label}{" "}
                <Badge variant="secondary">{byView[definition.key].length}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="cursor-pointer">
                  <Columns2 />
                  <span className="hidden lg:inline">Customizar colunas</span>
                  <span className="lg:hidden">Colunas</span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {table
                  .getAllColumns()
                  .filter(
                    (column) =>
                      typeof column.accessorFn !== "undefined" && column.getCanHide(),
                  )
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {COLUMN_LABELS[column.id] ?? column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <TabsContent value={view} className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className="cursor-pointer"
                      onClick={() => onRowClick(row.original)}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      {emptyLabel}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between px-4">
            <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
              {table.getFilteredSelectedRowModel().rows.length} de{" "}
              {table.getFilteredRowModel().rows.length} linha(s) selecionada(s).
            </div>
            <div className="flex w-full items-center gap-8 lg:w-fit">
              <div className="hidden items-center gap-2 lg:flex">
                <Label htmlFor="rows-per-page" className="text-sm font-medium">
                  Linhas por página
                </Label>
                <Select
                  value={`${table.getState().pagination.pageSize}`}
                  onValueChange={(value) => table.setPageSize(Number(value))}
                >
                  <SelectTrigger size="sm" className="w-20 cursor-pointer" id="rows-per-page">
                    <SelectValue placeholder={table.getState().pagination.pageSize} />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-fit items-center justify-center text-sm font-medium">
                Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
              </div>
              <div className="ml-auto flex items-center gap-2 lg:ml-0">
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 lg:flex cursor-pointer"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">Ir para a primeira página</span>
                  <ChevronsLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8 cursor-pointer"
                  size="icon"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">Página anterior</span>
                  <ChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8 cursor-pointer"
                  size="icon"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Próxima página</span>
                  <ChevronRight />
                </Button>
                <Button
                  variant="outline"
                  className="hidden size-8 lg:flex cursor-pointer"
                  size="icon"
                  onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Ir para a última página</span>
                  <ChevronsRight />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
