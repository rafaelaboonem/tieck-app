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
          upload_token_expires_at: string | null
          upload_token_hash: string | null
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
          upload_token_expires_at?: string | null
          upload_token_hash?: string | null
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
          upload_token_expires_at?: string | null
          upload_token_hash?: string | null
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
      vision_lab_attempts: {
        Row: {
          created_at: string
          failures: number
          id: string
          result: Json | null
          session_id: string
          standard_id: string | null
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          failures?: number
          id?: string
          result?: Json | null
          session_id: string
          standard_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          failures?: number
          id?: string
          result?: Json | null
          session_id?: string
          standard_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_lab_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "vision_lab_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      vision_lab_sessions: {
        Row: {
          attempts_created: number
          block_id: string | null
          created_at: string
          expires_at: string
          final_calls: number
          last_call_at: string | null
          last_live_at: string | null
          live_calls: number
          response_id: string | null
          session_id: string
          standard_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          attempts_created?: number
          block_id?: string | null
          created_at?: string
          expires_at: string
          final_calls?: number
          last_call_at?: string | null
          last_live_at?: string | null
          live_calls?: number
          response_id?: string | null
          session_id: string
          standard_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          attempts_created?: number
          block_id?: string | null
          created_at?: string
          expires_at?: string
          final_calls?: number
          last_call_at?: string | null
          last_live_at?: string | null
          live_calls?: number
          response_id?: string | null
          session_id?: string
          standard_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_lab_sessions_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "visual_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vision_lab_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          lock_key: string
          operation: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          lock_key: string
          operation: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          lock_key?: string
          operation?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      vision_session_usage: {
        Row: {
          created_at: string
          final_calls: number
          last_call_at: string | null
          live_calls: number
          session_id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          final_calls?: number
          last_call_at?: string | null
          live_calls?: number
          session_id: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          final_calls?: number
          last_call_at?: string | null
          live_calls?: number
          session_id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_session_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vision_usage_daily: {
        Row: {
          calls: number
          calls_without_usage: number
          created_at: string
          day: string
          estimated_neurons: number | null
          input_tokens: number | null
          model_id: string
          output_tokens: number | null
          workspace_id: string
        }
        Insert: {
          calls?: number
          calls_without_usage?: number
          created_at?: string
          day: string
          estimated_neurons?: number | null
          input_tokens?: number | null
          model_id: string
          output_tokens?: number | null
          workspace_id: string
        }
        Update: {
          calls?: number
          calls_without_usage?: number
          created_at?: string
          day?: string
          estimated_neurons?: number | null
          input_tokens?: number | null
          model_id?: string
          output_tokens?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      vision_usage_events: {
        Row: {
          action: string
          attempt_id: string | null
          cached_tokens: number | null
          confidence: number | null
          cost_usd: number | null
          created_at: string
          decision: string | null
          estimated_neurons: number | null
          id: string
          inference_ms: number
          input_tokens: number | null
          model_id: string
          output_tokens: number | null
          provider: string
          session_id: string
          standard_id: string | null
          step: string
          usage_missing: boolean
          user_id: string
          workspace_id: string
        }
        Insert: {
          action: string
          attempt_id?: string | null
          cached_tokens?: number | null
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string
          decision?: string | null
          estimated_neurons?: number | null
          id?: string
          inference_ms?: number
          input_tokens?: number | null
          model_id: string
          output_tokens?: number | null
          provider?: string
          session_id: string
          standard_id?: string | null
          step: string
          usage_missing?: boolean
          user_id: string
          workspace_id: string
        }
        Update: {
          action?: string
          attempt_id?: string | null
          cached_tokens?: number | null
          confidence?: number | null
          cost_usd?: number | null
          created_at?: string
          decision?: string | null
          estimated_neurons?: number | null
          id?: string
          inference_ms?: number
          input_tokens?: number | null
          model_id?: string
          output_tokens?: number | null
          provider?: string
          session_id?: string
          standard_id?: string | null
          step?: string
          usage_missing?: boolean
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vision_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      visual_standards: {
        Row: {
          accuracy: number | null
          archived_at: string | null
          camera_block_id: string | null
          checklist_id: string | null
          confidence_threshold: number
          created_at: string
          created_by: string
          id: string
          internal_notes: string | null
          internal_profile: Json
          last_validated_at: string | null
          name: string
          needs_validation: boolean
          profile_version: number
          question: string
          reference_path: string | null
          reformulation_suggestion: Json
          required_evidence_count: number
          status: string
          test_count: number
          unverifiable_conditions: Json
          updated_at: string
          validated_question: string | null
          visual_verifiability: string | null
          workspace_id: string
        }
        Insert: {
          accuracy?: number | null
          archived_at?: string | null
          camera_block_id?: string | null
          checklist_id?: string | null
          confidence_threshold?: number
          created_at?: string
          created_by: string
          id?: string
          internal_notes?: string | null
          internal_profile?: Json
          last_validated_at?: string | null
          name: string
          needs_validation?: boolean
          profile_version?: number
          question: string
          reference_path?: string | null
          reformulation_suggestion?: Json
          required_evidence_count?: number
          status?: string
          test_count?: number
          unverifiable_conditions?: Json
          updated_at?: string
          validated_question?: string | null
          visual_verifiability?: string | null
          workspace_id: string
        }
        Update: {
          accuracy?: number | null
          archived_at?: string | null
          camera_block_id?: string | null
          checklist_id?: string | null
          confidence_threshold?: number
          created_at?: string
          created_by?: string
          id?: string
          internal_notes?: string | null
          internal_profile?: Json
          last_validated_at?: string | null
          name?: string
          needs_validation?: boolean
          profile_version?: number
          question?: string
          reference_path?: string | null
          reformulation_suggestion?: Json
          required_evidence_count?: number
          status?: string
          test_count?: number
          unverifiable_conditions?: Json
          updated_at?: string
          validated_question?: string | null
          visual_verifiability?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visual_standards_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visual_standards_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
      acquire_vision_lock: {
        Args: {
          p_operation: string
          p_ttl_seconds?: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          acquired: boolean
          key: string
        }[]
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
      cleanup_expired_signup_otps: { Args: never; Returns: number }
      consume_signup_verification: {
        Args: { p_email: string; p_token: string }
        Returns: {
          status: string
        }[]
      }
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
      get_public_checklist: {
        Args: { p_public_id: string }
        Returns: {
          blocks: Json
          custom_slug: string
          description: string
          id: string
          published_at: string
          settings: Json
          short_slug: string
          title: string
        }[]
      }
      get_user_email_by_id: { Args: { user_uuid: string }; Returns: string }
      get_user_id_by_email: {
        Args: { email_to_find: string }
        Returns: {
          user_id: string
        }[]
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
      materialize_task_executions: { Args: never; Returns: number }
      provision_signup_account: {
        Args: { p_display_name: string; p_user_id: string }
        Returns: string
      }
      publish_checklist: {
        Args: { p_checklist_id: string }
        Returns: {
          id: string
          published_at: string
        }[]
      }
      release_vision_lock: { Args: { p_lock_key: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      signup_account_state: { Args: { p_user_id: string }; Returns: string }
      submit_public_response: {
        Args: { p_answers: Json; p_public_id: string }
        Returns: {
          checklist_id: string
          response_id: string
          upload_token: string
          upload_token_expires_at: string
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
      vision_lab_attempt_claim: {
        Args: {
          p_attempt_id: string
          p_max_failures?: number
          p_user_id: string
        }
        Returns: {
          cached: Json
          claimed: boolean
          reason: string
        }[]
      }
      vision_lab_attempt_create: {
        Args: {
          p_max_attempts?: number
          p_session_id: string
          p_user_id: string
        }
        Returns: {
          attempt_id: string
          attempts_used: number
          reason: string
        }[]
      }
      vision_lab_attempt_finish: {
        Args: {
          p_attempt_id: string
          p_result: Json
          p_technical_failure?: boolean
          p_user_id: string
        }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      vision_lab_session_consume: {
        Args: {
          p_kind: string
          p_limit: number
          p_min_interval_ms?: number
          p_session_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          allowed: boolean
          reason: string
          remaining: number
          used: number
        }[]
      }
      vision_lab_session_start: {
        Args: {
          p_hourly_limit?: number
          p_standard_id: string
          p_ttl_seconds?: number
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          attempts_used: number
          expires_at: string
          final_used: number
          live_used: number
          reason: string
          reused: boolean
          session_id: string
        }[]
      }
      vision_session_consume: {
        Args: {
          p_kind: string
          p_limit: number
          p_min_interval_ms?: number
          p_session_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          allowed: boolean
          reason: string
          remaining: number
          used: number
        }[]
      }
      vision_telemetry_retention: {
        Args: { p_days?: number }
        Returns: {
          aggregated: number
          deleted: number
        }[]
      }
    }
    Enums: {
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
