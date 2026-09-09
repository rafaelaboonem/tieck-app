/**
 * Execution 5E.0B — quick actions shown discreetly on checklist cards
 * (hover/focus, desktop).
 *
 * Published cards: Editar, Copiar link, Envios.
 * Draft cards: Editar, Publicar — never a public "Copiar link" as if
 * published, never Envios on a draft. The existing "..." menu stays untouched
 * and handles the rest.
 *
 * Each button stops propagation so the card's main click (open editor) is not
 * triggered by a quick action.
 */
export function ChecklistCardQuickActions({
  isPublished,
  onEdit,
  onCopyLink,
  onOpenSubmissions,
  onPublish,
}: {
  isPublished: boolean;
  onEdit: () => void;
  onCopyLink: () => void;
  onOpenSubmissions: () => void;
  onPublish: () => void;
}) {
  const actionClass =
    "px-2 py-1 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-md transition-colors";

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role="group"
      aria-label="Ações rápidas"
      className="flex items-center gap-0.5"
      onClick={stop}
    >
      <button type="button" className={actionClass} onClick={(e) => { stop(e); onEdit(); }}>
        Editar
      </button>
      {isPublished ? (
        <>
          <button type="button" className={actionClass} onClick={(e) => { stop(e); onCopyLink(); }}>
            Copiar link
          </button>
          <button type="button" className={actionClass} onClick={(e) => { stop(e); onOpenSubmissions(); }}>
            Envios
          </button>
        </>
      ) : (
        <button type="button" className={actionClass} onClick={(e) => { stop(e); onPublish(); }}>
          Publicar
        </button>
      )}
    </div>
  );
}
