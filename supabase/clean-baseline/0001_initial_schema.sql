-- Auto-generated clean baseline. Do not edit by hand.
-- Regenerated with dependency-ordered structure and transactional wrapper.
-- Source of truth: supabase/manual-install/*.sql (excluding 00_* and 10_validation.sql).

BEGIN;

-- ==== 01_extensions.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ==== 02_enums_and_types.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Name: checklist_evidence_analysis_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.checklist_evidence_analysis_status AS ENUM (
    'pending',
    'processing',
    'normal',
    'anomalous',
    'manual_review',
    'failed'
);


--

-- Name: checklist_response_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.checklist_response_status AS ENUM (
    'in_progress',
    'submitted'
);


--

-- Name: execution_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.execution_status AS ENUM (
    'pending',
    'done',
    'late',
    'skipped',
    'cancelled'
);


--

-- Name: task_weight; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.task_weight AS ENUM (
    'comum',
    'importante',
    'critica'
);


--

-- ==== 02b_prereq_functions.sql ====
-- Functions required BEFORE table creation (used in column DEFAULTs).
-- Every other function lives in 05_functions_and_rpc.sql.

CREATE OR REPLACE FUNCTION public.generate_dataset_public_id() RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  code_len int;
  idx int;
  attempts int := 0;
BEGIN
  LOOP
    code_len := 6 + floor(random() * 3)::int;
    candidate := '';

    FOR idx IN 1..code_len LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;

    PERFORM 1
    FROM public.vision_datasets AS vd
    WHERE vd.public_id = candidate;

    IF NOT FOUND THEN
      RETURN candidate;
    END IF;

    attempts := attempts + 1;
    IF attempts > 50 THEN
      RAISE EXCEPTION 'Não foi possível gerar public_id único';
    END IF;
  END LOOP;
END;
$$;

-- ==== 03_tables.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Name: task_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    shift_id uuid,
    executed_by uuid,
    scheduled_at timestamp with time zone NOT NULL,
    executed_at timestamp with time zone,
    status public.execution_status DEFAULT 'pending'::public.execution_status NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    cancellation_reason text
);


--

-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    shift_id uuid,
    code text,
    title text NOT NULL,
    description text,
    weight public.task_weight DEFAULT 'comum'::public.task_weight NOT NULL,
    scheduled_time time without time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    active_from timestamp with time zone DEFAULT now() NOT NULL,
    ai_review_mode text DEFAULT 'automatic_with_human_fallback'::text NOT NULL,
    visual_criteria jsonb DEFAULT '[]'::jsonb NOT NULL,
    reference_path text,
    vision_provider text DEFAULT 'manual'::text NOT NULL,
    vision_analysis_enabled boolean DEFAULT false NOT NULL,
    vision_fallback_mode text DEFAULT 'manual_review'::text NOT NULL,
    CONSTRAINT tasks_ai_review_mode_check CHECK ((ai_review_mode = ANY (ARRAY['automatic'::text, 'automatic_with_human_fallback'::text, 'human_required'::text, 'disabled'::text]))),
    CONSTRAINT tasks_vision_fallback_mode_check CHECK ((vision_fallback_mode = ANY (ARRAY['none'::text, 'manual_review'::text, 'openai'::text]))),
    CONSTRAINT tasks_vision_provider_check CHECK ((vision_provider = ANY (ARRAY['openai'::text, 'manual'::text])))
);


--

-- Name: evidences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    shift_id uuid,
    task_id uuid,
    storage_path text NOT NULL,
    reference_path text,
    submitted_by uuid,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    task_execution_id uuid NOT NULL,
    CONSTRAINT evidences_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'approved'::text, 'rejected'::text, 'resubmit_requested'::text, 'manual_review'::text, 'analysis_failed'::text])))
);


--

-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    address text,
    timezone text DEFAULT 'America/Sao_Paulo'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: checklist_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_analytics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checklist_id uuid NOT NULL,
    visitor_id text NOT NULL,
    session_id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_active_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


--

-- Name: checklist_evidence_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_evidence_analyses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evidence_id uuid NOT NULL,
    checklist_id uuid NOT NULL,
    response_id uuid NOT NULL,
    block_id text NOT NULL,
    analysis_token_hash text NOT NULL,
    published_content_hash text NOT NULL,
    provider text NOT NULL,
    model_id text NOT NULL,
    model_version text,
    threshold numeric(6,4),
    status public.checklist_evidence_analysis_status DEFAULT 'pending'::public.checklist_evidence_analysis_status NOT NULL,
    anomaly_score numeric(6,4),
    confidence numeric(6,4),
    heatmap_path text,
    regions jsonb,
    inference_ms integer,
    raw_response jsonb,
    error_code text,
    error_message text,
    processing_started_at timestamp with time zone,
    processing_finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    run_number integer DEFAULT 1 NOT NULL,
    CONSTRAINT checklist_evidence_analyses_run_number_check CHECK ((run_number >= 1))
);


--

-- Name: checklist_evidences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_evidences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checklist_id uuid NOT NULL,
    response_id uuid NOT NULL,
    block_id text NOT NULL,
    storage_path text NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    previous_evidence_id uuid,
    mime_type text,
    size_bytes integer,
    uploaded boolean DEFAULT false NOT NULL,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    source text DEFAULT 'live'::text NOT NULL,
    origin_bucket text DEFAULT 'checklist-evidences'::text NOT NULL,
    sha256 text,
    original_url text,
    CONSTRAINT checklist_evidences_attempt_number_check CHECK ((attempt_number >= 1)),
    CONSTRAINT checklist_evidences_source_chk CHECK ((source = ANY (ARRAY['live'::text, 'legacy_migrated'::text, 'legacy_unmapped'::text])))
);


--

-- Name: checklist_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checklist_id uuid NOT NULL,
    user_id uuid,
    email text NOT NULL,
    role text DEFAULT 'viewer'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: checklist_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_relations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checklist_id uuid,
    related_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: checklist_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    checklist_id uuid NOT NULL,
    visitor_id text NOT NULL,
    answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    submitted_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '3 days'::interval),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    response_token_hash text NOT NULL,
    status public.checklist_response_status DEFAULT 'in_progress'::public.checklist_response_status NOT NULL,
    upload_token_hash text,
    upload_token_expires_at timestamp with time zone
);


--

-- Name: checklist_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklist_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category text,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    thumbnail_url text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--

-- Name: checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.checklists (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text,
    blocks jsonb DEFAULT '[]'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_published boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    custom_domain text,
    custom_email_domain_id uuid,
    published_content jsonb,
    workspace_id uuid,
    category text,
    view_type text,
    custom_slug text,
    unit_id uuid,
    shift_id uuid,
    target_time time without time zone,
    is_recurring boolean DEFAULT false NOT NULL
);


--

-- Name: cleanup_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cleanup_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ran_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_count integer DEFAULT 0 NOT NULL
);


--

-- Name: evidence_ai_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidence_ai_analyses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    unit_id uuid NOT NULL,
    evidence_id uuid NOT NULL,
    task_execution_id uuid NOT NULL,
    decision text NOT NULL,
    confidence numeric,
    summary text,
    image_quality jsonb DEFAULT '{}'::jsonb NOT NULL,
    criteria_results jsonb DEFAULT '[]'::jsonb NOT NULL,
    detected_problems jsonb DEFAULT '[]'::jsonb NOT NULL,
    resubmit_instructions text,
    model text,
    prompt_version text,
    processing_started_at timestamp with time zone,
    processing_finished_at timestamp with time zone,
    error_code text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    provider text DEFAULT 'openai'::text NOT NULL,
    model_id uuid,
    model_version text,
    anomaly_score numeric,
    threshold numeric,
    detected_regions jsonb DEFAULT '[]'::jsonb NOT NULL,
    anomaly_map_storage_path text,
    inference_time_ms integer,
    raw_result jsonb,
    fallback_of uuid,
    CONSTRAINT evidence_ai_analyses_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT evidence_ai_analyses_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text, 'manual_review'::text, 'analysis_failed'::text]))),
    CONSTRAINT evidence_ai_analyses_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'manual'::text])))
);


--

-- Name: evidence_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evidence_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    evidence_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    action text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT evidence_reviews_action_check CHECK ((action = ANY (ARRAY['approve'::text, 'reject'::text, 'request_resubmit'::text, 'note'::text, 'corrective_action'::text, 'nonconformity'::text])))
);


--

-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    display_name text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_admin boolean DEFAULT false,
    plan_type text DEFAULT 'free'::text,
    first_name text,
    last_name text,
    settings jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT profiles_plan_type_check CHECK ((plan_type = ANY (ARRAY['free'::text, 'pro'::text])))
);


--

-- Name: public_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.public_rate_limits (
    key_hash text NOT NULL,
    action text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    hits integer DEFAULT 0 NOT NULL
);


--

-- Name: shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: signup_otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signup_otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    code_hash text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    verification_token text,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: signup_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signup_otps (
    email text NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    verified_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_token_hash text,
    session_expires_at timestamp with time zone
);


--

-- Name: system_updates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'feature'::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);


--

-- Name: user_domains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_domains (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    domain text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    dns_verification_record text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dkim_verified boolean DEFAULT false,
    spf_verified boolean DEFAULT false,
    return_path_verified boolean DEFAULT false,
    CONSTRAINT user_domains_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'verified'::text, 'failed'::text])))
);


--

-- Name: vision_curated_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vision_curated_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dataset_id uuid NOT NULL,
    evidence_id uuid,
    classification text NOT NULL,
    source_storage_path text NOT NULL,
    curated_storage_path text,
    sha256 text,
    response_id uuid,
    checklist_id uuid,
    block_id text,
    organization_id uuid,
    unit_id uuid,
    reviewed_by uuid,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL,
    note text,
    split text,
    dataset_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checklist_evidence_id uuid,
    CONSTRAINT vision_curated_images_classification_check CHECK ((classification = ANY (ARRAY['normal'::text, 'anomalous'::text, 'ignored'::text]))),
    CONSTRAINT vision_curated_images_source_check CHECK (((evidence_id IS NOT NULL) <> (checklist_evidence_id IS NOT NULL))),
    CONSTRAINT vision_curated_images_split_check CHECK ((split = ANY (ARRAY['train'::text, 'validation'::text, 'test'::text])))
);


--

-- Name: vision_datasets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vision_datasets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    normal_instructions text,
    anomaly_instructions text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    examples text,
    min_normal_technical integer DEFAULT 5 NOT NULL,
    min_normal_recommended integer DEFAULT 20 NOT NULL,
    min_anomalous_recommended integer DEFAULT 3 NOT NULL,
    public_id text DEFAULT public.generate_dataset_public_id() NOT NULL,
    CONSTRAINT vision_datasets_public_id_format_check CHECK ((public_id ~ '^[A-Z0-9]{6,8}$'::text))
);


--

-- Name: workspace_card_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_card_meta (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    card_type text NOT NULL,
    card_id uuid NOT NULL,
    emoji text,
    priority text,
    status text,
    due_date date,
    assignee text,
    tags text[] DEFAULT '{}'::text[],
    content jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_card_meta_card_type_check CHECK ((card_type = ANY (ARRAY['checklist'::text, 'task'::text]))),
    CONSTRAINT workspace_card_meta_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])))
);


--

-- Name: workspace_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    color text DEFAULT 'slate'::text,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    icon_name text DEFAULT 'Layout'::text,
    view_type text DEFAULT 'board'::text
);


--

-- Name: workspace_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    category_id uuid,
    title text NOT NULL,
    "position" integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--

-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Meu workspace'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    owner_id uuid,
    icon text DEFAULT '📁'::text,
    icon_url text
);


--


-- GRANTS ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_analytics TO authenticated;
GRANT ALL ON public.checklist_analytics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_evidence_analyses TO authenticated;
GRANT ALL ON public.checklist_evidence_analyses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_evidences TO authenticated;
GRANT ALL ON public.checklist_evidences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_members TO authenticated;
GRANT ALL ON public.checklist_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_relations TO authenticated;
GRANT ALL ON public.checklist_relations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_responses TO authenticated;
GRANT ALL ON public.checklist_responses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cleanup_log TO authenticated;
GRANT ALL ON public.cleanup_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_ai_analyses TO authenticated;
GRANT ALL ON public.evidence_ai_analyses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_reviews TO authenticated;
GRANT ALL ON public.evidence_reviews TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidences TO authenticated;
GRANT ALL ON public.evidences TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_rate_limits TO authenticated;
GRANT ALL ON public.public_rate_limits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shifts TO authenticated;
GRANT ALL ON public.shifts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_otp_codes TO authenticated;
GRANT ALL ON public.signup_otp_codes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_otps TO authenticated;
GRANT ALL ON public.signup_otps TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_updates TO authenticated;
GRANT ALL ON public.system_updates TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_executions TO authenticated;
GRANT ALL ON public.task_executions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.units TO authenticated;
GRANT ALL ON public.units TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_domains TO authenticated;
GRANT ALL ON public.user_domains TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_datasets TO authenticated;
GRANT ALL ON public.vision_datasets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vision_curated_images TO authenticated;
GRANT ALL ON public.vision_curated_images TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_card_meta TO authenticated;
GRANT ALL ON public.workspace_card_meta TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_categories TO authenticated;
GRANT ALL ON public.workspace_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_tasks TO authenticated;
GRANT ALL ON public.workspace_tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces TO authenticated;
GRANT ALL ON public.workspaces TO service_role;

-- HARDENING: anon and PUBLIC must NOT have direct privileges on any
-- table in the public schema. Public access is only via SECURITY DEFINER
-- RPCs (get_public_checklist, submit_public_response).
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;

-- ==== 03b_views.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Name: analytics_critical_failures; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_critical_failures WITH (security_invoker='true') AS
 SELECT te.id,
    te.organization_id,
    te.unit_id,
    te.shift_id,
    te.task_id,
    t.title,
    te.scheduled_at,
    te.status
   FROM (public.task_executions te
     JOIN public.tasks t ON ((t.id = te.task_id)))
  WHERE ((t.weight = 'critica'::public.task_weight) AND (te.status <> 'done'::public.execution_status) AND ((te.scheduled_at)::date = CURRENT_DATE));


--

-- Name: analytics_daily_compliance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_daily_compliance WITH (security_invoker='true') AS
 SELECT te.organization_id,
    te.unit_id,
    te.shift_id,
    (date_trunc('day'::text, te.scheduled_at))::date AS day,
    (sum(
        CASE t.weight
            WHEN 'comum'::public.task_weight THEN 1
            WHEN 'importante'::public.task_weight THEN 2
            WHEN 'critica'::public.task_weight THEN 5
            ELSE NULL::integer
        END))::integer AS weight_total,
    (sum(
        CASE
            WHEN (te.status = 'done'::public.execution_status) THEN
            CASE t.weight
                WHEN 'comum'::public.task_weight THEN 1
                WHEN 'importante'::public.task_weight THEN 2
                WHEN 'critica'::public.task_weight THEN 5
                ELSE NULL::integer
            END
            ELSE 0
        END))::integer AS weight_done,
    round(((100.0 * (sum(
        CASE
            WHEN (te.status = 'done'::public.execution_status) THEN
            CASE t.weight
                WHEN 'comum'::public.task_weight THEN 1
                WHEN 'importante'::public.task_weight THEN 2
                WHEN 'critica'::public.task_weight THEN 5
                ELSE NULL::integer
            END
            ELSE 0
        END))::numeric) / (NULLIF(sum(
        CASE t.weight
            WHEN 'comum'::public.task_weight THEN 1
            WHEN 'importante'::public.task_weight THEN 2
            WHEN 'critica'::public.task_weight THEN 5
            ELSE NULL::integer
        END), 0))::numeric), 1) AS compliance_pct,
    count(*) FILTER (WHERE (te.status = 'late'::public.execution_status)) AS overdue_count,
    count(*) FILTER (WHERE ((t.weight = 'critica'::public.task_weight) AND (te.status <> 'done'::public.execution_status))) AS critical_missed
   FROM (public.task_executions te
     JOIN public.tasks t ON ((t.id = te.task_id)))
  GROUP BY te.organization_id, te.unit_id, te.shift_id, ((date_trunc('day'::text, te.scheduled_at))::date);


--

-- Name: analytics_overdue_tasks; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_overdue_tasks WITH (security_invoker='true') AS
 SELECT te.id,
    te.organization_id,
    te.unit_id,
    te.shift_id,
    te.task_id,
    t.title,
    t.weight,
    te.scheduled_at,
    te.status
   FROM (public.task_executions te
     JOIN public.tasks t ON ((t.id = te.task_id)))
  WHERE ((te.status = ANY (ARRAY['late'::public.execution_status, 'pending'::public.execution_status])) AND (te.scheduled_at < now()));


--

-- Name: analytics_unit_daily_compliance; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_unit_daily_compliance WITH (security_invoker='true') AS
 WITH daily AS (
         SELECT te.organization_id,
            te.unit_id,
            (date_trunc('day'::text, (te.scheduled_at AT TIME ZONE u_1.timezone)))::date AS reference_date,
            (count(*))::integer AS total_scheduled_tasks,
            (count(*) FILTER (WHERE (te.status = 'done'::public.execution_status)))::integer AS completed_tasks,
            (count(*) FILTER (WHERE ((te.status = 'done'::public.execution_status) AND (te.executed_at IS NOT NULL) AND (te.executed_at <= te.scheduled_at))))::integer AS completed_on_time,
            (count(*) FILTER (WHERE ((te.status = 'done'::public.execution_status) AND (te.executed_at IS NOT NULL) AND (te.executed_at > te.scheduled_at))))::integer AS completed_late,
            (count(*) FILTER (WHERE ((te.status = ANY (ARRAY['pending'::public.execution_status, 'late'::public.execution_status])) AND (te.scheduled_at < now()))))::integer AS overdue_open_tasks,
            ((count(*) FILTER (WHERE ((te.status = 'done'::public.execution_status) AND (te.executed_at > te.scheduled_at))) + count(*) FILTER (WHERE ((te.status = ANY (ARRAY['pending'::public.execution_status, 'late'::public.execution_status])) AND (te.scheduled_at < now())))))::integer AS delayed_tasks,
            (count(*) FILTER (WHERE ((t.weight = 'critica'::public.task_weight) AND (te.status <> ALL (ARRAY['done'::public.execution_status, 'cancelled'::public.execution_status])) AND (te.scheduled_at < now()))))::integer AS critical_failures,
            (sum(
                CASE t.weight
                    WHEN 'comum'::public.task_weight THEN 1
                    WHEN 'importante'::public.task_weight THEN 2
                    WHEN 'critica'::public.task_weight THEN 5
                    ELSE NULL::integer
                END))::integer AS weight_total,
            (sum(
                CASE
                    WHEN (te.status = 'done'::public.execution_status) THEN
                    CASE t.weight
                        WHEN 'comum'::public.task_weight THEN 1
                        WHEN 'importante'::public.task_weight THEN 2
                        WHEN 'critica'::public.task_weight THEN 5
                        ELSE NULL::integer
                    END
                    ELSE 0
                END))::integer AS weight_done,
            (sum(
                CASE
                    WHEN ((te.status = 'done'::public.execution_status) AND (te.executed_at IS NOT NULL) AND (te.executed_at <= te.scheduled_at)) THEN
                    CASE t.weight
                        WHEN 'comum'::public.task_weight THEN 1
                        WHEN 'importante'::public.task_weight THEN 2
                        WHEN 'critica'::public.task_weight THEN 5
                        ELSE NULL::integer
                    END
                    ELSE 0
                END))::integer AS weight_done_on_time,
            (count(*) FILTER (WHERE (te.scheduled_at <= now())))::integer AS total_due_tasks,
            (count(*) FILTER (WHERE ((te.scheduled_at <= now()) AND (te.status = 'done'::public.execution_status))))::integer AS due_completed_tasks,
            (COALESCE(sum(
                CASE
                    WHEN (te.scheduled_at <= now()) THEN
                    CASE t.weight
                        WHEN 'comum'::public.task_weight THEN 1
                        WHEN 'importante'::public.task_weight THEN 2
                        WHEN 'critica'::public.task_weight THEN 5
                        ELSE NULL::integer
                    END
                    ELSE 0
                END), (0)::bigint))::integer AS due_weight_total,
            (COALESCE(sum(
                CASE
                    WHEN ((te.scheduled_at <= now()) AND (te.status = 'done'::public.execution_status)) THEN
                    CASE t.weight
                        WHEN 'comum'::public.task_weight THEN 1
                        WHEN 'importante'::public.task_weight THEN 2
                        WHEN 'critica'::public.task_weight THEN 5
                        ELSE NULL::integer
                    END
                    ELSE 0
                END), (0)::bigint))::integer AS due_weight_done
           FROM ((public.task_executions te
             JOIN public.tasks t ON ((t.id = te.task_id)))
             JOIN public.units u_1 ON ((u_1.id = te.unit_id)))
          WHERE (te.status <> 'cancelled'::public.execution_status)
          GROUP BY te.organization_id, te.unit_id, ((date_trunc('day'::text, (te.scheduled_at AT TIME ZONE u_1.timezone)))::date)
        ), ev AS (
         SELECT e.organization_id,
            e.unit_id,
            (date_trunc('day'::text, (e.submitted_at AT TIME ZONE u_1.timezone)))::date AS reference_date,
            (count(*))::integer AS pending_evidence_reviews
           FROM (public.evidences e
             JOIN public.units u_1 ON ((u_1.id = e.unit_id)))
          WHERE (e.status = 'pending'::text)
          GROUP BY e.organization_id, e.unit_id, ((date_trunc('day'::text, (e.submitted_at AT TIME ZONE u_1.timezone)))::date)
        )
 SELECT d.organization_id,
    d.unit_id,
    u.name AS unit_name,
    d.reference_date,
    d.total_scheduled_tasks,
    d.completed_tasks,
    d.completed_on_time,
    d.completed_late,
    d.overdue_open_tasks,
    d.delayed_tasks,
    d.critical_failures,
    COALESCE(ev.pending_evidence_reviews, 0) AS pending_evidences,
    COALESCE(ev.pending_evidence_reviews, 0) AS pending_evidence_reviews,
    d.weight_total,
    d.weight_done,
    d.weight_done_on_time,
    round(((100.0 * (d.weight_done)::numeric) / (NULLIF(d.weight_total, 0))::numeric), 1) AS compliance_percentage,
    round(((100.0 * (d.weight_done_on_time)::numeric) / (NULLIF(d.weight_total, 0))::numeric), 1) AS on_time_compliance_percentage,
    d.total_due_tasks,
    d.due_completed_tasks,
    d.due_weight_total,
    d.due_weight_done,
    round(((100.0 * (d.due_weight_done)::numeric) / (NULLIF(d.due_weight_total, 0))::numeric), 1) AS due_compliance_percentage
   FROM ((daily d
     JOIN public.units u ON ((u.id = d.unit_id)))
     LEFT JOIN ev ON (((ev.organization_id = d.organization_id) AND (ev.unit_id = d.unit_id) AND (ev.reference_date = d.reference_date))));


--

-- Name: analytics_unit_ranking; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.analytics_unit_ranking WITH (security_invoker='true') AS
 SELECT te.organization_id,
    te.unit_id,
    u.name AS unit_name,
    round(((100.0 * (sum(
        CASE
            WHEN (te.status = 'done'::public.execution_status) THEN
            CASE t.weight
                WHEN 'comum'::public.task_weight THEN 1
                WHEN 'importante'::public.task_weight THEN 2
                WHEN 'critica'::public.task_weight THEN 5
                ELSE NULL::integer
            END
            ELSE 0
        END))::numeric) / (NULLIF(sum(
        CASE t.weight
            WHEN 'comum'::public.task_weight THEN 1
            WHEN 'importante'::public.task_weight THEN 2
            WHEN 'critica'::public.task_weight THEN 5
            ELSE NULL::integer
        END), 0))::numeric), 1) AS compliance_pct,
    count(*) FILTER (WHERE (te.status = 'late'::public.execution_status)) AS overdue_count,
    count(*) FILTER (WHERE ((t.weight = 'critica'::public.task_weight) AND (te.status <> 'done'::public.execution_status))) AS critical_missed
   FROM ((public.task_executions te
     JOIN public.tasks t ON ((t.id = te.task_id)))
     JOIN public.units u ON ((u.id = te.unit_id)))
  WHERE (te.scheduled_at > (now() - '24:00:00'::interval))
  GROUP BY te.organization_id, te.unit_id, u.name;


--

-- ==== 04_constraints_and_indexes.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Name: checklist_analytics checklist_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_analytics
    ADD CONSTRAINT checklist_analytics_pkey PRIMARY KEY (id);


--

-- Name: checklist_evidence_analyses checklist_evidence_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidence_analyses
    ADD CONSTRAINT checklist_evidence_analyses_pkey PRIMARY KEY (id);


--

-- Name: checklist_evidences checklist_evidences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidences
    ADD CONSTRAINT checklist_evidences_pkey PRIMARY KEY (id);


--

-- Name: checklist_evidences checklist_evidences_response_id_block_id_attempt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidences
    ADD CONSTRAINT checklist_evidences_response_id_block_id_attempt_number_key UNIQUE (response_id, block_id, attempt_number);


--

-- Name: checklist_evidences checklist_evidences_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidences
    ADD CONSTRAINT checklist_evidences_storage_path_key UNIQUE (storage_path);


--

-- Name: checklist_members checklist_members_checklist_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_members
    ADD CONSTRAINT checklist_members_checklist_id_email_key UNIQUE (checklist_id, email);


--

-- Name: checklist_members checklist_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_members
    ADD CONSTRAINT checklist_members_pkey PRIMARY KEY (id);


--

-- Name: checklist_relations checklist_relations_checklist_id_related_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_relations
    ADD CONSTRAINT checklist_relations_checklist_id_related_id_key UNIQUE (checklist_id, related_id);


--

-- Name: checklist_relations checklist_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_relations
    ADD CONSTRAINT checklist_relations_pkey PRIMARY KEY (id);


--

-- Name: checklist_responses checklist_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_responses
    ADD CONSTRAINT checklist_responses_pkey PRIMARY KEY (id);


--

-- Name: checklist_templates checklist_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);


--

-- Name: checklists checklists_custom_slug_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_custom_slug_unique UNIQUE (custom_slug);


--

-- Name: checklists checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_pkey PRIMARY KEY (id);


--

-- Name: cleanup_log cleanup_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cleanup_log
    ADD CONSTRAINT cleanup_log_pkey PRIMARY KEY (id);


--

-- Name: evidence_ai_analyses evidence_ai_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_ai_analyses
    ADD CONSTRAINT evidence_ai_analyses_pkey PRIMARY KEY (id);


--

-- Name: evidence_reviews evidence_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_reviews
    ADD CONSTRAINT evidence_reviews_pkey PRIMARY KEY (id);


--

-- Name: evidences evidences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidences
    ADD CONSTRAINT evidences_pkey PRIMARY KEY (id);


--

-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--

-- Name: public_rate_limits public_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.public_rate_limits
    ADD CONSTRAINT public_rate_limits_pkey PRIMARY KEY (key_hash, action, window_start);


--

-- Name: shifts shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_pkey PRIMARY KEY (id);


--

-- Name: signup_otp_codes signup_otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_otp_codes
    ADD CONSTRAINT signup_otp_codes_pkey PRIMARY KEY (id);


--

-- Name: signup_otps signup_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_otps
    ADD CONSTRAINT signup_otps_pkey PRIMARY KEY (email);


--

-- Name: system_updates system_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_updates
    ADD CONSTRAINT system_updates_pkey PRIMARY KEY (id);


--

-- Name: task_executions task_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_executions
    ADD CONSTRAINT task_executions_pkey PRIMARY KEY (id);


--

-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--

-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);


--

-- Name: user_domains user_domains_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_domains
    ADD CONSTRAINT user_domains_domain_key UNIQUE (domain);


--

-- Name: user_domains user_domains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_domains
    ADD CONSTRAINT user_domains_pkey PRIMARY KEY (id);


--

-- Name: vision_curated_images vision_curated_images_dataset_checklist_evidence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_curated_images
    ADD CONSTRAINT vision_curated_images_dataset_checklist_evidence_key UNIQUE (dataset_id, checklist_evidence_id);


--

-- Name: vision_curated_images vision_curated_images_dataset_evidence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_curated_images
    ADD CONSTRAINT vision_curated_images_dataset_evidence_key UNIQUE (dataset_id, evidence_id);


--

-- Name: vision_curated_images vision_curated_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_curated_images
    ADD CONSTRAINT vision_curated_images_pkey PRIMARY KEY (id);


--

-- Name: vision_datasets vision_datasets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_datasets
    ADD CONSTRAINT vision_datasets_pkey PRIMARY KEY (id);


--

-- Name: vision_datasets vision_datasets_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_datasets
    ADD CONSTRAINT vision_datasets_slug_key UNIQUE (slug);


--

-- Name: workspace_card_meta workspace_card_meta_card_type_card_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_card_meta
    ADD CONSTRAINT workspace_card_meta_card_type_card_id_key UNIQUE (card_type, card_id);


--

-- Name: workspace_card_meta workspace_card_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_card_meta
    ADD CONSTRAINT workspace_card_meta_pkey PRIMARY KEY (id);


--

-- Name: workspace_categories workspace_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_categories
    ADD CONSTRAINT workspace_categories_pkey PRIMARY KEY (id);


--

-- Name: workspace_tasks workspace_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_tasks
    ADD CONSTRAINT workspace_tasks_pkey PRIMARY KEY (id);


--

-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--


-- Name: checklist_analytics checklist_analytics_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_analytics
    ADD CONSTRAINT checklist_analytics_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;


--

-- Name: checklist_evidence_analyses checklist_evidence_analyses_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidence_analyses
    ADD CONSTRAINT checklist_evidence_analyses_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;


--

-- Name: checklist_evidence_analyses checklist_evidence_analyses_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidence_analyses
    ADD CONSTRAINT checklist_evidence_analyses_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.checklist_evidences(id) ON DELETE CASCADE;


--

-- Name: checklist_evidence_analyses checklist_evidence_analyses_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidence_analyses
    ADD CONSTRAINT checklist_evidence_analyses_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.checklist_responses(id) ON DELETE CASCADE;


--

-- Name: checklist_evidences checklist_evidences_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidences
    ADD CONSTRAINT checklist_evidences_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;


--

-- Name: checklist_evidences checklist_evidences_previous_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidences
    ADD CONSTRAINT checklist_evidences_previous_evidence_id_fkey FOREIGN KEY (previous_evidence_id) REFERENCES public.checklist_evidences(id) ON DELETE SET NULL;


--

-- Name: checklist_evidences checklist_evidences_response_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_evidences
    ADD CONSTRAINT checklist_evidences_response_id_fkey FOREIGN KEY (response_id) REFERENCES public.checklist_responses(id) ON DELETE CASCADE;


--

-- Name: checklist_members checklist_members_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_members
    ADD CONSTRAINT checklist_members_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;


--

-- Name: checklist_members checklist_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_members
    ADD CONSTRAINT checklist_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

-- Name: checklist_relations checklist_relations_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_relations
    ADD CONSTRAINT checklist_relations_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;


--

-- Name: checklist_relations checklist_relations_related_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_relations
    ADD CONSTRAINT checklist_relations_related_id_fkey FOREIGN KEY (related_id) REFERENCES public.checklists(id) ON DELETE CASCADE;


--

-- Name: checklist_responses checklist_responses_checklist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_responses
    ADD CONSTRAINT checklist_responses_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE;


--

-- Name: checklist_templates checklist_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklist_templates
    ADD CONSTRAINT checklist_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--

-- Name: checklists checklists_custom_email_domain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_custom_email_domain_id_fkey FOREIGN KEY (custom_email_domain_id) REFERENCES public.user_domains(id);


--

-- Name: checklists checklists_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--

-- Name: checklists checklists_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE SET NULL;


--

-- Name: checklists checklists_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

-- Name: checklists checklists_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.checklists
    ADD CONSTRAINT checklists_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--

-- Name: evidence_ai_analyses evidence_ai_analyses_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_ai_analyses
    ADD CONSTRAINT evidence_ai_analyses_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidences(id) ON DELETE CASCADE;


--

-- Name: evidence_ai_analyses evidence_ai_analyses_fallback_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_ai_analyses
    ADD CONSTRAINT evidence_ai_analyses_fallback_of_fkey FOREIGN KEY (fallback_of) REFERENCES public.evidence_ai_analyses(id) ON DELETE SET NULL;


--

-- Name: evidence_ai_analyses evidence_ai_analyses_task_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_ai_analyses
    ADD CONSTRAINT evidence_ai_analyses_task_execution_id_fkey FOREIGN KEY (task_execution_id) REFERENCES public.task_executions(id) ON DELETE CASCADE;


--

-- Name: evidence_reviews evidence_reviews_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_reviews
    ADD CONSTRAINT evidence_reviews_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidences(id) ON DELETE CASCADE;


--

-- Name: evidence_reviews evidence_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidence_reviews
    ADD CONSTRAINT evidence_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--

-- Name: evidences evidences_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidences
    ADD CONSTRAINT evidences_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--

-- Name: evidences evidences_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidences
    ADD CONSTRAINT evidences_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

-- Name: evidences evidences_task_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidences
    ADD CONSTRAINT evidences_task_execution_id_fkey FOREIGN KEY (task_execution_id) REFERENCES public.task_executions(id) ON DELETE RESTRICT;


--

-- Name: evidences evidences_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evidences
    ADD CONSTRAINT evidences_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--

-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

-- Name: shifts shifts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shifts
    ADD CONSTRAINT shifts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--

-- Name: system_updates system_updates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_updates
    ADD CONSTRAINT system_updates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--

-- Name: task_executions task_executions_executed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_executions
    ADD CONSTRAINT task_executions_executed_by_fkey FOREIGN KEY (executed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

-- Name: task_executions task_executions_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_executions
    ADD CONSTRAINT task_executions_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--

-- Name: task_executions task_executions_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_executions
    ADD CONSTRAINT task_executions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;


--

-- Name: task_executions task_executions_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_executions
    ADD CONSTRAINT task_executions_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--

-- Name: tasks tasks_shift_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.shifts(id) ON DELETE SET NULL;


--

-- Name: tasks tasks_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;


--

-- Name: units units_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--

-- Name: user_domains user_domains_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_domains
    ADD CONSTRAINT user_domains_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--

-- Name: vision_curated_images vision_curated_images_checklist_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_curated_images
    ADD CONSTRAINT vision_curated_images_checklist_evidence_id_fkey FOREIGN KEY (checklist_evidence_id) REFERENCES public.checklist_evidences(id) ON DELETE CASCADE;


--

-- Name: vision_curated_images vision_curated_images_dataset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_curated_images
    ADD CONSTRAINT vision_curated_images_dataset_id_fkey FOREIGN KEY (dataset_id) REFERENCES public.vision_datasets(id) ON DELETE CASCADE;


--

-- Name: vision_curated_images vision_curated_images_evidence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_curated_images
    ADD CONSTRAINT vision_curated_images_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.evidences(id) ON DELETE CASCADE;


--

-- Name: vision_curated_images vision_curated_images_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_curated_images
    ADD CONSTRAINT vision_curated_images_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

-- Name: vision_datasets vision_datasets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vision_datasets
    ADD CONSTRAINT vision_datasets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--

-- Name: workspace_card_meta workspace_card_meta_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_card_meta
    ADD CONSTRAINT workspace_card_meta_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--

-- Name: workspace_categories workspace_categories_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_categories
    ADD CONSTRAINT workspace_categories_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--

-- Name: workspace_tasks workspace_tasks_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_tasks
    ADD CONSTRAINT workspace_tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.workspace_categories(id) ON DELETE SET NULL;


--

-- Name: workspace_tasks workspace_tasks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_tasks
    ADD CONSTRAINT workspace_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--

-- Name: workspace_tasks workspace_tasks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_tasks
    ADD CONSTRAINT workspace_tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--

-- Name: workspaces workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id);


--


-- Name: evidence_ai_analyses_evidence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_ai_analyses_evidence_idx ON public.evidence_ai_analyses USING btree (evidence_id, created_at DESC);


--

-- Name: evidence_ai_analyses_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidence_ai_analyses_provider_idx ON public.evidence_ai_analyses USING btree (evidence_id, provider, created_at DESC);


--

-- Name: evidences_task_execution_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidences_task_execution_id_idx ON public.evidences USING btree (task_execution_id);


--

-- Name: evidences_unit_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX evidences_unit_status_idx ON public.evidences USING btree (unit_id, status, submitted_at DESC);


--

-- Name: exec_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exec_status_idx ON public.task_executions USING btree (status, scheduled_at DESC);


--

-- Name: exec_unit_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX exec_unit_scheduled_idx ON public.task_executions USING btree (unit_id, scheduled_at DESC);


--

-- Name: idx_checklist_analyses_evidence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_analyses_evidence ON public.checklist_evidence_analyses USING btree (evidence_id, created_at DESC);


--

-- Name: idx_checklist_analyses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_analyses_status ON public.checklist_evidence_analyses USING btree (status);


--

-- Name: idx_checklist_analyses_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_checklist_analyses_token_hash ON public.checklist_evidence_analyses USING btree (analysis_token_hash);


--

-- Name: idx_checklist_analytics_checklist_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_analytics_checklist_id ON public.checklist_analytics USING btree (checklist_id);


--

-- Name: idx_checklist_analytics_visitor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_analytics_visitor_id ON public.checklist_analytics USING btree (visitor_id);


--

-- Name: idx_checklist_evidences_checklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_evidences_checklist ON public.checklist_evidences USING btree (checklist_id);


--

-- Name: idx_checklist_evidences_response; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_evidences_response ON public.checklist_evidences USING btree (response_id, block_id);


--

-- Name: idx_checklist_responses_checklist; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_responses_checklist ON public.checklist_responses USING btree (checklist_id);


--

-- Name: idx_checklist_responses_checklist_submitted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_responses_checklist_submitted ON public.checklist_responses USING btree (checklist_id, submitted_at);


--

-- Name: idx_checklist_responses_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_responses_expires ON public.checklist_responses USING btree (expires_at);


--

-- Name: idx_checklist_responses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklist_responses_status ON public.checklist_responses USING btree (status);


--

-- Name: idx_checklist_responses_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_checklist_responses_token_hash ON public.checklist_responses USING btree (response_token_hash);


--

-- Name: idx_checklists_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_category ON public.checklists USING btree (category);


--

-- Name: idx_checklists_shift; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_shift ON public.checklists USING btree (shift_id);


--

-- Name: idx_checklists_unit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_unit ON public.checklists USING btree (unit_id);


--

-- Name: idx_checklists_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_checklists_workspace_id ON public.checklists USING btree (workspace_id);


--

-- Name: idx_public_rate_limits_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_public_rate_limits_window ON public.public_rate_limits USING btree (window_start);


--

-- Name: idx_shifts_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shifts_workspace ON public.shifts USING btree (workspace_id);


--

-- Name: idx_units_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_active ON public.units USING btree (workspace_id, is_active);


--

-- Name: idx_units_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_units_workspace ON public.units USING btree (workspace_id);


--

-- Name: signup_otp_codes_email_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signup_otp_codes_email_idx ON public.signup_otp_codes USING btree (email, created_at DESC);


--

-- Name: signup_otps_session_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signup_otps_session_expires_idx ON public.signup_otps USING btree (session_expires_at);


--

-- Name: task_executions_unique_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX task_executions_unique_slot ON public.task_executions USING btree (task_id, unit_id, scheduled_at);


--

-- Name: tasks_unit_shift_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tasks_unit_shift_idx ON public.tasks USING btree (unit_id, shift_id) WHERE is_active;


--

-- Name: uq_checklist_analyses_evidence_run; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_checklist_analyses_evidence_run ON public.checklist_evidence_analyses USING btree (evidence_id, run_number);


--

-- Name: uq_checklist_evidences_resp_block_path; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_checklist_evidences_resp_block_path ON public.checklist_evidences USING btree (response_id, block_id, storage_path);


--

-- Name: vision_curated_images_checklist_evidence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vision_curated_images_checklist_evidence_idx ON public.vision_curated_images USING btree (checklist_evidence_id) WHERE (checklist_evidence_id IS NOT NULL);


--

-- Name: vision_curated_images_dataset_class_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vision_curated_images_dataset_class_idx ON public.vision_curated_images USING btree (dataset_id, classification);


--

-- Name: vision_curated_images_evidence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vision_curated_images_evidence_idx ON public.vision_curated_images USING btree (evidence_id);


--

-- Name: vision_curated_images_sha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vision_curated_images_sha_idx ON public.vision_curated_images USING btree (sha256);


--

-- Name: vision_datasets_public_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vision_datasets_public_id_key ON public.vision_datasets USING btree (public_id);


--

-- ==== 05_functions_and_rpc.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Name: check_evidence_execution_consistency(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_evidence_execution_consistency() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  ex_org uuid;
  ex_unit uuid;
  ex_task uuid;
BEGIN
  SELECT organization_id, unit_id, task_id
    INTO ex_org, ex_unit, ex_task
  FROM public.task_executions
  WHERE id = NEW.task_execution_id;

  IF ex_org IS NULL THEN
    RAISE EXCEPTION 'Execução % não encontrada para vínculo de evidência', NEW.task_execution_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM ex_org THEN
    RAISE EXCEPTION 'organization_id da evidência (%) difere da execução (%)', NEW.organization_id, ex_org
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.unit_id IS DISTINCT FROM ex_unit THEN
    RAISE EXCEPTION 'unit_id da evidência (%) difere da execução (%)', NEW.unit_id, ex_unit
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.task_id IS DISTINCT FROM ex_task THEN
    RAISE EXCEPTION 'task_id da evidência (%) difere da execução (%)', NEW.task_id, ex_task
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;


--

-- Name: claim_checklist_analysis(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_checklist_analysis(p_analysis_id uuid) RETURNS TABLE(claimed boolean, current_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_status public.checklist_evidence_analysis_status;
  v_current    public.checklist_evidence_analysis_status;
BEGIN
  UPDATE public.checklist_evidence_analyses
     SET status = 'processing',
         processing_started_at = now()
   WHERE id = p_analysis_id
     AND status = 'pending'
  RETURNING status INTO v_new_status;

  IF v_new_status IS NOT NULL THEN
    RETURN QUERY SELECT true, v_new_status::text;
    RETURN;
  END IF;

  SELECT status INTO v_current FROM public.checklist_evidence_analyses WHERE id = p_analysis_id;
  RETURN QUERY SELECT false, v_current::text;
END;
$$;


--

-- Name: claim_evidence_for_analysis(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_evidence_for_analysis(p_evidence_id uuid) RETURNS TABLE(claimed boolean, current_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_new_status text;
  v_current text;
BEGIN
  UPDATE public.evidences
     SET status = 'processing'
   WHERE id = p_evidence_id
     AND status IN ('pending','analysis_failed')
  RETURNING status INTO v_new_status;

  IF v_new_status IS NOT NULL THEN
    RETURN QUERY SELECT true, v_new_status;
    RETURN;
  END IF;

  SELECT status INTO v_current FROM public.evidences WHERE id = p_evidence_id;
  RETURN QUERY SELECT false, v_current;
END;
$$;


--

-- Name: cleanup_expired_responses(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_responses() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_deleted integer;
BEGIN
  WITH deleted AS (
    DELETE FROM public.checklist_responses r
    USING public.checklists c
    WHERE r.checklist_id = c.id
      AND COALESCE((c.settings->>'dataRetention')::boolean, false) = true
      AND r.submitted_at + (COALESCE((c.settings->>'retentionDays')::int, 3) || ' days')::interval < now()
    RETURNING r.id
  )
  SELECT count(*) INTO v_deleted FROM deleted;

  INSERT INTO public.cleanup_log (deleted_count) VALUES (v_deleted);
END;
$$;


--

-- Name: create_checklist_evidence_attempt(uuid, uuid, text, text, integer, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_checklist_evidence_attempt(p_checklist_id uuid, p_response_id uuid, p_block_id text, p_mime_type text, p_size_bytes integer, p_storage_path text, p_evidence_id uuid, p_max_attempts integer DEFAULT 10) RETURNS TABLE(evidence_id uuid, attempt_number integer, previous_evidence_id uuid, storage_path text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_lock_key bigint;
  v_next integer;
  v_prev uuid;
BEGIN
  -- Lock consultivo por (response, block) — serializa start-upload concorrentes.
  v_lock_key := ('x' || substr(md5(p_response_id::text || ':' || p_block_id), 1, 15))::bit(60)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(ce.attempt_number), 0) + 1,
         (SELECT ce2.id FROM public.checklist_evidences ce2
           WHERE ce2.response_id = p_response_id AND ce2.block_id = p_block_id
           ORDER BY ce2.attempt_number DESC LIMIT 1)
    INTO v_next, v_prev
  FROM public.checklist_evidences ce
  WHERE ce.response_id = p_response_id AND ce.block_id = p_block_id;

  IF v_next > p_max_attempts THEN
    RAISE EXCEPTION 'attempt_limit_reached' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.checklist_evidences (
    id, checklist_id, response_id, block_id,
    storage_path, attempt_number, previous_evidence_id,
    mime_type, size_bytes, uploaded
  ) VALUES (
    p_evidence_id, p_checklist_id, p_response_id, p_block_id,
    p_storage_path, v_next, v_prev,
    p_mime_type, p_size_bytes, false
  );

  RETURN QUERY SELECT p_evidence_id, v_next, v_prev, p_storage_path;
END;
$$;


--

-- Name: delete_response_storage_files(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_response_storage_files() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'storage'
    AS $_$
DECLARE
  v_url text;
  v_path text;
  v_marker text := '/checklist-assets/';
  v_idx int;
BEGIN
  IF OLD.answers IS NULL THEN
    RETURN OLD;
  END IF;

  -- Walk every string value in the answers jsonb tree, looking for URLs that point to the checklist-assets bucket.
  FOR v_url IN
    SELECT value::text
    FROM jsonb_path_query(OLD.answers, 'strict $.**?(@.type() == "string")') AS value
  LOOP
    -- value::text wraps strings in quotes; strip them
    v_url := btrim(v_url, '"');

    v_idx := position(v_marker IN v_url);
    IF v_idx > 0 THEN
      v_path := substring(v_url FROM v_idx + length(v_marker));
      -- Strip any query string
      v_path := split_part(v_path, '?', 1);

      IF v_path <> '' THEN
        BEGIN
          DELETE FROM storage.objects
          WHERE bucket_id = 'checklist-assets'
            AND name = v_path;
        EXCEPTION WHEN OTHERS THEN
          -- Never block the response deletion if storage cleanup fails
          RAISE WARNING 'Falha ao apagar arquivo do storage %: %', v_path, SQLERRM;
        END;
      END IF;
    END IF;
  END LOOP;

  RETURN OLD;
END;
$_$;


--

-- Name: generate_dataset_public_id(); Type: FUNCTION; Schema: public; Owner: -
--

-- Moved to 02b_prereq_functions.sql (used in column DEFAULT on vision_datasets).


--

-- Name: generate_short_slug(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_short_slug(length integer DEFAULT 6) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i integer := 0;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$;


--

-- Name: get_user_email_by_id(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_email_by_id(user_uuid uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Tenta buscar no auth.users (requer privilégios de service_role)
  -- Mas como estamos chamando via RPC, precisamos garantir que o search_path e permissões estejam ok
  SELECT email INTO user_email FROM auth.users WHERE id = user_uuid;
  
  RETURN user_email;
END;
$$;


--

-- Name: get_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_id_by_email(email_to_find text) RETURNS TABLE(user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY SELECT id FROM auth.users WHERE email = email_to_find;
END;
$$;


--

-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, first_name, last_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email),
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;


--

-- Name: handle_task_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_task_lifecycle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Desativação: cancela slots futuros pendentes
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'task_deactivated'
     WHERE task_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;

  -- Reativação: reinicia active_from para não gerar atraso retroativo
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.active_from := now();
  END IF;

  -- Alteração de horário: cancela slot antigo pendente futuro
  IF NEW.is_active = true
     AND OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'schedule_changed'
     WHERE task_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;

  RETURN NEW;
END;
$$;


--

-- Name: handle_unit_lifecycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_unit_lifecycle() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.task_executions
       SET status = 'cancelled'::public.execution_status,
           cancelled_at = now(),
           cancellation_reason = 'unit_deactivated'
     WHERE unit_id = NEW.id
       AND status = 'pending'
       AND scheduled_at > now();
  END IF;
  RETURN NEW;
END;
$$;


--

-- Name: handle_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--

-- Name: hit_public_rate_limit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hit_public_rate_limit(p_key_hash text, p_action text, p_window_seconds integer, p_limit integer) RETURNS TABLE(allowed boolean, current_hits integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_window timestamptz;
  v_hits integer;
BEGIN
  v_window := to_timestamp(
    (floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)::bigint
  );

  INSERT INTO public.public_rate_limits (key_hash, action, window_start, hits)
  VALUES (p_key_hash, p_action, v_window, 1)
  ON CONFLICT (key_hash, action, window_start)
    DO UPDATE SET hits = public_rate_limits.hits + 1
  RETURNING hits INTO v_hits;

  -- Limpeza best-effort de janelas antigas (>24h).
  DELETE FROM public.public_rate_limits
   WHERE window_start < now() - interval '24 hours';

  RETURN QUERY SELECT (v_hits <= p_limit) AS allowed, v_hits;
END;
$$;


--

-- Name: import_legacy_checklist_photos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.import_legacy_checklist_photos() RETURNS TABLE(found integer, migrated integer, unmapped integer, skipped integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_found integer := 0;
  v_migrated integer := 0;
  v_unmapped integer := 0;
  v_skipped integer := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='insufficient_privilege';
  END IF;

  WITH src AS (
    SELECT
      r.id                                       AS response_id,
      r.checklist_id                             AS checklist_id,
      COALESCE(r.submitted_at, r.created_at)     AS submitted_at,
      c.blocks                                   AS blocks,
      kv.key                                     AS block_id,
      kv.value->>'url'                           AS url,
      kv.value->>'type'                          AS mime,
      -- Extrai o caminho relativo dentro do bucket checklist-assets.
      regexp_replace(
        split_part(kv.value->>'url', '?', 1),
        '^.*/checklist-assets/', ''
      )                                          AS storage_path
    FROM public.checklist_responses r
    JOIN public.checklists c ON c.id = r.checklist_id,
    LATERAL jsonb_each(r.answers) kv
    WHERE jsonb_typeof(kv.value) = 'object'
      AND (kv.value->>'url')  LIKE '%/checklist-assets/%'
      AND (kv.value->>'type') LIKE 'image/%'
  ),
  tagged AS (
    SELECT s.*,
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.blocks) b WHERE b->>'id' = s.block_id
      ) AS has_block
    FROM src s
    WHERE s.storage_path <> '' AND s.storage_path IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.checklist_evidences(
      checklist_id, response_id, block_id, storage_path,
      attempt_number, uploaded, mime_type, submitted_at,
      source, origin_bucket, original_url
    )
    SELECT
      t.checklist_id, t.response_id, t.block_id, t.storage_path,
      1, true, t.mime, t.submitted_at,
      CASE WHEN t.has_block THEN 'legacy_migrated' ELSE 'legacy_unmapped' END,
      'checklist-assets', t.url
    FROM tagged t
    ON CONFLICT (response_id, block_id, storage_path) DO NOTHING
    RETURNING source
  )
  SELECT
    (SELECT count(*) FROM tagged)::int,
    (SELECT count(*) FROM ins)::int,
    (SELECT count(*) FROM tagged WHERE NOT has_block)::int,
    ((SELECT count(*) FROM tagged) - (SELECT count(*) FROM ins))::int
  INTO v_found, v_migrated, v_unmapped, v_skipped;

  RETURN QUERY SELECT v_found, v_migrated, v_unmapped, v_skipped;
END;
$$;


--

-- Name: materialize_task_executions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materialize_task_executions() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  WITH days AS (
    SELECT 0 AS d UNION ALL SELECT 1
  ),
  planned AS (
    SELECT
      t.id              AS task_id,
      t.organization_id AS organization_id,
      t.unit_id         AS unit_id,
      t.shift_id        AS shift_id,
      (
        (((now() AT TIME ZONE u.timezone)::date + days.d)::text
         || ' ' || t.scheduled_time::text)::timestamp
      ) AT TIME ZONE u.timezone AS scheduled_at,
      COALESCE(t.active_from, t.created_at) AS active_from
    FROM public.tasks t
    JOIN public.units u ON u.id = t.unit_id
    CROSS JOIN days
    WHERE t.is_active = true
      AND u.is_active = true
      AND t.scheduled_time IS NOT NULL
  ),
  ins AS (
    INSERT INTO public.task_executions
      (task_id, organization_id, unit_id, shift_id, scheduled_at, status)
    SELECT p.task_id, p.organization_id, p.unit_id, p.shift_id, p.scheduled_at, 'pending'::public.execution_status
    FROM planned p
    WHERE p.scheduled_at >= p.active_from
    ON CONFLICT (task_id, unit_id, scheduled_at) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;


--
-- Name: publish_checklist(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_checklist(p_checklist_id uuid) RETURNS TABLE(id uuid, published_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row          public.checklists%ROWTYPE;
  v_caller       uuid := auth.uid();
  v_title        text;
  v_blocks       jsonb;
  v_published_at timestamptz := now();
  v_can_publish  boolean := false;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_row FROM public.checklists c WHERE c.id = p_checklist_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_row.user_id = v_caller THEN
    v_can_publish := true;
  ELSIF v_row.workspace_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.workspaces w
       WHERE w.id = v_row.workspace_id AND w.owner_id = v_caller
    ) THEN
    v_can_publish := true;
  END IF;
  IF NOT v_can_publish THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_title  := COALESCE(NULLIF(btrim(v_row.title), ''), 'Sem título');
  v_blocks := COALESCE(v_row.blocks, '[]'::jsonb);
  IF jsonb_typeof(v_blocks) <> 'array' THEN
    v_blocks := '[]'::jsonb;
  END IF;

  UPDATE public.checklists c
     SET is_published      = true,
         published_content = jsonb_build_object(
           'title',        v_title,
           'blocks',       v_blocks,
           'settings',     COALESCE(v_row.settings, '{}'::jsonb),
           'published_at', to_jsonb(v_published_at)
         ),
         updated_at        = now()
   WHERE c.id = p_checklist_id;

  RETURN QUERY SELECT p_checklist_id AS id, v_published_at AS published_at;
END;
$$;


--

-- Name: rematerialize_after_task_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rematerialize_after_task_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF (OLD.scheduled_time IS DISTINCT FROM NEW.scheduled_time)
     OR (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    PERFORM public.materialize_task_executions();
  END IF;
  RETURN NULL;
END;
$$;


--

-- Name: set_unique_custom_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_unique_custom_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  new_slug text;
  exists_already boolean;
BEGIN
  -- If custom_slug is not provided, generate a random 6-char one
  IF NEW.custom_slug IS NULL THEN
    LOOP
      new_slug := generate_short_slug(6);
      SELECT EXISTS (SELECT 1 FROM public.checklists WHERE custom_slug = new_slug) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    NEW.custom_slug := new_slug;
  END IF;
  RETURN NEW;
END;
$$;


--

-- Name: set_unique_short_slug(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_unique_short_slug() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  new_slug text;
  exists_already boolean;
BEGIN
  IF NEW.short_slug IS NULL THEN
    LOOP
      new_slug := generate_short_slug(6);
      SELECT EXISTS (SELECT 1 FROM public.checklists WHERE short_slug = new_slug) INTO exists_already;
      EXIT WHEN NOT exists_already;
    END LOOP;
    NEW.short_slug := new_slug;
  END IF;
  RETURN NEW;
END;
$$;


--

-- Name: update_checklist_retention(uuid, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_checklist_retention(p_checklist_id uuid, p_retention_days integer, p_is_enabled boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  -- Update checklist settings
  UPDATE public.checklists
  SET settings = jsonb_set(
    jsonb_set(COALESCE(settings, '{}'::jsonb), '{retentionDays}', to_jsonb(p_retention_days)),
    '{dataRetention}', to_jsonb(p_is_enabled)
  )
  WHERE id = p_checklist_id;

  -- Update responses
  IF p_is_enabled THEN
    UPDATE public.checklist_responses
    SET expires_at = submitted_at + (p_retention_days || ' days')::interval
    WHERE checklist_id = p_checklist_id;
  ELSE
    UPDATE public.checklist_responses
    SET expires_at = NULL
    WHERE checklist_id = p_checklist_id;
  END IF;
END;
$$;


--

-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--

-- Name: vision_datasets_prevent_public_id_update(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vision_datasets_prevent_public_id_update() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
BEGIN
  IF NEW.public_id IS DISTINCT FROM OLD.public_id THEN
    IF OLD.public_id ~* '^pad_[a-z0-9]{6,8}$'
       AND NEW.public_id = upper(substring(OLD.public_id FROM 5)) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'public_id é imutável';
  END IF;

  RETURN NEW;
END;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--


-- Name: submit_public_response(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--
-- Public (anonymous) response submission for a published checklist.
-- Validates the checklist is published, inserts checklist_responses, and returns
-- a short-lived upload token consumed by the upload-public-evidence edge function.
-- Anonymous role never gets direct INSERT on checklist_responses/evidences.

CREATE OR REPLACE FUNCTION public.submit_public_response(
  p_public_id text,
  p_answers   jsonb
)
 RETURNS TABLE(response_id uuid, checklist_id uuid, upload_token text, upload_token_expires_at timestamptz)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
DECLARE
  v_checklist public.checklists%ROWTYPE;
  v_resp_id   uuid := gen_random_uuid();
  v_token     text;
  v_hash      text;
  v_exp       timestamptz := now() + interval '30 minutes';
BEGIN
  IF p_public_id IS NULL OR length(btrim(p_public_id)) = 0 THEN
    RAISE EXCEPTION 'public_id_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'answers_must_be_object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c.* INTO v_checklist
    FROM public.checklists c
   WHERE c.is_published = true
     AND (c.custom_slug = p_public_id OR c.short_slug = p_public_id OR c.id::text = p_public_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found_or_unpublished' USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.checklist_responses(id, checklist_id, answers, status, submitted_at, created_at)
  VALUES (v_resp_id, v_checklist.id, p_answers, 'submitted', now(), now());

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash  := encode(extensions.digest(v_token, 'sha256'), 'hex');

  UPDATE public.checklist_responses
     SET upload_token_hash = v_hash,
         upload_token_expires_at = v_exp
   WHERE id = v_resp_id;

  RETURN QUERY SELECT v_resp_id, v_checklist.id, v_token, v_exp;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_public_response(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_response(text, jsonb) TO anon, authenticated;


--

-- Name: get_public_checklist(text); Type: FUNCTION; Schema: public; Owner: -
--
-- Read-only projection of a published checklist for public share links.
-- Returns ONLY the fields required to render the fill-in page. Never exposes
-- owner_id, workspace_id, user_id or internal identifiers.

CREATE OR REPLACE FUNCTION public.get_public_checklist(p_public_id text)
 RETURNS TABLE(
   id           uuid,
   title        text,
   description  text,
   blocks       jsonb,
   settings     jsonb,
   short_slug   text,
   custom_slug  text,
   published_at timestamptz
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.checklists%ROWTYPE;
BEGIN
  IF p_public_id IS NULL OR length(btrim(p_public_id)) = 0 THEN
    RAISE EXCEPTION 'public_id_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT c.* INTO v_row
    FROM public.checklists c
   WHERE c.is_published = true
     AND (c.custom_slug = p_public_id OR c.short_slug = p_public_id OR c.id::text = p_public_id)
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'checklist_not_found_or_unpublished' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN QUERY SELECT
    v_row.id,
    COALESCE(NULLIF(btrim((v_row.published_content->>'title')), ''),
             NULLIF(btrim(v_row.title), ''),
             'Sem título')::text,
    v_row.description,
    COALESCE(v_row.published_content->'blocks', v_row.blocks, '[]'::jsonb),
    COALESCE(v_row.published_content->'settings', v_row.settings, '{}'::jsonb),
    v_row.short_slug,
    v_row.custom_slug,
    NULLIF(v_row.published_content->>'published_at','')::timestamptz;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_public_checklist(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_checklist(text) TO anon, authenticated;


--

-- ==== 06_triggers.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

--

-- Name: checklists set_checklists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_checklists_updated_at BEFORE UPDATE ON public.checklists FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


--

-- Name: task_executions task_executions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER task_executions_updated_at BEFORE UPDATE ON public.task_executions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: tasks tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: checklists tr_set_unique_custom_slug; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_set_unique_custom_slug BEFORE INSERT ON public.checklists FOR EACH ROW EXECUTE FUNCTION public.set_unique_custom_slug();


--

-- Name: evidences trg_check_evidence_execution_consistency; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_evidence_execution_consistency BEFORE INSERT OR UPDATE OF task_execution_id, organization_id, unit_id, task_id ON public.evidences FOR EACH ROW EXECUTE FUNCTION public.check_evidence_execution_consistency();


--

-- Name: checklist_evidence_analyses trg_checklist_analyses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_checklist_analyses_updated_at BEFORE UPDATE ON public.checklist_evidence_analyses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: checklist_evidences trg_checklist_evidences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_checklist_evidences_updated_at BEFORE UPDATE ON public.checklist_evidences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: checklist_responses trg_delete_response_storage_files; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_delete_response_storage_files BEFORE DELETE ON public.checklist_responses FOR EACH ROW EXECUTE FUNCTION public.delete_response_storage_files();


--

-- Name: tasks trg_task_lifecycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_task_lifecycle BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.handle_task_lifecycle();


--

-- Name: tasks trg_task_rematerialize; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_task_rematerialize AFTER UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.rematerialize_after_task_change();


--

-- Name: units trg_unit_lifecycle; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_unit_lifecycle BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.handle_unit_lifecycle();


--

-- Name: vision_datasets trg_vision_datasets_public_id_immutable; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vision_datasets_public_id_immutable BEFORE UPDATE ON public.vision_datasets FOR EACH ROW EXECUTE FUNCTION public.vision_datasets_prevent_public_id_update();


--

-- Name: vision_datasets trg_vision_datasets_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vision_datasets_updated_at BEFORE UPDATE ON public.vision_datasets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: evidences update_evidences_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_evidences_updated_at BEFORE UPDATE ON public.evidences FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: shifts update_shifts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_shifts_updated_at BEFORE UPDATE ON public.shifts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: units update_units_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: user_domains update_user_domains_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_domains_updated_at BEFORE UPDATE ON public.user_domains FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: workspace_card_meta update_workspace_card_meta_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspace_card_meta_updated_at BEFORE UPDATE ON public.workspace_card_meta FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: workspace_categories update_workspace_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspace_categories_updated_at BEFORE UPDATE ON public.workspace_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: workspace_tasks update_workspace_tasks_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspace_tasks_updated_at BEFORE UPDATE ON public.workspace_tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: workspaces update_workspaces_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- Name: vision_curated_images vision_curated_images_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER vision_curated_images_updated_at BEFORE UPDATE ON public.vision_curated_images FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--

-- ==== 07_rls_and_policies.sql ====
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

-- ==== 08_storage.sql ====
-- Storage buckets & policies. Evidences bucket is PRIVATE. Anonymous
-- users never upload directly — public evidence uploads are routed
-- through the upload-public-evidence edge function (service role).

INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars', true),
  ('checklist-assets','checklist-assets', true),
  ('checklist-evidences','checklist-evidences', false),
  ('evidences','evidences', false),
  ('vision-datasets','vision-datasets', false),
  ('workspace-assets','workspace-assets', true)
ON CONFLICT (id) DO NOTHING;

-- AVATARS (public bucket, owner-scoped writes) -----------------------
CREATE POLICY "Avatars are publicly accessible" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- CHECKLIST-ASSETS (public bucket for authored assets only) ----------
-- NOTE: anonymous uploads have been removed. Public respondents send
-- their photos through the upload-public-evidence edge function, which
-- writes to the private checklist-evidences bucket using service role.
CREATE POLICY "Public can view checklist assets" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'checklist-assets');
CREATE POLICY "Authenticated users can upload checklist assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'checklist-assets');
CREATE POLICY "Users can update their own checklist assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'checklist-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own checklist assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- CHECKLIST-EVIDENCES (private) --------------------------------------
CREATE POLICY "checklist_evidences_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'checklist-evidences' AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.user_id = auth.uid() AND objects.name LIKE (c.id::text || '/%')));
CREATE POLICY "checklist_evidences_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'checklist-evidences' AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.user_id = auth.uid() AND objects.name LIKE (c.id::text || '/%')));

-- VISION-DATASETS (private) ------------------------------------------
CREATE POLICY vision_datasets_auth_select ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'vision-datasets');
CREATE POLICY vision_datasets_auth_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'vision-datasets');
CREATE POLICY vision_datasets_auth_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'vision-datasets') WITH CHECK (bucket_id = 'vision-datasets');
CREATE POLICY vision_datasets_auth_delete ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'vision-datasets');

-- WORKSPACE-ASSETS (public bucket for owner uploads) -----------------
CREATE POLICY "Workspace assets are publicly accessible" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'workspace-assets');
CREATE POLICY "Authenticated users can upload workspace assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'workspace-assets');
CREATE POLICY "Users can update their own workspace assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'workspace-assets' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'workspace-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own workspace assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'workspace-assets' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- ==== 09_realtime_and_cron.sql ====
-- Auto-generated from pg_catalog introspection.
-- Regenerated after removal of Anomalib/Railway training objects.
-- Do not edit by hand; see supabase/clean-baseline/README.md.

-- Realtime replication ------------------------------------------------
-- Ensure the supabase_realtime publication exists (managed by Supabase).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Add tables that the app consumes via realtime channels.
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_executions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.evidences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_evidences;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_evidence_analyses;

-- Full row payload for realtime consumers that need previous values.
ALTER TABLE public.task_executions REPLICA IDENTITY FULL;
ALTER TABLE public.evidences REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_responses REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_evidences REPLICA IDENTITY FULL;
ALTER TABLE public.checklist_evidence_analyses REPLICA IDENTITY FULL;

-- Cron jobs ------------------------------------------------------------
-- pg_cron is not required by the manual baseline. Cleanup/materialisation
-- functions (cleanup_expired_responses, materialize_task_executions) are
-- callable manually or scheduled externally.

COMMIT;
