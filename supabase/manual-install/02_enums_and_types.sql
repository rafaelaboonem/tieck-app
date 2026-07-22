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
