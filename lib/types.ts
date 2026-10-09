export type Role = "ADMIN" | "SPONSOR";
export type TaskStatus = "Needs You" | "With Our Team" | "Complete" | "Overdue" | "pending_review";

export type Database = {
  public: {
    Tables: {
      events: {
        Row: { id: string; name: string; start_date: string; location: string | null; google_sheet_id: string | null; google_sheet_range: string; drive_folder_id: string | null };
        Insert: { id?: string; name: string; start_date: string; location?: string | null; google_sheet_id?: string | null; google_sheet_range?: string; drive_folder_id?: string | null };
        Update: { id?: string; name?: string; start_date?: string; location?: string | null; google_sheet_id?: string | null; google_sheet_range?: string; drive_folder_id?: string | null };
        Relationships: [];
      };
      sponsors: {
        Row: { id: string; company_name: string; tier: string; contract_details: Record<string, unknown> };
        Insert: { id?: string; company_name: string; tier: string; contract_details?: Record<string, unknown> };
        Update: { id?: string; company_name?: string; tier?: string; contract_details?: Record<string, unknown> };
        Relationships: [];
      };
      user_profiles: {
        Row: { id: string; sponsor_id: string | null; role: Role };
        Insert: { id: string; sponsor_id?: string | null; role: Role };
        Update: { id?: string; sponsor_id?: string | null; role?: Role };
        Relationships: [];
      };
      sponsor_events: {
        Row: { id: string; sponsor_id: string; event_id: string; drive_folder_id: string | null; cvent_exhibitor_id: string | null };
        Insert: { id?: string; sponsor_id: string; event_id: string; drive_folder_id?: string | null; cvent_exhibitor_id?: string | null };
        Update: { id?: string; sponsor_id?: string; event_id?: string; drive_folder_id?: string | null; cvent_exhibitor_id?: string | null };
        Relationships: [];
      };
      sponsor_campaign_contacts: {
        Row: { id: string; sponsor_event_id: string; name: string; email: string; job_title: string | null; phone: string | null; created_at: string };
        Insert: { id?: string; sponsor_event_id: string; name: string; email: string; job_title?: string | null; phone?: string | null; created_at?: string };
        Update: { id?: string; sponsor_event_id?: string; name?: string; email?: string; job_title?: string | null; phone?: string | null; created_at?: string };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          sponsor_event_id: string;
          title: string;
          description: string | null;
          category: string;
          status: TaskStatus;
          submitted_at: string | null;
          due_date: string | null;
          quantity: number;
          action_url: string | null;
          action_label: string | null;
          response_text: string | null;
          file_url: string | null;
          file_name: string | null;
          file_size_bytes: number | null;
          file_id: string | null;
          ai_recommendation: "COMPLETE" | "NEEDS_CHANGES" | null;
          ai_feedback: string | null;
          ai_reviewed_at: string | null;
          admin_review_note: string | null;
          input_fields: Array<{ key: string; label: string; source_value: string }>;
          input_values: Record<string, unknown>;
          nominee_decisions: Record<string, "approve" | "decline">;
        };
        Insert: {
          id?: string;
          sponsor_event_id: string;
          title: string;
          description?: string | null;
          category: string;
          status?: TaskStatus;
          submitted_at?: string | null;
          due_date?: string | null;
          quantity?: number;
          action_url?: string | null;
          action_label?: string | null;
          response_text?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          file_id?: string | null;
          ai_recommendation?: "COMPLETE" | "NEEDS_CHANGES" | null;
          ai_feedback?: string | null;
          ai_reviewed_at?: string | null;
          admin_review_note?: string | null;
          input_fields?: Array<{ key: string; label: string; source_value: string }>;
          input_values?: Record<string, unknown>;
          nominee_decisions?: Record<string, "approve" | "decline">;
        };
        Update: {
          id?: string;
          sponsor_event_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          status?: TaskStatus;
          submitted_at?: string | null;
          due_date?: string | null;
          quantity?: number;
          action_url?: string | null;
          action_label?: string | null;
          response_text?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          file_id?: string | null;
          ai_recommendation?: "COMPLETE" | "NEEDS_CHANGES" | null;
          ai_feedback?: string | null;
          ai_reviewed_at?: string | null;
          admin_review_note?: string | null;
          input_fields?: Array<{ key: string; label: string; source_value: string }>;
          input_values?: Record<string, unknown>;
          nominee_decisions?: Record<string, "approve" | "decline">;
        };
        Relationships: [];
      };
      task_upload_attempts: {
        Row: {
          id: string;
          task_id: string;
          sponsor_id: string;
          status: "pending_upload" | "upload_failed" | "uploaded" | "recovery_needed" | "completed";
          file_name: string;
          file_size_bytes: number;
          drive_file_id: string | null;
          file_url: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          sponsor_id: string;
          status: "pending_upload" | "upload_failed" | "uploaded" | "recovery_needed" | "completed";
          file_name: string;
          file_size_bytes: number;
          drive_file_id?: string | null;
          file_url?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          sponsor_id?: string;
          status?: "pending_upload" | "upload_failed" | "uploaded" | "recovery_needed" | "completed";
          file_name?: string;
          file_size_bytes?: number;
          drive_file_id?: string | null;
          file_url?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      drive_folder_creation_claims: {
        Row: { id: string; event_id: string | null; sponsor_event_id: string | null; drive_folder_id: string | null; created_at: string };
        Insert: { id?: string; event_id?: string | null; sponsor_event_id?: string | null; drive_folder_id?: string | null; created_at?: string };
        Update: { id?: string; event_id?: string | null; sponsor_event_id?: string | null; drive_folder_id?: string | null; created_at?: string };
        Relationships: [];
      };
      cvent_ticket_registrations: {
        Row: { attendee_id: string; cvent_event_id: string; sponsor_event_id: string | null; exhibitor_id: string | null; exhibitor_name: string | null; inviting_sponsor: string | null; task_title: string; registration_type: string; status: string; first_name: string | null; last_name: string | null; email: string | null; company: string | null; job_title: string | null; registered_at: string | null; checked_in: boolean; synced_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      deliverable_due_dates: {
        Row: { event_id: string; category: string; due_date: string; updated_at: string };
        Insert: { event_id: string; category: string; due_date: string; updated_at?: string };
        Update: { event_id?: string; category?: string; due_date?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Event = Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "name" | "start_date" | "location">;
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
