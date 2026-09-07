/**
 * Execution 5E.0 — quick actions shown discreetly on checklist cards
 * (hover/focus, desktop).
 *
 * Published cards: Editar, Copiar link, Envios.
 * Draft cards: Editar, Publicar — never a public "Copiar link" as if
 * published. The existing "..." menu stays untouched and handles the rest.
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

  return (
    <div role="group" aria-label="Ações rápidas" className="flex items-center gap-0.5">
      <button type="button" className={actionClass} onClick={onEdit}>
        Editar
      </button>
      {isPublished ? (
        <>
          <button type="button" className={actionClass} onClick={onCopyLink}>
            Copiar link
          </button>
          <button type="button" className={actionClass} onClick={onOpenSubmissions}>
            Envios
          </button>
        </>
      ) : (
        <button type="button" className={actionClass} onClick={onPublish}>
          Publicar
        </button>
      )}
    </div>
  );
}