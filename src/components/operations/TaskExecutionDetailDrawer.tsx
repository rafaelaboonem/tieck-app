import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EvidenceThumb } from "./EvidenceThumb";
import {
  deriveTaskStatus,
  delayMinutes,
  STATUS_LABEL,
  STATUS_STYLES,
  WEIGHT_LABEL,
} from "@/lib/task-execution-status";
import type { OperationalExecution } from "@/hooks/useUnitOperationalDetails";

interface Props {
  execution: OperationalExecution | null;
  onClose: () => void;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskExecutionDetailDrawer({ execution, onClose }: Props) {
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const open = !!execution;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" side="right">
          {execution && (
            <>
              <SheetHeader>
                <SheetTitle className="text-left">{execution.taskTitle}</SheetTitle>
                <SheetDescription className="text-left">
                  {execution.taskCode ? `${execution.taskCode} · ` : ""}
                  {WEIGHT_LABEL[execution.weight]}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4 text-sm">
                <StatusPill execution={execution} />

                {execution.taskDescription && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1">
                      Padrão esperado
                    </h3>
                    <p className="text-neutral-700 whitespace-pre-line">
                      {execution.taskDescription}
                    </p>
                  </section>
                )}

                <dl className="grid grid-cols-2 gap-3">
                  <Field label="Turno" value={execution.shiftName ?? "—"} />
                  <Field label="Programado para" value={fmt(execution.scheduledAt)} />
                  <Field label="Executado em" value={fmt(execution.executedAt)} />
                  <Field
                    label="Atraso"
                    value={
                      delayMinutes(execution.scheduledAt, execution.executedAt) !== null
                        ? `${delayMinutes(execution.scheduledAt, execution.executedAt)} min`
                        : "—"
                    }
                  />
                  <Field label="Responsável" value={execution.executedByName ?? "—"} />
                  <Field label="Status DB" value={execution.status} />
                </dl>

                {execution.status === "cancelled" && (
                  <section className="rounded border border-neutral-200 bg-neutral-50 p-3">
                    <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1">
                      Cancelamento
                    </h3>
                    <p className="text-neutral-700">
                      {execution.cancellationReason ?? "sem motivo informado"}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">
                      {fmt(execution.cancelledAt)}
                    </p>
                  </section>
                )}

                {execution.notes && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-1">
                      Observações
                    </h3>
                    <p className="text-neutral-700 whitespace-pre-line">{execution.notes}</p>
                  </section>
                )}

                <section>
                  <h3 className="text-xs font-semibold uppercase text-neutral-500 mb-2">
                    Evidências ({execution.evidenceCount})
                  </h3>
                  {execution.evidences.length === 0 ? (
                    <p className="text-neutral-500 text-xs">Nenhuma evidência enviada.</p>
                  ) : (
                    <ul className="grid grid-cols-3 gap-2">
                      {execution.evidences.map((ev) => (
                        <li key={ev.id} className="space-y-1">
                          <EvidenceThumb
                            path={ev.storagePath}
                            alt={`Evidência ${ev.id}`}
                            className="w-full aspect-square"
                            onOpen={(url) => setZoomUrl(url)}
                          />
                          <p className="text-[10px] text-neutral-500 truncate">
                            {ev.status ?? "pending"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={!!zoomUrl} onOpenChange={(o) => !o && setZoomUrl(null)}>
        <DialogContent className="max-w-3xl p-2">
          {zoomUrl && (
            <img
              src={zoomUrl}
              alt="Evidência ampliada"
              className="w-full h-auto max-h-[80vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase text-neutral-500">{label}</dt>
      <dd className="text-neutral-800">{value}</dd>
    </div>
  );
}

function StatusPill({ execution }: { execution: OperationalExecution }) {
  const status = deriveTaskStatus({
    status: execution.status,
    scheduledAt: execution.scheduledAt,
    executedAt: execution.executedAt,
  });
  const styles = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border ${styles.badge}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}