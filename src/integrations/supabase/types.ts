export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string
          name: string
          code: string
          region: string | null
          manager_id: string | null
          address: string | null
          phone: string | null
          email: string | null
          status: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          name: string
          code: string
          region?: string | null
          manager_id?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          code?: string
          region?: string | null
          manager_id?: string | null
          address?: string | null
          phone?: string | null
          email?: string | null
          status?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          id: string
          email: string
          name: string
          phone: string | null
          status: string
          last_login: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id: string
          email: string
          name: string
          phone?: string | null
          status?: string
          last_login?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          email?: string
          name?: string
          phone?: string | null
          status?: string
          last_login?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_roles: {
        Row: {
          id: string
          user_id: string
          role: Database["public"]["Enums"]["app_role"]
          branch_id: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          role?: Database["public"]["Enums"]["app_role"]
          branch_id?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          branch_id?: string | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          }
        ]
      }
      stock_items: {
        Row: {
          id: string
          product_name: string
          quantity: number
          unit_price: number
          expiry_date: string
          branch_id: string
          status: string
          assigned_to: string | null
          assignment_strategy: string | null
          date_assigned: string | null
          deadline: string | null
          emergency_declared_at: string | null
          emergency_declared_by: string | null
          is_emergency: boolean
          priority: string | null
          priority_score: number | null
          risk_level: string | null
          days_to_expiry: number | null
          quantity_moved: number | null
          value: number | null
          is_high_value: boolean
          last_updated_at: string | null
          last_updated_by: string | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          product_name: string
          quantity?: number
          unit_price: number
          expiry_date: string
          branch_id: string
          status?: string
          assigned_to?: string | null
          assignment_strategy?: string | null
          date_assigned?: string | null
          deadline?: string | null
          emergency_declared_at?: string | null
          emergency_declared_by?: string | null
          is_emergency?: boolean
          priority?: string | null
          priority_score?: number | null
          risk_level?: string | null
          days_to_expiry?: number | null
          quantity_moved?: number | null
          value?: number | null
          is_high_value?: boolean
          last_updated_at?: string | null
          last_updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          product_name?: string
          quantity?: number
          unit_price?: number
          expiry_date?: string
          branch_id?: string
          status?: string
          assigned_to?: string | null
          assignment_strategy?: string | null
          date_assigned?: string | null
          deadline?: string | null
          emergency_declared_at?: string | null
          emergency_declared_by?: string | null
          is_emergency?: boolean
          priority?: string | null
          priority_score?: number | null
          risk_level?: string | null
          days_to_expiry?: number | null
          quantity_moved?: number | null
          value?: number | null
          is_high_value?: boolean
          last_updated_at?: string | null
          last_updated_by?: string | null
          created_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_emergency_declared_by_fkey"
            columns: ["emergency_declared_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      emergency_assignments: {
        Row: {
          id: string
          stock_item_id: string
          dispenser_id: string
          assigned_quantity: number
          assigned_by: string | null
          assigned_at: string
          deadline: string
          status: string
          completed_at: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          stock_item_id: string
          dispenser_id: string
          assigned_quantity: number
          assigned_by?: string | null
          assigned_at?: string
          deadline: string
          status?: string
          completed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          stock_item_id?: string
          dispenser_id?: string
          assigned_quantity?: number
          assigned_by?: string | null
          assigned_at?: string
          deadline?: string
          status?: string
          completed_at?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_assignments_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_assignments_dispenser_id_fkey"
            columns: ["dispenser_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      weekly_tasks: {
        Row: {
          id: string
          title: string
          description: string | null
          assigned_to: string
          assigned_by: string
          due_date: string
          priority: string
          status: string
          whatsapp_sent: boolean
          whatsapp_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          assigned_to: string
          assigned_by: string
          due_date: string
          priority?: string
          status?: string
          whatsapp_sent?: boolean
          whatsapp_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          assigned_to?: string
          assigned_by?: string
          due_date?: string
          priority?: string
          status?: string
          whatsapp_sent?: boolean
          whatsapp_sent_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      stock_movement_history: {
        Row: {
          id: string
          stock_item_id: string | null
          movement_type: string | null
          quantity_moved: number
          from_branch_id: string | null
          to_branch_id: string | null
          for_dispenser: string | null
          moved_by: string | null
          movement_date: string
          notes: string | null
        }
        Insert: {
          id?: string
          stock_item_id?: string | null
          movement_type?: string | null
          quantity_moved: number
          from_branch_id?: string | null
          to_branch_id?: string | null
          for_dispenser?: string | null
          moved_by?: string | null
          movement_date?: string
          notes?: string | null
        }
        Update: {
          id?: string
          stock_item_id?: string | null
          movement_type?: string | null
          quantity_moved?: number
          from_branch_id?: string | null
          to_branch_id?: string | null
          for_dispenser?: string | null
          moved_by?: string | null
          movement_date?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movement_history_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_history_from_branch_id_fkey"
            columns: ["from_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_history_to_branch_id_fkey"
            columns: ["to_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_history_for_dispenser_fkey"
            columns: ["for_dispenser"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movement_history_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      whatsapp_notifications: {
        Row: {
          id: string
          recipient_phone: string
          message_content: string
          message_type: string
          status: string
          twilio_sid: string | null
          error_message: string | null
          related_id: string | null
          created_at: string
          sent_at: string | null
        }
        Insert: {
          id?: string
          recipient_phone: string
          message_content: string
          message_type: string
          status?: string
          twilio_sid?: string | null
          error_message?: string | null
          related_id?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Update: {
          id?: string
          recipient_phone?: string
          message_content?: string
          message_type?: string
          status?: string
          twilio_sid?: string | null
          error_message?: string | null
          related_id?: string | null
          created_at?: string
          sent_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string | null
          message: string
          type: string | null
          stock_item_id: string | null
          is_read: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          message: string
          type?: string | null
          stock_item_id?: string | null
          is_read?: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          message?: string
          type?: string | null
          stock_item_id?: string | null
          is_read?: boolean
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          }
        ]
      }
      branch_performance: {
        Row: {
          id: string
          branch_id: string
          period_start: string
          period_end: string
          total_stock_value: number | null
          items_expired: number | null
          items_near_expiry: number | null
          emergency_assignments: number | null
          tasks_completed: number | null
          dispensers_active: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          branch_id: string
          period_start: string
          period_end: string
          total_stock_value?: number | null
          items_expired?: number | null
          items_near_expiry?: number | null
          emergency_assignments?: number | null
          tasks_completed?: number | null
          dispensers_active?: number | null
          created_at?: string | null
        }
        Update: {
          id?: string
          branch_id?: string
          period_start?: string
          period_end?: string
          total_stock_value?: number | null
          items_expired?: number | null
          items_near_expiry?: number | null
          emergency_assignments?: number | null
          tasks_completed?: number | null
          dispensers_active?: number | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_performance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      dispensers_view: {
        Row: {
          id: string
          dispenser: string
          phone: string | null
          email: string
          branch: string | null
          status: string
          role: string
          branch_id: string | null
          created_at: string | null
          updated_at: string | null
          performance_score: number
        }
        Insert: never
        Update: never
      }
      high_value_items_monthly_summary: {
        Row: {
          expiry_month: string
          branch_id: string
          branch_name: string
          total_high_value: number | null
          number_of_high_value_items: number
        }
        Insert: never
        Update: never
      }
    }
    Functions: {
      has_role: {
        Args: {
          _user_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _branch_id?: string
        }
        Returns: boolean
      }
      assign_user_role: {
        Args: {
          p_user_id: string
          p_role: Database["public"]["Enums"]["app_role"]
          p_branch_id?: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "system_admin" | "branch_system_admin" | "regional_manager" | "admin" | "dispenser" | "doctor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "regional_manager",
        "system_admin",
        "branch_system_admin",
      ],
      priority_type: ["low", "medium", "high", "urgent"],
      risk_level_type: ["low", "medium", "high", "critical"],
      stock_status: ["pending", "assigned", "moved", "expired", "disposed"],
    },
  },
} as const
