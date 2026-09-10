/**
 * Shared cover + profile (logo) header used by BOTH the editor preview and the
 * public checklist page, so the two surfaces render the same header visuals.
 * Extracted verbatim from the editor's ChecklistPreview.
 */
export function ChecklistCoverProfile({ blocks, settings }: { blocks: any[]; settings: any }) {
  const profileBlock = blocks.find((b) => b.type === "image" && b.variant === "profile");
  const coverBlock = blocks.find((b) => b.type === "image" && b.variant === "cover");

  return (
    <div className={`w-full ${profileBlock?.src && coverBlock?.src ? "mb-20" : "mb-10"}`}>
      <div className="relative">
        {coverBlock?.src && (
          <div className="relative w-full h-80 overflow-hidden bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
            <img
              src={coverBlock.src}
              alt="Cover"
              className="w-full h-full"
              style={{
                transform: `translate(${(coverBlock as any).position?.x || 0}px, ${(coverBlock as any).position?.y || 0}px) scale(${(coverBlock as any).position?.zoom || 1})`,
                transformOrigin: "center center",
                objectFit: "none",
                width: "auto",
                height: "auto",
              }}
            />
          </div>
        )}
        {profileBlock?.src && (
          <div className={`${coverBlock?.src ? "absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2" : "flex justify-center mb-8"} z-10`}>
            <div
              className="border-4 border-white dark:border-neutral-900 shadow-lg overflow-hidden bg-white"
              style={{
                width: settings.logoWidth,
                height: settings.logoHeight,
                borderRadius: settings.logoRadius,
              }}
            >
              <img
                src={profileBlock.src}
                alt="Profile"
                className="w-full h-full"
                style={{
                  transform: `translate(${(profileBlock as any).position?.x || 0}px, ${(profileBlock as any).position?.y || 0}px) scale(${(profileBlock as any).position?.zoom || 1})`,
                  transformOrigin: "center center",
                  objectFit: "contain",
                  backgroundColor: "#f5f5f5",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
