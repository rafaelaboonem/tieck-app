import { useState } from "react";
import { Calendar as CalendarIcon, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAccessibleUnits } from "@/hooks/useAccessibleUnits";
import {
  defaultFilters,
  detectPreset,
  presetToRange,
  type DashboardFilters,
  type PeriodPreset,
} from "@/lib/dashboard-filters";

export { defaultFilters, type DashboardFilters, type PeriodPreset };
export { sanitizeFilters } from "@/lib/dashboard-filters";

interface Props {
  value: DashboardFilters;
  onChange: (next: DashboardFilters) => void;
}

export function OperationalDashboardFilters({ value, onChange }: Props) {
  const preset = detectPreset(value);
  const { units, loading } = useAccessibleUnits(false);
  const [openStart, setOpenStart] = useState(false);
  const [openEnd, setOpenEnd] = useState(false);

  function handlePreset(p: PeriodPreset) {
    const r = presetToRange(p);
    if (r) onChange({ ...value, ...r });
    else onChange({ ...value });
  }

  function setStart(d: Date | undefined) {
    if (!d) return;
    const iso = d.toISOString().slice(0, 10);
    const end = iso > value.endDate ? iso : value.endDate;
    onChange({ ...value, startDate: iso, endDate: end });
    setOpenStart(false);
  }
  function setEnd(d: Date | undefined) {
    if (!d) return;
    const iso = d.toISOString().slice(0, 10);
    const start = iso < value.startDate ? iso : value.startDate;
    onChange({ ...value, startDate: start, endDate: iso });
    setOpenEnd(false);
  }

  const dirty = preset !== "7d" || Boolean(value.unitId);

  return (
    <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
      <div className="flex flex-col gap-1">
        <label htmlFor="dash-period" className="text-xs font-medium text-neutral-600">
          Período
        </label>
        <Select value={preset} onValueChange={(v) => handlePreset(v as PeriodPreset)}>
          <SelectTrigger id="dash-period" className="w-[180px]" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="hoje">Hoje</SelectItem>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {preset === "custom" && (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-600">Data inicial</label>
            <Popover open={openStart} onOpenChange={setOpenStart}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-[180px] justify-start text-left font-normal")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(parseISO(value.startDate), "dd MMM yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(value.startDate)}
                  onSelect={setStart}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-600">Data final</label>
            <Popover open={openEnd} onOpenChange={setOpenEnd}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-[180px] justify-start text-left font-normal")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(parseISO(value.endDate), "dd MMM yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={parseISO(value.endDate)}
                  onSelect={setEnd}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="dash-unit" className="text-xs font-medium text-neutral-600">
          Unidade
        </label>
        <Select
          value={value.unitId ?? "__all__"}
          onValueChange={(v) => onChange({ ...value, unitId: v === "__all__" ? undefined : v })}
        >
          <SelectTrigger id="dash-unit" className="w-[220px]" aria-label="Unidade">
            <SelectValue placeholder={loading ? "Carregando…" : "Todas as unidades"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todas as unidades</SelectItem>
            {units.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {dirty && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(defaultFilters())}
          aria-label="Limpar filtros"
          className="self-end"
        >
          <X className="mr-1 h-4 w-4" /> Limpar filtros
        </Button>
      )}
    </div>
  );
}
