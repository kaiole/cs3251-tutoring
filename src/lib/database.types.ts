
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "questions": {
                  Row: {
                    "author_id": string,"body_md": string,"created_at": string,"excerpt_kind": string | null,"excerpt_language": string | null,"excerpt_text": string | null,"id": string,"last_activity_at": string,"next_session": boolean,"pair_id": string,"request_hash": string,"request_id": string,"source_heading": string | null,"source_note_id": string | null,"source_path": string | null,"source_revision": string | null,"source_title": string | null,"status": string,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body_md": string,"created_at"?: string,"excerpt_kind"?: string | null,"excerpt_language"?: string | null,"excerpt_text"?: string | null,"id"?: string,"last_activity_at"?: string,"next_session"?: boolean,"pair_id": string,"request_hash": string,"request_id": string,"source_heading"?: string | null,"source_note_id"?: string | null,"source_path"?: string | null,"source_revision"?: string | null,"source_title"?: string | null,"status"?: string,"title": string,"version"?: number
                  }
                  Update: {
                    "author_id"?: string,"body_md"?: string,"created_at"?: string,"excerpt_kind"?: string | null,"excerpt_language"?: string | null,"excerpt_text"?: string | null,"id"?: string,"last_activity_at"?: string,"next_session"?: boolean,"pair_id"?: string,"request_hash"?: string,"request_id"?: string,"source_heading"?: string | null,"source_note_id"?: string | null,"source_path"?: string | null,"source_revision"?: string | null,"source_title"?: string | null,"status"?: string,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_author_is_student"
      columns: ["pair_id","author_id"]
isOneToOne: false
      referencedRelation: "tutoring_pairs"
      referencedColumns: ["id","student_id"]
    }
                  ]
                },"replies": {
                  Row: {
                    "author_id": string,"body_md": string,"created_at": string,"id": string,"question_id": string,"request_hash": string,"request_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body_md": string,"created_at"?: string,"id"?: string,"question_id": string,"request_hash": string,"request_id": string
                  }
                  Update: {
                    "author_id"?: string,"body_md"?: string,"created_at"?: string,"id"?: string,"question_id"?: string,"request_hash"?: string,"request_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "replies_question_id_fkey"
      columns: ["question_id"]
isOneToOne: false
      referencedRelation: "questions"
      referencedColumns: ["id"]
    }
                  ]
                },"tutoring_pairs": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"student_id": string,"tutor_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"student_id": string,"tutor_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"student_id"?: string,"tutor_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_reply":
{ Args: { "p_body": string,"p_question_id": string,"p_request_id": string }; Returns: Json
                           },
"create_question":
{ Args: { "p_body": string,"p_next_session"?: boolean,"p_request_id": string,"p_source"?: Json }; Returns: {
              "author_id": string,
"body_md": string,
"created_at": string,
"excerpt_kind": string | null,
"excerpt_language": string | null,
"excerpt_text": string | null,
"id": string,
"last_activity_at": string,
"next_session": boolean,
"pair_id": string,
"request_hash": string,
"request_id": string,
"source_heading": string | null,
"source_note_id": string | null,
"source_path": string | null,
"source_revision": string | null,
"source_title": string | null,
"status": string,
"title": string,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "questions"
        isOneToOne: true
        isSetofReturn: false
      } },
"set_question_state":
{ Args: { "p_action": string,"p_expected_version": number,"p_question_id": string }; Returns: {
              "author_id": string,
"body_md": string,
"created_at": string,
"excerpt_kind": string | null,
"excerpt_language": string | null,
"excerpt_text": string | null,
"id": string,
"last_activity_at": string,
"next_session": boolean,
"pair_id": string,
"request_hash": string,
"request_id": string,
"source_heading": string | null,
"source_note_id": string | null,
"source_path": string | null,
"source_revision": string | null,
"source_title": string | null,
"status": string,
"title": string,
"version": number
            }
                          SetofOptions: {
        from: "*"
        to: "questions"
        isOneToOne: true
        isSetofReturn: false
      } },
"worker_claim_notification_jobs":
{ Args: { "p_batch_size"?: number,"p_lease_seconds"?: number,"p_site_url": string }; Returns: {
              "attempt_count": number,"job_id": string,"lease_token": string,"payload": Json
            }[]
                           },
"worker_finish_notification_job":
{ Args: { "p_error"?: string,"p_job_id": string,"p_lease_token": string,"p_outcome": string,"p_provider_message_id"?: string }; Returns: boolean
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
