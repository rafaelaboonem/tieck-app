import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/dashboard/kit/ui/select";
import {
  HOME_CHECKLIST_FILTERS,
  type HomeChecklistFilterId,
} from "@/lib/home-checklist-filter";

/**
 * Home 6B.2L — filtro compacto da seção "Checklists".
 *
 * Usa o Select já existente do design system (kit/shadcn/Radix) — nenhuma lib
 * nova. Componente CONTROLADO e de apresentação: quem decide o valor e aplica
 * o filtro é a rota (estado local, client-side).
 */
export function HomeChecklistFilter({
  value,
  onChange,
}: {
  value: HomeChecklistFilterId;
  onChange: (value: HomeChecklistFilterId) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as HomeChecklistFilterId)}
    >
      <SelectTrigger
        size="sm"
        data-testid="home-checklist-filter"
        aria-label="Filtrar checklists"
        // Largura compacta, mas ainda suficiente para o rótulo mais longo
        // ("Não publicados") sem cortar texto.
        className="h-8 w-[136px] border-neutral-200 bg-white text-xs font-medium text-neutral-700 shadow-none"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="text-xs">
        {HOME_CHECKLIST_FILTERS.map((filter) => (
          <SelectItem key={filter.id} value={filter.id} className="text-xs">
            {filter.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
