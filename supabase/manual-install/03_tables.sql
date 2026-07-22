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
-- RPCs (get_public_checklist, submit_public_response). See 05_functions_and_rpc.sql.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
