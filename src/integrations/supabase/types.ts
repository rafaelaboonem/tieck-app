export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      checklist_analytics: {
        Row: {
          checklist_id: string
          id: string
          last_active_at: string
          metadata: Json | null
          session_id: string
          started_at: string
          submitted_at: string | null
          visitor_id: string
        }
        Insert: {
          checklist_id: string
          id?: string
          last_active_at?: string
          metadata?: Json | null
          session_id?: string
          started_at?: string
          submitted_at?: string | null
          visitor_id: string
        }
        Update: {
          checklist_id?: string
          id?: string
          last_active_at?: string
          metadata?: Json | null
          session_id?: string
          started_at?: string
          submitted_at?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_analytics_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_evidence_analyses: {
        Row: {
          analysis_token_hash: string
          anomaly_score: number | null
          block_id: string
          checklist_id: string
          confidence: number | null
          created_at: string
          error_code: string | null
          error_message: string | null
          evidence_id: string
          heatmap_path: string | null
          id: string
          inference_ms: number | null
          model_id: string
          model_version: string | null
          processing_finished_at: string | null
          processing_started_at: string | null
          provider: string
          published_content_hash: string
          raw_response: Json | null
          regions: Json | null
          response_id: string
          run_number: number
          status: Database["public"]["Enums"]["checklist_evidence_analysis_status"]
          threshold: number | null
          updated_at: string
        }
        Insert: {
          analysis_token_hash: string
          anomaly_score?: number | null
          block_id: string
          checklist_id: string
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          evidence_id: string
          heatmap_path?: string | null
          id?: string
          inference_ms?: number | null
          model_id: string
          model_version?: string | null
          processing_finished_at?: string | null
          processing_started_at?: string | null
          provider: string
          published_content_hash: string
          raw_response?: Json | null
          regions?: Json | null
          response_id: string
          run_number?: number
          status?: Database["public"]["Enums"]["checklist_evidence_analysis_status"]
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          analysis_token_hash?: string
          anomaly_score?: number | null
          block_id?: string
          checklist_id?: string
          confidence?: number | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          evidence_id?: string
          heatmap_path?: string | null
          id?: string
          inference_ms?: number | null
          model_id?: string
          model_version?: string | null
          processing_finished_at?: string | null
          processing_started_at?: string | null
          provider?: string
          published_content_hash?: string
          raw_response?: Json | null
          regions?: Json | null
          response_id?: string
          run_number?: number
          status?: Database["public"]["Enums"]["checklist_evidence_analysis_status"]
          threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_evidence_analyses_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_evidence_analyses_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "checklist_evidences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_evidence_analyses_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "checklist_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_evidences: {
        Row: {
          attempt_number: number
          block_id: string
          checklist_id: string
          created_at: string
          id: string
          mime_type: string | null
          origin_bucket: string
          original_url: string | null
          previous_evidence_id: string | null
          response_id: string
          sha256: string | null
          size_bytes: number | null
          source: string
          storage_path: string
          submitted_at: string | null
          updated_at: string
          uploaded: boolean
        }
        Insert: {
          attempt_number?: number
          block_id: string
          checklist_id: string
          created_at?: string
          id?: string
          mime_type?: string | null
          origin_bucket?: string
          original_url?: string | null
          previous_evidence_id?: string | null
          response_id: string
          sha256?: string | null
          size_bytes?: number | null
          source?: string
          storage_path: string
          submitted_at?: string | null
          updated_at?: string
          uploaded?: boolean
        }
        Update: {
          attempt_number?: number
          block_id?: string
          checklist_id?: string
          created_at?: string
          id?: string
          mime_type?: string | null
          origin_bucket?: string
          original_url?: string | null
          previous_evidence_id?: string | null
          response_id?: string
          sha256?: string | null
          size_bytes?: number | null
          source?: string
          storage_path?: string
          submitted_at?: string | null
          updated_at?: string
          uploaded?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "checklist_evidences_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_evidences_previous_evidence_id_fkey"
            columns: ["previous_evidence_id"]
            isOneToOne: false
            referencedRelation: "checklist_evidences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_evidences_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "checklist_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_members: {
        Row: {
          checklist_id: string
          created_at: string
          email: string
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          checklist_id: string
          created_at?: string
          email: string
          id?: string
          role?: string
          user_id?: string | null
        }
        Update: {
          checklist_id?: string
          created_at?: string
          email?: string
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_members_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_relations: {
        Row: {
          checklist_id: string | null
          created_at: string
          id: string
          related_id: string | null
        }
        Insert: {
          checklist_id?: string | null
          created_at?: string
          id?: string
          related_id?: string | null
        }
        Update: {
          checklist_id?: string | null
          created_at?: string
          id?: string
          related_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_relations_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_relations_related_id_fkey"
            columns: ["related_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_responses: {
        Row: {
          answers: Json
          checklist_id: string
          created_at: string
          expires_at: string | null
          id: string
          response_token_hash: string
          status: Database["public"]["Enums"]["checklist_response_status"]
          submitted_at: string | null
          visitor_id: string
        }
        Insert: {
          answers?: Json
          checklist_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          response_token_hash: string
          status?: Database["public"]["Enums"]["checklist_response_status"]
          submitted_at?: string | null
          visitor_id: string
        }
        Update: {
          answers?: Json
          checklist_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          response_token_hash?: string
          status?: Database["public"]["Enums"]["checklist_response_status"]
          submitted_at?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_responses_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          blocks: Json
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          blocks?: Json
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          blocks?: Json
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      checklists: {
        Row: {
          blocks: Json
          category: string | null
          created_at: string
          custom_domain: string | null
          custom_email_domain_id: string | null
          custom_slug: string | null
          id: string
          is_published: boolean | null
          is_recurring: boolean
          published_content: Json | null
          settings: Json
          shift_id: string | null
          target_time: string | null
          title: string | null
          unit_id: string | null
          updated_at: string
          user_id: string | null
          view_type: string | null
          workspace_id: string | null
        }
        Insert: {
          blocks?: Json
          category?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_email_domain_id?: string | null
          custom_slug?: string | null
          id?: string
          is_published?: boolean | null
          is_recurring?: boolean
          published_content?: Json | null
          settings?: Json
          shift_id?: string | null
          target_time?: string | null
          title?: string | null
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
          view_type?: string | null
          workspace_id?: string | null
        }
        Update: {
          blocks?: Json
          category?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_email_domain_id?: string | null
          custom_slug?: string | null
          id?: string
          is_published?: boolean | null
          is_recurring?: boolean
          published_content?: Json | null
          settings?: Json
          shift_id?: string | null
          target_time?: string | null
          title?: string | null
          unit_id?: string | null
          updated_at?: string
          user_id?: string | null
          view_type?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklists_custom_email_domain_id_fkey"
            columns: ["custom_email_domain_id"]
            isOneToOne: false
            referencedRelation: "user_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cleanup_log: {
        Row: {
          deleted_count: number
          id: string
          ran_at: string
        }
        Insert: {
          deleted_count?: number
          id?: string
          ran_at?: string
        }
        Update: {
          deleted_count?: number
          id?: string
          ran_at?: string
        }
        Relationships: []
      }
      evidence_ai_analyses: {
        Row: {
          anomaly_map_storage_path: string | null
          anomaly_score: number | null
          confidence: number | null
          created_at: string
          criteria_results: Json
          decision: string
          detected_problems: Json
          detected_regions: Json
          error_code: string | null
          error_message: string | null
          evidence_id: string
          fallback_of: string | null
          id: string
          image_quality: Json
          inference_time_ms: number | null
          model: string | null
          model_id: string | null
          model_version: string | null
          organization_id: string
          processing_finished_at: string | null
          processing_started_at: string | null
          prompt_version: string | null
          provider: string
          raw_result: Json | null
          resubmit_instructions: string | null
          summary: string | null
          task_execution_id: string
          threshold: number | null
          unit_id: string
        }
        Insert: {
          anomaly_map_storage_path?: string | null
          anomaly_score?: number | null
          confidence?: number | null
          created_at?: string
          criteria_results?: Json
          decision: string
          detected_problems?: Json
          detected_regions?: Json
          error_code?: string | null
          error_message?: string | null
          evidence_id: string
          fallback_of?: string | null
          id?: string
          image_quality?: Json
          inference_time_ms?: number | null
          model?: string | null
          model_id?: string | null
          model_version?: string | null
          organization_id: string
          processing_finished_at?: string | null
          processing_started_at?: string | null
          prompt_version?: string | null
          provider?: string
          raw_result?: Json | null
          resubmit_instructions?: string | null
          summary?: string | null
          task_execution_id: string
          threshold?: number | null
          unit_id: string
        }
        Update: {
          anomaly_map_storage_path?: string | null
          anomaly_score?: number | null
          confidence?: number | null
          created_at?: string
          criteria_results?: Json
          decision?: string
          detected_problems?: Json
          detected_regions?: Json
          error_code?: string | null
          error_message?: string | null
          evidence_id?: string
          fallback_of?: string | null
          id?: string
          image_quality?: Json
          inference_time_ms?: number | null
          model?: string | null
          model_id?: string | null
          model_version?: string | null
          organization_id?: string
          processing_finished_at?: string | null
          processing_started_at?: string | null
          prompt_version?: string | null
          provider?: string
          raw_result?: Json | null
          resubmit_instructions?: string | null
          summary?: string | null
          task_execution_id?: string
          threshold?: number | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_ai_analyses_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_ai_analyses_fallback_of_fkey"
            columns: ["fallback_of"]
            isOneToOne: false
            referencedRelation: "evidence_ai_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_ai_analyses_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vision_anomaly_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_ai_analyses_task_execution_id_fkey"
            columns: ["task_execution_id"]
            isOneToOne: false
            referencedRelation: "analytics_critical_failures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_ai_analyses_task_execution_id_fkey"
            columns: ["task_execution_id"]
            isOneToOne: false
            referencedRelation: "analytics_overdue_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_ai_analyses_task_execution_id_fkey"
            columns: ["task_execution_id"]
            isOneToOne: false
            referencedRelation: "task_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_reviews: {
        Row: {
          action: string
          created_at: string
          evidence_id: string
          id: string
          note: string | null
          reviewer_id: string
        }
        Insert: {
          action: string
          created_at?: string
          evidence_id: string
          id?: string
          note?: string | null
          reviewer_id: string
        }
        Update: {
          action?: string
          created_at?: string
          evidence_id?: string
          id?: string
          note?: string | null
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_reviews_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidences"
            referencedColumns: ["id"]
          },
        ]
      }
      evidences: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          reference_path: string | null
          shift_id: string | null
          status: string
          storage_path: string
          submitted_at: string
          submitted_by: string | null
          task_execution_id: string
          task_id: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          reference_path?: string | null
          shift_id?: string | null
          status?: string
          storage_path: string
          submitted_at?: string
          submitted_by?: string | null
          task_execution_id: string
          task_id?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          reference_path?: string | null
          shift_id?: string | null
          status?: string
          storage_path?: string
          submitted_at?: string
          submitted_by?: string | null
          task_execution_id?: string
          task_id?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidences_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_task_execution_id_fkey"
            columns: ["task_execution_id"]
            isOneToOne: false
            referencedRelation: "analytics_critical_failures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_task_execution_id_fkey"
            columns: ["task_execution_id"]
            isOneToOne: false
            referencedRelation: "analytics_overdue_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_task_execution_id_fkey"
            columns: ["task_execution_id"]
            isOneToOne: false
            referencedRelation: "task_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidences_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          first_name: string | null
          id: string
          is_admin: boolean | null
          last_name: string | null
          plan_type: string | null
          settings: Json | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id: string
          is_admin?: boolean | null
          last_name?: string | null
          plan_type?: string | null
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          first_name?: string | null
          id?: string
          is_admin?: boolean | null
          last_name?: string | null
          plan_type?: string | null
          settings?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      public_rate_limits: {
        Row: {
          action: string
          hits: number
          key_hash: string
          window_start: string
        }
        Insert: {
          action: string
          hits?: number
          key_hash: string
          window_start: string
        }
        Update: {
          action?: string
          hits?: number
          key_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          created_at: string
          end_time: string
          id: string
          name: string
          sort_order: number
          start_time: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          name: string
          sort_order?: number
          start_time: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          sort_order?: number
          start_time?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          verification_token: string | null
          verified: boolean
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          verification_token?: string | null
          verified?: boolean
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          verification_token?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      signup_otps: {
        Row: {
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          session_expires_at: string | null
          session_token_hash: string | null
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          session_expires_at?: string | null
          session_token_hash?: string | null
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          session_expires_at?: string | null
          session_token_hash?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      system_updates: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: []
      }
      task_executions: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string
          executed_at: string | null
          executed_by: string | null
          id: string
          notes: string | null
          organization_id: string
          scheduled_at: string
          shift_id: string | null
          status: Database["public"]["Enums"]["execution_status"]
          task_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          scheduled_at: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
          task_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          scheduled_at?: string
          shift_id?: string | null
          status?: Database["public"]["Enums"]["execution_status"]
          task_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_executions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_executions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          active_from: string
          ai_review_mode: string
          code: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          organization_id: string
          reference_path: string | null
          scheduled_time: string | null
          shift_id: string | null
          title: string
          unit_id: string
          updated_at: string
          vision_analysis_enabled: boolean
          vision_fallback_mode: string
          vision_model_id: string | null
          vision_provider: string
          visual_criteria: Json
          weight: Database["public"]["Enums"]["task_weight"]
        }
        Insert: {
          active_from?: string
          ai_review_mode?: string
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          reference_path?: string | null
          scheduled_time?: string | null
          shift_id?: string | null
          title: string
          unit_id: string
          updated_at?: string
          vision_analysis_enabled?: boolean
          vision_fallback_mode?: string
          vision_model_id?: string | null
          vision_provider?: string
          visual_criteria?: Json
          weight?: Database["public"]["Enums"]["task_weight"]
        }
        Update: {
          active_from?: string
          ai_review_mode?: string
          code?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          reference_path?: string | null
          scheduled_time?: string | null
          shift_id?: string | null
          title?: string
          unit_id?: string
          updated_at?: string
          vision_analysis_enabled?: boolean
          vision_fallback_mode?: string
          vision_model_id?: string | null
          vision_provider?: string
          visual_criteria?: Json
          weight?: Database["public"]["Enums"]["task_weight"]
        }
        Relationships: [
          {
            foreignKeyName: "tasks_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_vision_model_id_fkey"
            columns: ["vision_model_id"]
            isOneToOne: false
            referencedRelation: "vision_anomaly_models"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          address: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_domains: {
        Row: {
          created_at: string
          dkim_verified: boolean | null
          dns_verification_record: string | null
          domain: string
          id: string
          return_path_verified: boolean | null
          spf_verified: boolean | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dkim_verified?: boolean | null
          dns_verification_record?: string | null
          domain: string
          id?: string
          return_path_verified?: boolean | null
          spf_verified?: boolean | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dkim_verified?: boolean | null
          dns_verification_record?: string | null
          domain?: string
          id?: string
          return_path_verified?: boolean | null
          spf_verified?: boolean | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          shift_id: string | null
          unit_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          shift_id?: string | null
          unit_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          shift_id?: string | null
          unit_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_anomaly_models: {
        Row: {
          activated_at: string | null
          algorithm: string | null
          anomalous_test_image_count: number | null
          created_at: string
          id: string
          input_height: number | null
          input_width: number | null
          metrics: Json
          model_storage_path: string | null
          name: string
          normal_image_count: number | null
          organization_id: string | null
          provider: string
          retired_at: string | null
          slug: string
          status: string
          task_category: string | null
          threshold: number | null
          training_dataset_version: string | null
          updated_at: string
          version: string
        }
        Insert: {
          activated_at?: string | null
          algorithm?: string | null
          anomalous_test_image_count?: number | null
          created_at?: string
          id?: string
          input_height?: number | null
          input_width?: number | null
          metrics?: Json
          model_storage_path?: string | null
          name: string
          normal_image_count?: number | null
          organization_id?: string | null
          provider?: string
          retired_at?: string | null
          slug: string
          status?: string
          task_category?: string | null
          threshold?: number | null
          training_dataset_version?: string | null
          updated_at?: string
          version?: string
        }
        Update: {
          activated_at?: string | null
          algorithm?: string | null
          anomalous_test_image_count?: number | null
          created_at?: string
          id?: string
          input_height?: number | null
          input_width?: number | null
          metrics?: Json
          model_storage_path?: string | null
          name?: string
          normal_image_count?: number | null
          organization_id?: string | null
          provider?: string
          retired_at?: string | null
          slug?: string
          status?: string
          task_category?: string | null
          threshold?: number | null
          training_dataset_version?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      vision_curated_images: {
        Row: {
          block_id: string | null
          checklist_evidence_id: string | null
          checklist_id: string | null
          classification: string
          created_at: string
          curated_storage_path: string | null
          dataset_id: string
          dataset_version: string | null
          evidence_id: string | null
          id: string
          note: string | null
          organization_id: string | null
          response_id: string | null
          reviewed_at: string
          reviewed_by: string | null
          sha256: string | null
          source_storage_path: string
          split: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          block_id?: string | null
          checklist_evidence_id?: string | null
          checklist_id?: string | null
          classification: string
          created_at?: string
          curated_storage_path?: string | null
          dataset_id: string
          dataset_version?: string | null
          evidence_id?: string | null
          id?: string
          note?: string | null
          organization_id?: string | null
          response_id?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          sha256?: string | null
          source_storage_path: string
          split?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          block_id?: string | null
          checklist_evidence_id?: string | null
          checklist_id?: string | null
          classification?: string
          created_at?: string
          curated_storage_path?: string | null
          dataset_id?: string
          dataset_version?: string | null
          evidence_id?: string | null
          id?: string
          note?: string | null
          organization_id?: string | null
          response_id?: string | null
          reviewed_at?: string
          reviewed_by?: string | null
          sha256?: string | null
          source_storage_path?: string
          split?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_curated_images_checklist_evidence_id_fkey"
            columns: ["checklist_evidence_id"]
            isOneToOne: false
            referencedRelation: "checklist_evidences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vision_curated_images_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "vision_datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vision_curated_images_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidences"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_dataset_snapshot_images: {
        Row: {
          category: string
          checklist_evidence_id: string | null
          checklist_id: string | null
          classification: string
          created_at: string
          curated_image_id: string
          evidence_id: string | null
          group_key: string
          id: string
          response_id: string | null
          sha256: string
          snapshot_id: string
          source_storage_path: string
          split: string
        }
        Insert: {
          category: string
          checklist_evidence_id?: string | null
          checklist_id?: string | null
          classification: string
          created_at?: string
          curated_image_id: string
          evidence_id?: string | null
          group_key: string
          id?: string
          response_id?: string | null
          sha256: string
          snapshot_id: string
          source_storage_path: string
          split: string
        }
        Update: {
          category?: string
          checklist_evidence_id?: string | null
          checklist_id?: string | null
          classification?: string
          created_at?: string
          curated_image_id?: string
          evidence_id?: string | null
          group_key?: string
          id?: string
          response_id?: string | null
          sha256?: string
          snapshot_id?: string
          source_storage_path?: string
          split?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_dataset_snapshot_images_curated_image_id_fkey"
            columns: ["curated_image_id"]
            isOneToOne: false
            referencedRelation: "vision_curated_images"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vision_dataset_snapshot_images_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "vision_dataset_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_dataset_snapshots: {
        Row: {
          anomalous_count: number
          created_at: string
          created_by: string | null
          dataset_id: string
          id: string
          ignored_count: number
          image_count: number
          normal_count: number
          note: string | null
          organization_id: string | null
          seed: number
          test_anomalous_count: number
          test_normal_count: number
          train_normal_count: number
          validation_anomalous_count: number
          validation_normal_count: number
          version: string
        }
        Insert: {
          anomalous_count?: number
          created_at?: string
          created_by?: string | null
          dataset_id: string
          id?: string
          ignored_count?: number
          image_count?: number
          normal_count?: number
          note?: string | null
          organization_id?: string | null
          seed: number
          test_anomalous_count?: number
          test_normal_count?: number
          train_normal_count?: number
          validation_anomalous_count?: number
          validation_normal_count?: number
          version: string
        }
        Update: {
          anomalous_count?: number
          created_at?: string
          created_by?: string | null
          dataset_id?: string
          id?: string
          ignored_count?: number
          image_count?: number
          normal_count?: number
          note?: string | null
          organization_id?: string | null
          seed?: number
          test_anomalous_count?: number
          test_normal_count?: number
          train_normal_count?: number
          validation_anomalous_count?: number
          validation_normal_count?: number
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_dataset_snapshots_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "vision_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_datasets: {
        Row: {
          anomaly_instructions: string | null
          created_at: string
          created_by: string | null
          description: string | null
          examples: string | null
          id: string
          min_anomalous_recommended: number
          min_normal_recommended: number
          min_normal_technical: number
          name: string
          normal_instructions: string | null
          public_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          anomaly_instructions?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          examples?: string | null
          id?: string
          min_anomalous_recommended?: number
          min_normal_recommended?: number
          min_normal_technical?: number
          name: string
          normal_instructions?: string | null
          public_id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          anomaly_instructions?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          examples?: string | null
          id?: string
          min_anomalous_recommended?: number
          min_normal_recommended?: number
          min_normal_technical?: number
          name?: string
          normal_instructions?: string | null
          public_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      vision_model_audit: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event: string
          id: string
          model_version_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: string
          model_version_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          model_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_model_audit_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "vision_model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_model_runs: {
        Row: {
          algorithm: string
          artifact_path: string | null
          completed_at: string | null
          created_at: string
          current_step: string | null
          error_message: string | null
          id: string
          job_id: string | null
          metrics: Json
          model_version_id: string
          private_logs: Json
          progress: number | null
          public_message: string | null
          started_at: string | null
          status: string
          threshold: number | null
          updated_at: string
        }
        Insert: {
          algorithm: string
          artifact_path?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          metrics?: Json
          model_version_id: string
          private_logs?: Json
          progress?: number | null
          public_message?: string | null
          started_at?: string | null
          status?: string
          threshold?: number | null
          updated_at?: string
        }
        Update: {
          algorithm?: string
          artifact_path?: string | null
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          metrics?: Json
          model_version_id?: string
          private_logs?: Json
          progress?: number | null
          public_message?: string | null
          started_at?: string | null
          status?: string
          threshold?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_model_runs_model_version_id_fkey"
            columns: ["model_version_id"]
            isOneToOne: false
            referencedRelation: "vision_model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_model_versions: {
        Row: {
          activated_at: string | null
          activated_model_id: string | null
          algorithm: string | null
          approval_exception_reason: string | null
          approved_at: string | null
          approved_by: string | null
          artifact_path: string | null
          created_at: string
          current_step: string | null
          dataset_id: string
          dispatched_to_service_at: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          initiated_by: string | null
          input_height: number | null
          input_width: number | null
          job_id: string | null
          metrics: Json
          note: string | null
          organization_id: string | null
          private_logs: Json
          progress: number | null
          public_message: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          retired_at: string | null
          run_token_created_at: string | null
          run_token_expires_at: string | null
          run_token_hash: string | null
          selected_run_id: string | null
          snapshot_id: string
          started_at: string | null
          status: string
          threshold: number | null
          updated_at: string
          version: string
        }
        Insert: {
          activated_at?: string | null
          activated_model_id?: string | null
          algorithm?: string | null
          approval_exception_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          artifact_path?: string | null
          created_at?: string
          current_step?: string | null
          dataset_id: string
          dispatched_to_service_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          input_height?: number | null
          input_width?: number | null
          job_id?: string | null
          metrics?: Json
          note?: string | null
          organization_id?: string | null
          private_logs?: Json
          progress?: number | null
          public_message?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          retired_at?: string | null
          run_token_created_at?: string | null
          run_token_expires_at?: string | null
          run_token_hash?: string | null
          selected_run_id?: string | null
          snapshot_id: string
          started_at?: string | null
          status?: string
          threshold?: number | null
          updated_at?: string
          version: string
        }
        Update: {
          activated_at?: string | null
          activated_model_id?: string | null
          algorithm?: string | null
          approval_exception_reason?: string | null
          approved_at?: string | null
          approved_by?: string | null
          artifact_path?: string | null
          created_at?: string
          current_step?: string | null
          dataset_id?: string
          dispatched_to_service_at?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          initiated_by?: string | null
          input_height?: number | null
          input_width?: number | null
          job_id?: string | null
          metrics?: Json
          note?: string | null
          organization_id?: string | null
          private_logs?: Json
          progress?: number | null
          public_message?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          retired_at?: string | null
          run_token_created_at?: string | null
          run_token_expires_at?: string | null
          run_token_hash?: string | null
          selected_run_id?: string | null
          snapshot_id?: string
          started_at?: string | null
          status?: string
          threshold?: number | null
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_model_versions_activated_model_id_fkey"
            columns: ["activated_model_id"]
            isOneToOne: false
            referencedRelation: "vision_anomaly_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vision_model_versions_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "vision_datasets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vision_model_versions_selected_run_fkey"
            columns: ["selected_run_id", "id"]
            isOneToOne: false
            referencedRelation: "vision_model_runs"
            referencedColumns: ["id", "model_version_id"]
          },
          {
            foreignKeyName: "vision_model_versions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "vision_dataset_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_card_meta: {
        Row: {
          assignee: string | null
          card_id: string
          card_type: string
          content: Json
          created_at: string
          due_date: string | null
          emoji: string | null
          id: string
          priority: string | null
          status: string | null
          tags: string[] | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee?: string | null
          card_id: string
          card_type: string
          content?: Json
          created_at?: string
          due_date?: string | null
          emoji?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee?: string | null
          card_id?: string
          card_type?: string
          content?: Json
          created_at?: string
          due_date?: string | null
          emoji?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_card_meta_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_categories: {
        Row: {
          color: string | null
          created_at: string
          icon_name: string | null
          id: string
          name: string
          position: number | null
          updated_at: string
          view_type: string | null
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon_name?: string | null
          id?: string
          name: string
          position?: number | null
          updated_at?: string
          view_type?: string | null
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon_name?: string | null
          id?: string
          name?: string
          position?: number | null
          updated_at?: string
          view_type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string | null
          workspace_id: string
          ws_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
          ws_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
          ws_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_ws_id_fkey"
            columns: ["ws_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_tasks: {
        Row: {
          category_id: string | null
          created_at: string
          created_by: string | null
          id: string
          position: number | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "workspace_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          icon: string | null
          icon_url: string | null
          id: string
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      analytics_critical_failures: {
        Row: {
          id: string | null
          organization_id: string | null
          scheduled_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["execution_status"] | null
          task_id: string | null
          title: string | null
          unit_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_executions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_executions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily_compliance: {
        Row: {
          compliance_pct: number | null
          critical_missed: number | null
          day: string | null
          organization_id: string | null
          overdue_count: number | null
          shift_id: string | null
          unit_id: string | null
          weight_done: number | null
          weight_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_executions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_executions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_overdue_tasks: {
        Row: {
          id: string | null
          organization_id: string | null
          scheduled_at: string | null
          shift_id: string | null
          status: Database["public"]["Enums"]["execution_status"] | null
          task_id: string | null
          title: string | null
          unit_id: string | null
          weight: Database["public"]["Enums"]["task_weight"] | null
        }
        Relationships: [
          {
            foreignKeyName: "task_executions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_executions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_executions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_unit_daily_compliance: {
        Row: {
          completed_late: number | null
          completed_on_time: number | null
          completed_tasks: number | null
          compliance_percentage: number | null
          critical_failures: number | null
          delayed_tasks: number | null
          due_completed_tasks: number | null
          due_compliance_percentage: number | null
          due_weight_done: number | null
          due_weight_total: number | null
          on_time_compliance_percentage: number | null
          organization_id: string | null
          overdue_open_tasks: number | null
          pending_evidence_reviews: number | null
          pending_evidences: number | null
          reference_date: string | null
          total_due_tasks: number | null
          total_scheduled_tasks: number | null
          unit_id: string | null
          unit_name: string | null
          weight_done: number | null
          weight_done_on_time: number | null
          weight_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_executions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_unit_ranking: {
        Row: {
          compliance_pct: number | null
          critical_missed: number | null
          organization_id: string | null
          overdue_count: number | null
          unit_id: string | null
          unit_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_executions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_model_version: {
        Args: {
          p_exception_reason?: string
          p_run_id: string
          p_version_id: string
        }
        Returns: {
          model_id: string
          version: string
        }[]
      }
      can_access_unit: {
        Args: { _org_id: string; _unit_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_vision_training: {
        Args: { _user_id: string }
        Returns: boolean
      }
      claim_checklist_analysis: {
        Args: { p_analysis_id: string }
        Returns: {
          claimed: boolean
          current_status: string
        }[]
      }
      claim_evidence_for_analysis: {
        Args: { p_evidence_id: string }
        Returns: {
          claimed: boolean
          current_status: string
        }[]
      }
      cleanup_expired_responses: { Args: never; Returns: undefined }
      create_checklist_evidence_attempt: {
        Args: {
          p_block_id: string
          p_checklist_id: string
          p_evidence_id: string
          p_max_attempts?: number
          p_mime_type: string
          p_response_id: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: {
          attempt_number: number
          evidence_id: string
          previous_evidence_id: string
          storage_path: string
        }[]
      }
      generate_dataset_public_id: { Args: never; Returns: string }
      generate_short_slug: { Args: { length?: number }; Returns: string }
      get_user_email_by_id: { Args: { user_uuid: string }; Returns: string }
      get_user_id_by_email: {
        Args: { email_to_find: string }
        Returns: {
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hit_public_rate_limit: {
        Args: {
          p_action: string
          p_key_hash: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          current_hits: number
        }[]
      }
      import_legacy_checklist_photos: {
        Args: never
        Returns: {
          found: number
          migrated: number
          skipped: number
          unmapped: number
        }[]
      }
      is_reviewer: { Args: { _user_id: string }; Returns: boolean }
      materialize_task_executions: { Args: never; Returns: number }
      prepare_model_version: {
        Args: { p_dataset_id: string; p_note?: string; p_seed?: number }
        Returns: {
          run_token: string
          run_token_expires_at: string
          snapshot_id: string
          version: string
          version_id: string
        }[]
      }
      publish_checklist: {
        Args: { p_checklist_id: string }
        Returns: {
          id: string
          published_at: string
        }[]
      }
      reject_model_version: {
        Args: { p_reason: string; p_version_id: string }
        Returns: undefined
      }
      resolve_model_version_run_token: {
        Args: { p_token: string }
        Returns: {
          dataset_id: string
          organization_id: string
          snapshot_id: string
          version_id: string
        }[]
      }
      revoke_model_version_run_token: {
        Args: { p_reason?: string; p_version_id: string }
        Returns: undefined
      }
      rotate_model_version_run_token: {
        Args: { p_reason?: string; p_version_id: string }
        Returns: {
          run_token: string
          run_token_expires_at: string
        }[]
      }
      update_checklist_retention: {
        Args: {
          p_checklist_id: string
          p_is_enabled: boolean
          p_retention_days: number
        }
        Returns: undefined
      }
      user_has_workspace_access: {
        Args: { p_min_role?: string; p_u_id: string; p_ws_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "funcionario"
        | "gerente"
        | "supervisor"
        | "franqueadora"
        | "admin"
        | "auditor"
      checklist_evidence_analysis_status:
        | "pending"
        | "processing"
        | "normal"
        | "anomalous"
        | "manual_review"
        | "failed"
      checklist_response_status: "in_progress" | "submitted"
      execution_status: "pending" | "done" | "late" | "skipped" | "cancelled"
      task_weight: "comum" | "importante" | "critica"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "funcionario",
        "gerente",
        "supervisor",
        "franqueadora",
        "admin",
        "auditor",
      ],
      checklist_evidence_analysis_status: [
        "pending",
        "processing",
        "normal",
        "anomalous",
        "manual_review",
        "failed",
      ],
      checklist_response_status: ["in_progress", "submitted"],
      execution_status: ["pending", "done", "late", "skipped", "cancelled"],
      task_weight: ["comum", "importante", "critica"],
    },
  },
} as const
