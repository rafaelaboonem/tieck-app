import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface AssignmentDeadlinePopoverProps {
  dueAt: string | null;
  onUpdate: (dueAt: string | null) => void;
  disabled?: boolean;
}

export function AssignmentDeadlinePopover({
  dueAt,
  onUpdate,
  disabled
}: AssignmentDeadlinePopoverProps) {
  const [date, setDate] = React.useState<string>(dueAt ? dueAt.split('T')[0] : "");
  const [time, setTime] = React.useState<string>(dueAt ? dueAt.split('T')[1]?.slice(0, 5) : "23:59");

  const handleSave = () => {
    if (!date) {
      onUpdate(null);
      return;
    }
    const isoString = new Date(`${date}T${time}:00`).toISOString();
    onUpdate(isoString);
  };

  const handleClear = () => {
    onUpdate(null);
  };

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 text-[10px] font-medium border border-dashed hover:bg-neutral-50",
            dueAt ? "text-neutral-800 border-neutral-300" : "text-neutral-400 border-neutral-200"
          )}
        >
          <CalendarIcon className="w-3 h-3 mr-1" />
          {dueAt ? format(new Date(dueAt), "dd/MM 'às' HH:mm", { locale: ptBR }) : "Definir prazo"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 rounded-xl shadow-xl border-neutral-100" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Data limite</label>
            <Input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Horário limite</label>
            <div className="relative">
              <Input 
                type="time" 
                value={time} 
                onChange={(e) => setTime(e.target.value)}
                className="h-9 text-xs pl-8"
              />
              <Clock className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} className="flex-1 h-9 text-xs font-bold rounded-lg bg-pink-500 hover:bg-pink-600 text-white">
              Salvar
            </Button>
            {dueAt && (
              <Button onClick={handleClear} variant="ghost" className="w-9 h-9 p-0 rounded-lg text-red-500 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
