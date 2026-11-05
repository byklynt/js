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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_alerts: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          provider_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          provider_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_alerts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_backup_codes: {
        Row: {
          admin_id: string
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          admin_id: string
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
        }
        Update: {
          admin_id?: string
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_backup_codes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_backup_codes_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_sessions: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          ip: string
          last_seen_at: string
          revoked_at: string | null
          user_agent: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          ip?: string
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          ip?: string
          last_seen_at?: string
          revoked_at?: string | null
          user_agent?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "admin_sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          seen_at: string
          user_id: string
        }
        Insert: {
          seen_at?: string
          user_id: string
        }
        Update: {
          seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "announcement_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          active: boolean
          audience: string
          body: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          level: string
          placements: string[]
          publish_at: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience?: string
          body: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          level?: string
          placements?: string[]
          publish_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          level?: string
          placements?: string[]
          publish_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "api_keys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          admin_name: string
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          admin_name: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          admin_name?: string
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_ledger: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string
          id: string
          note: string
          ref_id: string
          ref_type: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          ref_id: string
          ref_type: string
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string
          id?: string
          note?: string
          ref_id?: string
          ref_type?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "balance_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "balance_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancel_requests: {
        Row: {
          age_hours: number | null
          calculated_refund: number | null
          created_at: string
          id: string
          order_id: number
          policy_percent: number | null
          provider_request_id: string | null
          reject_reason: string | null
          remains_at_request: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          age_hours?: number | null
          calculated_refund?: number | null
          created_at?: string
          id?: string
          order_id: number
          policy_percent?: number | null
          provider_request_id?: string | null
          reject_reason?: string | null
          remains_at_request?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          age_hours?: number | null
          calculated_refund?: number | null
          created_at?: string
          id?: string
          order_id?: number
          policy_percent?: number | null
          provider_request_id?: string | null
          reject_reason?: string | null
          remains_at_request?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancel_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancel_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "cancel_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deposits: {
        Row: {
          amount: number
          bonus: number
          created_at: string
          external_id: string | null
          id: string
          method: string
          proof: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          bonus?: number
          created_at?: string
          external_id?: string | null
          id?: string
          method: string
          proof?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          bonus?: number
          created_at?: string
          external_id?: string | null
          id?: string
          method?: string
          proof?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "deposits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          service_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          service_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          service_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "catalogue_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string | null
          href: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string | null
          href?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          accepted_rules_version: string | null
          cancel_policy_percent: number | null
          cancelled_by: string | null
          charge: number
          completed_at: string | null
          created_at: string
          held: boolean
          id: number
          last_synced_at: string | null
          link: string
          link_normalized: string | null
          needs_manual_check: boolean
          provider_cost: number
          provider_id: string
          provider_order_id: string
          quantity: number
          refunded_amount: number
          remains: number
          service_id: string
          start_count: number
          status: string
          submit_attempts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_rules_version?: string | null
          cancel_policy_percent?: number | null
          cancelled_by?: string | null
          charge: number
          completed_at?: string | null
          created_at?: string
          held?: boolean
          id?: number
          last_synced_at?: string | null
          link: string
          link_normalized?: string | null
          needs_manual_check?: boolean
          provider_cost?: number
          provider_id: string
          provider_order_id?: string
          quantity: number
          refunded_amount?: number
          remains?: number
          service_id: string
          start_count?: number
          status?: string
          submit_attempts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_rules_version?: string | null
          cancel_policy_percent?: number | null
          cancelled_by?: string | null
          charge?: number
          completed_at?: string | null
          created_at?: string
          held?: boolean
          id?: number
          last_synced_at?: string | null
          link?: string
          link_normalized?: string | null
          needs_manual_check?: boolean
          provider_cost?: number
          provider_id?: string
          provider_order_id?: string
          quantity?: number
          refunded_amount?: number
          remains?: number
          service_id?: string
          start_count?: number
          status?: string
          submit_attempts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "catalogue_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_updates: {
        Row: {
          created_at: string
          detail: string
          id: string
          name: string
          platform: string
          service_id: string
          type: string
        }
        Insert: {
          created_at?: string
          detail?: string
          id?: string
          name: string
          platform: string
          service_id: string
          type: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          name?: string
          platform?: string
          service_id?: string
          type?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance: number
          created_at: string
          email: string
          flagged: boolean
          id: string
          language: string
          last_login_at: string | null
          manual_approval: boolean
          prefs: Json
          rank: string
          referral_code: string
          referred_by: string | null
          role: string
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          email: string
          flagged?: boolean
          id: string
          language?: string
          last_login_at?: string | null
          manual_approval?: boolean
          prefs?: Json
          rank?: string
          referral_code?: string
          referred_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          balance?: number
          created_at?: string
          email?: string
          flagged?: boolean
          id?: string
          language?: string
          last_login_at?: string | null
          manual_approval?: boolean
          prefs?: Json
          rank?: string
          referral_code?: string
          referred_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_sync_runs: {
        Row: {
          error_message: string | null
          errors: number
          finished_at: string
          id: string
          orders_changed: number
          orders_checked: number
          provider_id: string
          started_at: string
        }
        Insert: {
          error_message?: string | null
          errors?: number
          finished_at: string
          id?: string
          orders_changed?: number
          orders_checked?: number
          provider_id: string
          started_at: string
        }
        Update: {
          error_message?: string | null
          errors?: number
          finished_at?: string
          id?: string
          orders_changed?: number
          orders_checked?: number
          provider_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_sync_runs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      providers: {
        Row: {
          active: boolean
          api_key_encrypted: string | null
          api_url: string
          balance_at: string | null
          balance_idr: number | null
          balance_native: number | null
          created_at: string
          currency: string
          exchange_rate: number | null
          id: string
          last_sync_at: string | null
          last_test: Json | null
          low_balance_threshold: number
          mode: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          api_key_encrypted?: string | null
          api_url?: string
          balance_at?: string | null
          balance_idr?: number | null
          balance_native?: number | null
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          last_sync_at?: string | null
          last_test?: Json | null
          low_balance_threshold?: number
          mode?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          api_key_encrypted?: string | null
          api_url?: string
          balance_at?: string | null
          balance_idr?: number | null
          balance_native?: number | null
          created_at?: string
          currency?: string
          exchange_rate?: number | null
          id?: string
          last_sync_at?: string | null
          last_test?: Json | null
          low_balance_threshold?: number
          mode?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits?: number
          key: string
          window_start?: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      refill_requests: {
        Row: {
          created_at: string
          id: string
          order_id: number
          provider_request_id: string | null
          reject_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: number
          provider_request_id?: string | null
          reject_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: number
          provider_request_id?: string | null
          reject_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refill_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refill_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "refill_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount: number
          cancel_request_id: string | null
          created_at: string
          id: string
          note: string | null
          order_id: number
          overridden: boolean
          policy_percent: number | null
          processed_at: string | null
          processed_by: string | null
          reason: string
          reject_reason: string | null
          reversed: boolean
          source: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          cancel_request_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: number
          overridden?: boolean
          policy_percent?: number | null
          processed_at?: string | null
          processed_by?: string | null
          reason: string
          reject_reason?: string | null
          reversed?: boolean
          source: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          cancel_request_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: number
          overridden?: boolean
          policy_percent?: number | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string
          reject_reason?: string | null
          reversed?: boolean
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "refunds_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sanity_runs: {
        Row: {
          balance_mismatches: number
          created_at: string
          discrepancies: number
          id: string
          refund_mismatches: number
          stuck: number
        }
        Insert: {
          balance_mismatches?: number
          created_at?: string
          discrepancies?: number
          id?: string
          refund_mismatches?: number
          stuck?: number
        }
        Update: {
          balance_mismatches?: number
          created_at?: string
          discrepancies?: number
          id?: string
          refund_mismatches?: number
          stuck?: number
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          platform: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          label: string
          platform: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          platform?: string
          sort_order?: number
        }
        Relationships: []
      }
      service_rules: {
        Row: {
          bullets: string[]
          label: string
          platform: string
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          bullets?: string[]
          label: string
          platform: string
          title: string
          updated_at?: string
          version: string
        }
        Update: {
          bullets?: string[]
          label?: string
          platform?: string
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          avg_time: string | null
          badges: string[]
          cancel: boolean
          category_id: string
          created_at: string
          description: Json
          id: string
          imported: boolean
          markup_type: string
          markup_value: number
          max: number
          min: number
          name: string
          platform: string
          price_per_1000: number
          provider_id: string
          provider_name: string | null
          provider_price: number
          provider_removed: boolean
          provider_service_id: string
          provider_type: string | null
          rate_provider: number
          refill: boolean
          refill_days: number | null
          sort_order: number
          speed: number | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avg_time?: string | null
          badges?: string[]
          cancel?: boolean
          category_id: string
          created_at?: string
          description?: Json
          id: string
          imported?: boolean
          markup_type?: string
          markup_value?: number
          max?: number
          min?: number
          name: string
          platform: string
          price_per_1000?: number
          provider_id: string
          provider_name?: string | null
          provider_price?: number
          provider_removed?: boolean
          provider_service_id: string
          provider_type?: string | null
          rate_provider?: number
          refill?: boolean
          refill_days?: number | null
          sort_order?: number
          speed?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avg_time?: string | null
          badges?: string[]
          cancel?: boolean
          category_id?: string
          created_at?: string
          description?: Json
          id?: string
          imported?: boolean
          markup_type?: string
          markup_value?: number
          max?: number
          min?: number
          name?: string
          platform?: string
          price_per_1000?: number
          provider_id?: string
          provider_name?: string | null
          provider_price?: number
          provider_removed?: boolean
          provider_service_id?: string
          provider_type?: string | null
          rate_provider?: number
          refill?: boolean
          refill_days?: number | null
          sort_order?: number
          speed?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          data: Json
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data?: Json
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachments: Json
          body: string
          created_at: string
          id: string
          is_internal: boolean
          sender: string
          sender_id: string | null
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender: string
          sender_id?: string | null
          ticket_id: string
        }
        Update: {
          attachments?: Json
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          sender?: string
          sender_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assignee: string | null
          category: string
          created_at: string
          id: string
          number: number
          order_ids: number[]
          status: string
          subcategory: string | null
          title: string
          updated_at: string
          user_id: string
          user_unread: boolean
        }
        Insert: {
          assignee?: string | null
          category?: string
          created_at?: string
          id?: string
          number?: number
          order_ids?: number[]
          status?: string
          subcategory?: string | null
          title: string
          updated_at?: string
          user_id: string
          user_unread?: boolean
        }
        Update: {
          assignee?: string | null
          category?: string
          created_at?: string
          id?: string
          number?: number
          order_ids?: number[]
          status?: string
          subcategory?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          user_unread?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assignee_fkey"
            columns: ["assignee"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_assignee_fkey"
            columns: ["assignee"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          external_id: string
          id: string
          payload: Json
          processed: boolean
          received_at: string
          source: string
        }
        Insert: {
          external_id: string
          id?: string
          payload?: Json
          processed?: boolean
          received_at?: string
          source?: string
        }
        Update: {
          external_id?: string
          id?: string
          payload?: Json
          processed?: boolean
          received_at?: string
          source?: string
        }
        Relationships: []
      }
    }
    Views: {
      balance_mismatches: {
        Row: {
          computed: number | null
          stored: number | null
          user_id: string | null
          username: string | null
        }
        Relationships: []
      }
      catalogue_services: {
        Row: {
          avg_time: string | null
          category_id: string | null
          category_label: string | null
          id: string | null
          max: number | null
          min: number | null
          name: string | null
          platform: string | null
          price: number | null
          provider_name: string | null
          refill: boolean | null
          refill_days: number | null
          sort_order: number | null
          speed: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_spend: {
        Row: {
          orders: number | null
          total_spent: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "balance_mismatches"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_adjust_balance: {
        Args: {
          p_admin: string
          p_amount: number
          p_reason: string
          p_ref?: string
          p_user: string
        }
        Returns: number
      }
      admin_shell_stats: {
        Args: { p_since: string }
        Returns: {
          deposits_waiting: number
          revenue: number
          tickets_waiting: number
        }[]
      }
      apply_ledger_entry: {
        Args: {
          p_amount: number
          p_by?: string
          p_note?: string
          p_ref_id: string
          p_ref_type: string
          p_type: string
          p_user: string
        }
        Returns: {
          duplicate: boolean
          ledger_id: string
          new_balance: number
        }[]
      }
      approve_refund: {
        Args: {
          p_admin: string
          p_override_amount?: number
          p_override_reason?: string
          p_refund: string
        }
        Returns: {
          amount: number
          duplicate: boolean
          refund_id: string
          status: string
        }[]
      }
      catalogue_categories: {
        Args: {
          p_guarantee?: string
          p_ids?: string[]
          p_platform?: string
          p_price_max?: number
          p_price_min?: number
          p_search?: string
        }
        Returns: {
          count: number
          id: string
          label: string
          platform: string
        }[]
      }
      catalogue_filter_ok: {
        Args: {
          f_guarantee: string
          f_ids: string[]
          f_platform: string
          f_pmax: number
          f_pmin: number
          f_search: string
          p_id: string
          p_name: string
          p_platform: string
          p_price: number
          p_refill_days: number
        }
        Returns: boolean
      }
      catalogue_page: {
        Args: {
          p_category?: string
          p_guarantee?: string
          p_ids?: string[]
          p_limit?: number
          p_offset?: number
          p_platform?: string
          p_price_max?: number
          p_price_min?: number
          p_search?: string
          p_sort?: string
        }
        Returns: {
          avg_time: string
          category_id: string
          id: string
          max: number
          min: number
          name: string
          price: number
          refill_days: number
          speed: number
          total: number
        }[]
      }
      create_refund_for_order: {
        Args: {
          p_amount?: number
          p_by?: string
          p_cancel_request?: string
          p_note?: string
          p_order: number
          p_policy_percent?: number
          p_reason: string
          p_settle?: boolean
          p_source?: string
        }
        Returns: {
          amount: number
          created: boolean
          refund_id: string
          status: string
        }[]
      }
      credit_deposit: {
        Args: {
          p_amount: number
          p_by?: string
          p_deposit_id?: string
          p_external_id: string
          p_method: string
          p_user_id: string
        }
        Returns: {
          bonus: number
          deposit_id: string
          duplicate: boolean
        }[]
      }
      fmt_rupiah: { Args: { p_amount: number }; Returns: string }
      internal_audit: {
        Args: {
          p_action: string
          p_admin: string
          p_after: Json
          p_before: Json
          p_id: string
          p_type: string
        }
        Returns: undefined
      }
      internal_fail: {
        Args: { p_code: string; p_message: string }
        Returns: undefined
      }
      internal_notify: {
        Args: {
          p_body: string
          p_dedupe: string
          p_href: string
          p_title: string
          p_type: string
          p_user: string
        }
        Returns: undefined
      }
      internal_require_admin: { Args: { p_admin: string }; Returns: undefined }
      internal_settle_refund: {
        Args: { p_by: string; p_refund: string }
        Returns: {
          amount: number
          cancel_request_id: string | null
          created_at: string
          id: string
          note: string | null
          order_id: number
          overridden: boolean
          policy_percent: number | null
          processed_at: string | null
          processed_by: string | null
          reason: string
          reject_reason: string | null
          reversed: boolean
          source: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      place_order: {
        Args: {
          p_accepted_rules_version?: string
          p_link: string
          p_quantity: number
          p_service: string
          p_user: string
        }
        Returns: {
          balance: number
          charge: number
          held: boolean
          order_id: number
        }[]
      }
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: {
          allowed: boolean
          retry_after: number
        }[]
      }
      rate_limit_reset: { Args: { p_key: string }; Returns: undefined }
      reject_refund: {
        Args: { p_admin: string; p_reason: string; p_refund: string }
        Returns: {
          amount: number
          cancel_request_id: string | null
          created_at: string
          id: string
          note: string | null
          order_id: number
          overridden: boolean
          policy_percent: number | null
          processed_at: string | null
          processed_by: string | null
          reason: string
          reject_reason: string | null
          reversed: boolean
          source: string
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_cancel: {
        Args: { p_order: number; p_user: string }
        Returns: {
          calculated_refund: number
          refund_id: string
          request_id: string
        }[]
      }
      resubmit_failed_order: {
        Args: { p_admin: string; p_order: number }
        Returns: number
      }
      run_sanity_check: {
        Args: never
        Returns: {
          balance_mismatches: number
          created_at: string
          discrepancies: number
          id: string
          refund_mismatches: number
          stuck: number
        }
        SetofOptions: {
          from: "*"
          to: "sanity_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      service_sort_key: { Args: { p_id: string }; Returns: number }
      user_stats: {
        Args: { p_user: string }
        Returns: {
          balance: number
          rank: string
          total_orders: number
          total_spent: number
        }[]
      }
      verify_balances: {
        Args: never
        Returns: {
          computed: number
          diff: number
          stored: number
          user_id: string
          username: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
