import { useMemo, useState } from "react";
import { Badge } from "@/components/tremor/ui/Badge";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { UnitComplianceRow } from "@/hooks/useUnitCompliance";
import { getOperationalStatus, STATUS_META } from "@/lib/operational-status";

type SortKey = "unitName" | "dueCompliance" | "planned" | "overdueOpen" | "critical" | "pendingEv";

interface Props {
  rows: UnitComplianceRow[];
  loading?: boolean;
  onRowClick?: (row: UnitComplianceRow) => void;
}

function pctLabel(v: number | null | undefined, dueTotal: number): string {
  if (v === null || v === undefined) {
    return dueTotal > 0 ? "—" : "Sem atividade";
  }
  return `${v.toFixed(1)}%`;
}

export function UnitPerformanceTable({ rows, loading, onRowClick }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);

  const enriched = useMemo(
    () =>
      rows.map((r) => ({
        row: r,
        status: getOperationalStatus({
          dueCompliancePercentage: r.dueCompliancePercentage,
          dueWeightTotal: r.dueWeightTotal,
          criticalFailures: r.criticalFailures,
          overdueOpenTasks: r.overdueOpenTasks,
          completedLate: r.completedLate,
        }),
      })),
    [rows],
  );

  const sorted = useMemo(() => {
    const copy = [...enriched];
    if (!sort) {
      copy.sort((a, b) => {
        const so = STATUS_META[a.status].order - STATUS_META[b.status].order;
        if (so !== 0) return so;
        return (a.row.dueCompliancePercentage ?? 101) - (b.row.dueCompliancePercentage ?? 101);
      });
      return copy;
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const av = pickSort(a.row, sort.key);
      const bv = pickSort(b.row, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return copy;
  }, [enriched, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) =>
      !s || s.key !== key ? { key, dir: "desc" } : s.dir === "desc" ? { key, dir: "asc" } : null,
    );
  }

  return (
    <div className="overflow-x-auto" role="region" aria-label="Desempenho por unidade">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
            <Th onClick={() => toggleSort("unitName")} sort={sort} k="unitName">
              Unidade
            </Th>
            <Th
              align="right"
              onClick={() => toggleSort("dueCompliance")}
              sort={sort}
              k="dueCompliance"
            >
              Operação agora
            </Th>
            <Th align="right" onClick={() => toggleSort("planned")} sort={sort} k="planned">
              Planejamento
            </Th>
            <th className="px-3 py-2 font-medium text-right">Programadas</th>
            <th className="px-3 py-2 font-medium text-right">Vencidas</th>
            <th className="px-3 py-2 font-medium text-right">Concluídas</th>
            <th className="px-3 py-2 font-medium text-right">No prazo</th>
            <th className="px-3 py-2 font-medium text-right">Com atraso</th>
            <Th align="right" onClick={() => toggleSort("overdueOpen")} sort={sort} k="overdueOpen">
              Abertas em atraso
            </Th>
            <Th align="right" onClick={() => toggleSort("critical")} sort={sort} k="critical">
              Falhas críticas
            </Th>
            <Th align="right" onClick={() => toggleSort("pendingEv")} sort={sort} k="pendingEv">
              Evidências
            </Th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 && (
            <tr>
              <td colSpan={12} className="px-6 py-8 text-center text-neutral-400">
                Carregando…
              </td>
            </tr>
          )}
          {!loading && sorted.length === 0 && (
            <tr>
              <td colSpan={12} className="px-6 py-8 text-center text-neutral-500">
                Nenhuma unidade com dados no período selecionado.
              </td>
            </tr>
          )}
          {sorted.map(({ row, status }) => {
            const meta = STATUS_META[status];
            return (
              <tr
                key={row.unitId}
                tabIndex={onRowClick ? 0 : -1}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && onRowClick) {
                    e.preventDefault();
                    onRowClick(row);
                  }
                }}
                className={`border-b border-neutral-100 last:border-0 ${
                  onRowClick
                    ? "cursor-pointer hover:bg-neutral-50 focus:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-[#FF007F]/40"
                    : ""
                }`}
              >
                <td className="px-3 py-2 font-medium text-neutral-800">{row.unitName}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {pctLabel(row.dueCompliancePercentage, row.dueWeightTotal)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {row.weightTotal > 0 ? `${row.compliancePercentage.toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{row.totalScheduledTasks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.totalDueTasks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.completedTasks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.completedOnTime}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.completedLate}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.overdueOpenTasks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.criticalFailures}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.pendingEvidences}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`inline-block h-2 w-2 rounded-full ${meta.dot}`}
                    />
                    <Badge variant={meta.tone}>{meta.label}</Badge>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function pickSort(r: UnitComplianceRow, k: SortKey): number | string | null {
  switch (k) {
    case "unitName":
      return r.unitName;
    case "dueCompliance":
      return r.dueCompliancePercentage;
    case "planned":
      return r.weightTotal > 0 ? r.compliancePercentage : null;
    case "overdueOpen":
      return r.overdueOpenTasks;
    case "critical":
      return r.criticalFailures;
    case "pendingEv":
      return r.pendingEvidences;
  }
}

function Th({
  children,
  onClick,
  sort,
  k,
  align,
}: {
  children: React.ReactNode;
  onClick: () => void;
  sort: { key: SortKey; dir: "asc" | "desc" } | null;
  k: SortKey;
  align?: "right";
}) {
  const active = sort?.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th
      scope="col"
      className={`px-3 py-2 font-medium ${align === "right" ? "text-right" : ""}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-neutral-800 ${
          align === "right" ? "flex-row-reverse" : ""
        }`}
      >
        {children}
        <Icon className="h-3 w-3 opacity-60" aria-hidden="true" />
      </button>
    </th>
  );
}
