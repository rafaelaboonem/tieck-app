/**
 * Execution 5E.0A — gate for the automatic "Configurações → Compartilhar"
 * opening after a save on the post-6A base.
 *
 * Fail-closed rule: the share panel opens ONLY when the current call was an
 * EXPLICIT publish (`isPublishedOverride === true`) AND the backend confirmed
 * the checklist finished published (`serverPublished === true`) AND the call
 * was not a silent autosave.
 *
 * A plain save of an already-published checklist (settings, emails, layout,
 * autosave) keeps `serverPublished === true` but must NOT open share.
 */
export function shouldOpenShareAfterSave({
  isPublishedOverride,
  serverPublished,
  silent,
}: {
  isPublishedOverride?: boolean;
  serverPublished: boolean;
  silent?: boolean;
}): boolean {
  return (
    isPublishedOverride === true &&
    serverPublished === true &&
    silent !== true
  );
}
