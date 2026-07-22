-- Auto-generated. Owner-only access model.
-- No workspace_members / is_workspace_member: authenticated access is validated
-- exclusively via workspaces.owner_id = auth.uid().
-- Public share links load via public.get_public_checklist(text) RPC (SECURITY
-- DEFINER). Public submissions use public.submit_public_response(text, jsonb)
-- (SECURITY DEFINER). Anonymous role never has direct SELECT/INSERT on
-- checklist tables or evidence storage.

-- Enable RLS on every user-facing table -----------------------------
ALTER TABLE public.checklist_analytics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_evidence_analyses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_evidences            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_relations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_responses            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklists                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_log                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_ai_analyses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidences                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_rate_limits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_otp_codes               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_otps                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_updates                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_executions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_domains                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_curated_images          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vision_datasets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_card_meta            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_categories           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_tasks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces                     ENABLE ROW LEVEL SECURITY;

-- WORKSPACES (owner-only) -------------------------------------------
CREATE POLICY ws_owner_all ON public.workspaces
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Workspace-scoped tables (owner-only via workspaces.owner_id) ------
CREATE POLICY units_owner_all ON public.units
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = units.workspace_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = units.workspace_id AND w.owner_id = auth.uid()));
CREATE POLICY shifts_owner_all ON public.shifts
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = shifts.workspace_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = shifts.workspace_id AND w.owner_id = auth.uid()));
CREATE POLICY wcat_owner_all ON public.workspace_categories
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_categories.workspace_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_categories.workspace_id AND w.owner_id = auth.uid()));
CREATE POLICY wtasks_owner_all ON public.workspace_tasks
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_tasks.workspace_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_tasks.workspace_id AND w.owner_id = auth.uid()));
CREATE POLICY wcard_owner_all ON public.workspace_card_meta
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_card_meta.workspace_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = workspace_card_meta.workspace_id AND w.owner_id = auth.uid()));

-- CHECKLISTS: authenticated owners only. No anon SELECT. Public share
-- link fetches go through public.get_public_checklist() (SECURITY DEFINER).
CREATE POLICY checklists_owner_all ON public.checklists
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w WHERE w.id = checklists.workspace_id AND w.owner_id = auth.uid()
    ))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w WHERE w.id = checklists.workspace_id AND w.owner_id = auth.uid()
    ))
  );

-- CHECKLIST_RESPONSES: authenticated owner reads via checklist ownership.
-- Public writes only through submit_public_response (SECURITY DEFINER).
CREATE POLICY responses_owner_all ON public.checklist_responses
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_responses.checklist_id
       AND (c.user_id = auth.uid()
            OR (c.workspace_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
            )))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_responses.checklist_id
       AND (c.user_id = auth.uid()
            OR (c.workspace_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
            )))
  ));

-- CHECKLIST_EVIDENCES: owner read/write via checklist ownership.
-- Public uploads only through upload-public-evidence edge function
-- (service-role, validates upload_token from submit_public_response).
CREATE POLICY cev_owner_all ON public.checklist_evidences
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_evidences.checklist_id
       AND (c.user_id = auth.uid()
            OR (c.workspace_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
            )))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_evidences.checklist_id
       AND (c.user_id = auth.uid()
            OR (c.workspace_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
            )))
  ));

-- CHECKLIST_EVIDENCE_ANALYSES: owner-only.
CREATE POLICY cea_owner_all ON public.checklist_evidence_analyses
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_evidence_analyses.checklist_id
       AND (c.user_id = auth.uid()
            OR (c.workspace_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
            )))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_evidence_analyses.checklist_id
       AND (c.user_id = auth.uid()
            OR (c.workspace_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
            )))
  ));

-- CHECKLIST_MEMBERS / RELATIONS / TEMPLATES -------------------------
CREATE POLICY cmem_owner_all ON public.checklist_members
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_members.checklist_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_members.checklist_id AND c.user_id = auth.uid()));
CREATE POLICY crel_owner_all ON public.checklist_relations
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_relations.checklist_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_relations.checklist_id AND c.user_id = auth.uid()));
CREATE POLICY ctpl_owner_all ON public.checklist_templates
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- CHECKLIST_ANALYTICS: owner-only read; anonymous visitor tracking is
-- accepted only via targeted INSERT/UPDATE on published checklists.
CREATE POLICY canalytics_owner_read ON public.checklist_analytics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.checklists c
     WHERE c.id = checklist_analytics.checklist_id
       AND (c.user_id = auth.uid()
            OR (c.workspace_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM public.workspaces w WHERE w.id = c.workspace_id AND w.owner_id = auth.uid()
            )))
  ));
CREATE POLICY canalytics_public_write ON public.checklist_analytics
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.is_published = true));
CREATE POLICY canalytics_public_update ON public.checklist_analytics
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.is_published = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklists c WHERE c.id = checklist_id AND c.is_published = true));

-- TASKS / TASK_EXECUTIONS / EVIDENCES (unit-scoped, owner-only) -----
CREATE POLICY tasks_ws_all ON public.tasks
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = tasks.unit_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = tasks.unit_id AND w.owner_id = auth.uid()));
CREATE POLICY exec_ws_all ON public.task_executions
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = task_executions.unit_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = task_executions.unit_id AND w.owner_id = auth.uid()));
CREATE POLICY evidences_ws_all ON public.evidences
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = evidences.unit_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = evidences.unit_id AND w.owner_id = auth.uid()));
CREATE POLICY ev_ai_ws_all ON public.evidence_ai_analyses
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = evidence_ai_analyses.unit_id AND w.owner_id = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.units u JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE u.id = evidence_ai_analyses.unit_id AND w.owner_id = auth.uid()));
CREATE POLICY ev_reviews_ws_all ON public.evidence_reviews
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.evidences e
      JOIN public.units u ON u.id = e.unit_id
      JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE e.id = evidence_reviews.evidence_id AND w.owner_id = auth.uid()))
  WITH CHECK (reviewer_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.evidences e
      JOIN public.units u ON u.id = e.unit_id
      JOIN public.workspaces w ON w.id = u.workspace_id
     WHERE e.id = evidence_reviews.evidence_id AND w.owner_id = auth.uid()));

-- PROFILES / USER_DOMAINS -------------------------------------------
CREATE POLICY profiles_self_read ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_self_write ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY user_domains_self_all ON public.user_domains
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- SIGNUP OTP / RATE LIMITS / CLEANUP LOG (service-role only) --------

-- VISION DATASETS (manual reference library) -------------------------
CREATE POLICY vd_authenticated_read ON public.vision_datasets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY vd_owner_write ON public.vision_datasets
  FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
CREATE POLICY vci_authenticated_read ON public.vision_curated_images
  FOR SELECT TO authenticated USING (true);
CREATE POLICY vci_owner_write ON public.vision_curated_images
  FOR ALL TO authenticated
  USING (reviewed_by = auth.uid())
  WITH CHECK (reviewed_by = auth.uid());

-- SYSTEM_UPDATES ----------------------------------------------------
CREATE POLICY sysup_public_read ON public.system_updates
  FOR SELECT TO authenticated USING (true);
