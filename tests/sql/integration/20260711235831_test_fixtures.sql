
DO $test$
DECLARE
  v_ws_a uuid; v_ws_b uuid;
  v_unit_a uuid; v_unit_b uuid;
  v_task_a uuid; v_task_b uuid;
  v_exec_future uuid; v_exec_past uuid; v_exec_done uuid; v_exec_b uuid;
  v_cnt int; v_cnt2 int; v_status text; v_reason text; v_active_from timestamptz;
BEGIN
  INSERT INTO public.workspaces(name) VALUES ('__test_org_a__') RETURNING id INTO v_ws_a;
  INSERT INTO public.workspaces(name) VALUES ('__test_org_b__') RETURNING id INTO v_ws_b;
  INSERT INTO public.units(workspace_id, name, timezone) VALUES (v_ws_a, '__u_a__', 'America/Sao_Paulo') RETURNING id INTO v_unit_a;
  INSERT INTO public.units(workspace_id, name, timezone) VALUES (v_ws_b, '__u_b__', 'America/Sao_Paulo') RETURNING id INTO v_unit_b;
  INSERT INTO public.tasks(organization_id, unit_id, title, scheduled_time, active_from)
    VALUES (v_ws_a, v_unit_a, '__t_a__', '10:00', now() - interval '2 days') RETURNING id INTO v_task_a;
  INSERT INTO public.tasks(organization_id, unit_id, title, scheduled_time, active_from)
    VALUES (v_ws_b, v_unit_b, '__t_b__', '10:00', now() - interval '2 days') RETURNING id INTO v_task_b;

  INSERT INTO public.task_executions(task_id, organization_id, unit_id, scheduled_at, status)
    VALUES (v_task_a, v_ws_a, v_unit_a, now() + interval '2 hours', 'pending') RETURNING id INTO v_exec_future;
  INSERT INTO public.task_executions(task_id, organization_id, unit_id, scheduled_at, status)
    VALUES (v_task_a, v_ws_a, v_unit_a, now() - interval '2 hours', 'pending') RETURNING id INTO v_exec_past;
  INSERT INTO public.task_executions(task_id, organization_id, unit_id, scheduled_at, status, executed_at)
    VALUES (v_task_a, v_ws_a, v_unit_a, now() - interval '1 day', 'done', now() - interval '23 hours') RETURNING id INTO v_exec_done;
  INSERT INTO public.task_executions(task_id, organization_id, unit_id, scheduled_at, status)
    VALUES (v_task_b, v_ws_b, v_unit_b, now() + interval '2 hours', 'pending') RETURNING id INTO v_exec_b;

  -- T1
  UPDATE public.tasks SET is_active = false WHERE id = v_task_a;
  SELECT status, cancellation_reason INTO v_status, v_reason FROM public.task_executions WHERE id = v_exec_future;
  IF v_status <> 'cancelled' OR v_reason <> 'task_deactivated' THEN
    RAISE EXCEPTION 'T1: status=% reason=%', v_status, v_reason;
  END IF;

  -- T2
  SELECT status INTO v_status FROM public.task_executions WHERE id = v_exec_past;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'T2: vencida alterada (%)', v_status; END IF;
  SELECT status INTO v_status FROM public.task_executions WHERE id = v_exec_done;
  IF v_status <> 'done' THEN RAISE EXCEPTION 'T2: done alterada (%)', v_status; END IF;

  -- Isolamento: exec seed da Org B intacta
  SELECT status INTO v_status FROM public.task_executions WHERE id = v_exec_b;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'ISO: exec Org B alterada por Org A (%)', v_status; END IF;

  -- T3
  UPDATE public.tasks SET is_active = true WHERE id = v_task_a;
  SELECT active_from INTO v_active_from FROM public.tasks WHERE id = v_task_a;
  IF v_active_from < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'T3: active_from não redefinido (%)', v_active_from;
  END IF;

  -- T4/T5
  INSERT INTO public.task_executions(task_id, organization_id, unit_id, scheduled_at, status)
    VALUES (v_task_a, v_ws_a, v_unit_a, now() + interval '3 hours', 'pending') RETURNING id INTO v_exec_future;
  UPDATE public.tasks SET scheduled_time = '23:59' WHERE id = v_task_a;
  SELECT status, cancellation_reason INTO v_status, v_reason FROM public.task_executions WHERE id = v_exec_future;
  IF v_status <> 'cancelled' OR v_reason <> 'schedule_changed' THEN
    RAISE EXCEPTION 'T4: status=% reason=%', v_status, v_reason;
  END IF;

  -- T6
  INSERT INTO public.task_executions(task_id, organization_id, unit_id, scheduled_at, status)
    VALUES (v_task_a, v_ws_a, v_unit_a, now() + interval '4 hours', 'pending') RETURNING id INTO v_exec_future;
  UPDATE public.units SET is_active = false WHERE id = v_unit_a;
  SELECT status, cancellation_reason INTO v_status, v_reason FROM public.task_executions WHERE id = v_exec_future;
  IF v_status <> 'cancelled' OR v_reason <> 'unit_deactivated' THEN
    RAISE EXCEPTION 'T6: status=% reason=%', v_status, v_reason;
  END IF;

  -- T7 (done intacta) + Iso (unidade B intacta)
  SELECT status INTO v_status FROM public.task_executions WHERE id = v_exec_done;
  IF v_status <> 'done' THEN RAISE EXCEPTION 'T7: done alterada em desativação de unidade'; END IF;
  SELECT status INTO v_status FROM public.task_executions WHERE id = v_exec_b;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'ISO: unidade B afetada por desativação de unidade A (%)', v_status; END IF;

  -- T8 idempotência
  UPDATE public.units SET is_active = true WHERE id = v_unit_a;
  PERFORM public.materialize_task_executions();
  SELECT count(*) INTO v_cnt FROM public.task_executions WHERE task_id = v_task_a;
  PERFORM public.materialize_task_executions();
  SELECT count(*) INTO v_cnt2 FROM public.task_executions WHERE task_id = v_task_a;
  IF v_cnt2 <> v_cnt THEN RAISE EXCEPTION 'T8: idempotência quebrada (% -> %)', v_cnt, v_cnt2; END IF;

  -- T9 retroativo
  DECLARE
    v_task_c uuid;
    v_past_time time;
  BEGIN
    v_past_time := (now() - interval '3 hours')::time;
    INSERT INTO public.tasks(organization_id, unit_id, title, scheduled_time, active_from)
      VALUES (v_ws_a, v_unit_a, '__t_c__', v_past_time, now()) RETURNING id INTO v_task_c;
    PERFORM public.materialize_task_executions();
    SELECT count(*) INTO v_cnt FROM public.task_executions WHERE task_id = v_task_c AND scheduled_at < now();
    IF v_cnt <> 0 THEN RAISE EXCEPTION 'T9: gerou % execuções retroativas', v_cnt; END IF;
  END;

  -- T10 done permanece
  UPDATE public.tasks SET title = '__t_a_renamed__' WHERE id = v_task_a;
  UPDATE public.units SET name = '__u_a_renamed__' WHERE id = v_unit_a;
  SELECT status INTO v_status FROM public.task_executions WHERE id = v_exec_done;
  IF v_status <> 'done' THEN RAISE EXCEPTION 'T10: done afetada'; END IF;

  -- Alteração simultânea (precedência: task_deactivated)
  INSERT INTO public.task_executions(task_id, organization_id, unit_id, scheduled_at, status)
    VALUES (v_task_a, v_ws_a, v_unit_a, now() + interval '5 hours', 'pending') RETURNING id INTO v_exec_future;
  UPDATE public.tasks SET is_active = false, scheduled_time = '01:00' WHERE id = v_task_a;
  SELECT status, cancellation_reason INTO v_status, v_reason FROM public.task_executions WHERE id = v_exec_future;
  IF v_status <> 'cancelled' OR v_reason NOT IN ('task_deactivated','schedule_changed') THEN
    RAISE EXCEPTION 'CONC: status=% reason=%', v_status, v_reason;
  END IF;
  PERFORM public.materialize_task_executions();
  SELECT count(*) INTO v_cnt FROM public.task_executions
    WHERE task_id = v_task_a AND status = 'pending' AND scheduled_at > now();
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'CONC: rematerializou tarefa inativa (%)', v_cnt; END IF;

  -- Cleanup
  DELETE FROM public.workspaces WHERE id IN (v_ws_a, v_ws_b);

  RAISE NOTICE 'TODOS OS TESTES DE INTEGRAÇÃO PASSARAM';
END
$test$;
