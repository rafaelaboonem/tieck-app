import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EditorTopbarOverflowAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}

/**
 * Editor Mobile 5D.1.1 — overflow menu for secondary topbar actions.
 *
 * On small viewports the topbar keeps only the priority actions (Preview,
 * Publicar) directly visible; the rest live here so every action stays
 * reachable in 320–430px without overflowing the viewport.
 *
 * - opens on trigger tap;
 * - closes on selecting an action (and then runs its handler);
 * - closes on tapping the overlay outside.
 */
export function EditorTopbarOverflowMenu({
  actions,
  triggerClassName,
}: {
  actions: EditorTopbarOverflowAction[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Mais ações"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "hover:text-neutral-900 flex items-center justify-center",
          triggerClassName ?? ""
        )}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[190]"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-[200] w-52 max-w-[calc(100vw-2rem)] bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 py-1.5 animate-in fade-in zoom-in-95 duration-200"
          >
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  action.onClick();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
              >
                {action.icon}
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}