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
