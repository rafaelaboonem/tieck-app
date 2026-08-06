import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ChecklistSeo = {
  found: boolean;
  isPro: boolean;
  showBranding: boolean;
  title: string;
  description: string;
  ogImage: string | null;
  favicon: string | null;
};

const DEFAULT_TITLE = "Checklist — Tieck";
const DEFAULT_DESCRIPTION = "Preencha este checklist criado na Tieck.";

export const getChecklistSeo = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ id: z.string().min(1) }).parse(data))
  .handler(async ({ data }): Promise<ChecklistSeo> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id } = data;

    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

    let { data: checklist } = await supabaseAdmin
      .from("checklists")
      .select("id, title, published_content, is_published, settings, user_id")
      .eq("is_published", true)
      .eq(isUuid ? "id" : "custom_slug", id)
      .maybeSingle();

    if (!checklist && !isUuid && id.length === 6) {
      const { data: all } = await supabaseAdmin
        .from("checklists")
        .select("id, title, published_content, is_published, settings, user_id")
        .eq("is_published", true);
      checklist = (all || []).find((c: any) => c.id.startsWith(id)) || null;
    }

    if (!checklist) {
      return {
        found: false,
        isPro: false,
        showBranding: true,
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        ogImage: null,
        favicon: null,
      };
    }

    const published = (checklist as any).published_content || {};
    const effectiveTitle = published.title || (checklist as any).title;
    const mergedSettings = {
      ...((checklist as any).settings || {}),
      ...(published.settings || {}),
    };

    let isPro = false;
    if ((checklist as any).user_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("plan_type")
        .eq("id", (checklist as any).user_id)
        .maybeSingle();
      isPro = (profile as any)?.plan_type === "pro";
    }

    // Branding toggle only takes effect for Pro authors; free plan always shows it.
    const brandingPref = mergedSettings.checklistBranding;
    const showBranding = isPro ? brandingPref !== false : true;

    return {
      found: true,
      isPro,
      showBranding,
      title: effectiveTitle || DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      ogImage: "/og-image.webp",
      favicon: "/favicon.png",
    };
  });