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
