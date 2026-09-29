export type Role = "ADMIN" | "SPONSOR";
export type TaskStatus = "Needs You" | "With Our Team" | "Complete" | "Overdue";

export type Database = {
  public: {
    Tables: {
      events: {
        Row: { id: string; name: string; start_date: string; location: string | null; google_sheet_id: string | null; google_sheet_range: string };
        Insert: { id?: string; name: string; start_date: string; location?: string | null; google_sheet_id?: string | null; google_sheet_range?: string };
        Update: { id?: string; name?: string; start_date?: string; location?: string | null; google_sheet_id?: string | null; google_sheet_range?: string };
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
        Row: { id: string; sponsor_id: string; event_id: string };
        Insert: { id?: string; sponsor_id: string; event_id: string };
        Update: { id?: string; sponsor_id?: string; event_id?: string };
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
          due_date: string | null;
          quantity: number;
          action_url: string | null;
          action_label: string | null;
          response_text: string | null;
          file_url: string | null;
          file_name: string | null;
          file_id: string | null;
          ai_recommendation: "COMPLETE" | "NEEDS_CHANGES" | null;
          ai_feedback: string | null;
          ai_reviewed_at: string | null;
          admin_review_note: string | null;
          input_fields: Array<{ key: string; label: string; source_value: string }>;
          input_values: Record<string, string>;
        };
        Insert: {
          id?: string;
          sponsor_event_id: string;
          title: string;
          description?: string | null;
          category: string;
          status?: TaskStatus;
          due_date?: string | null;
          quantity?: number;
          action_url?: string | null;
          action_label?: string | null;
          response_text?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_id?: string | null;
          ai_recommendation?: "COMPLETE" | "NEEDS_CHANGES" | null;
          ai_feedback?: string | null;
          ai_reviewed_at?: string | null;
          admin_review_note?: string | null;
          input_fields?: Array<{ key: string; label: string; source_value: string }>;
          input_values?: Record<string, string>;
        };
        Update: {
          id?: string;
          sponsor_event_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          status?: TaskStatus;
          due_date?: string | null;
          quantity?: number;
          action_url?: string | null;
          action_label?: string | null;
          response_text?: string | null;
          file_url?: string | null;
          file_name?: string | null;
          file_id?: string | null;
          ai_recommendation?: "COMPLETE" | "NEEDS_CHANGES" | null;
          ai_feedback?: string | null;
          ai_reviewed_at?: string | null;
          admin_review_note?: string | null;
          input_fields?: Array<{ key: string; label: string; source_value: string }>;
          input_values?: Record<string, string>;
        };
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
