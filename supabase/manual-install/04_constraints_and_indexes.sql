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

