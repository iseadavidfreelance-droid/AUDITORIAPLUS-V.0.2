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
      EventStore: {
        Row: {
          AggregateId: string
          AggregateType: string
          CausationId: string | null
          CorrelationId: string
          EventId: string
          EventType: string
          Metadata: Json
          Payload: Json
          SequenceNum: number
          Timestamp: string
          UserId: string
          Version: number
        }
        Insert: {
          AggregateId: string
          AggregateType: string
          CausationId?: string | null
          CorrelationId: string
          EventId?: string
          EventType: string
          Metadata: Json
          Payload: Json
          SequenceNum?: number
          Timestamp?: string
          UserId: string
          Version?: number
        }
        Update: {
          AggregateId?: string
          AggregateType?: string
          CausationId?: string | null
          CorrelationId?: string
          EventId?: string
          EventType?: string
          Metadata?: Json
          Payload?: Json
          SequenceNum?: number
          Timestamp?: string
          UserId?: string
          Version?: number
        }
        Relationships: []
      }
      Read_Floor_Discrepancies: {
        Row: {
          CreatedAt: string
          DiscrepancyId: string
          MissionId: string
          OriginDeposit: string
          OriginDiscrepancy: number
          SkuCode: string
          SkuDescription: string
          Status: string
          TargetCountedQuantity: number | null
          TargetDeposit: string
          TargetDiscrepancy: number | null
          TargetSystemQuantity: number | null
          UpdatedAt: string
        }
        Insert: {
          CreatedAt?: string
          DiscrepancyId?: string
          MissionId: string
          OriginDeposit: string
          OriginDiscrepancy: number
          SkuCode: string
          SkuDescription: string
          Status?: string
          TargetCountedQuantity?: number | null
          TargetDeposit?: string
          TargetDiscrepancy?: number | null
          TargetSystemQuantity?: number | null
          UpdatedAt?: string
        }
        Update: {
          CreatedAt?: string
          DiscrepancyId?: string
          MissionId?: string
          OriginDeposit?: string
          OriginDiscrepancy?: number
          SkuCode?: string
          SkuDescription?: string
          Status?: string
          TargetCountedQuantity?: number | null
          TargetDeposit?: string
          TargetDiscrepancy?: number | null
          TargetSystemQuantity?: number | null
          UpdatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Read_Floor_Discrepancies_MissionId_fkey"
            columns: ["MissionId"]
            isOneToOne: false
            referencedRelation: "Read_Missions"
            referencedColumns: ["MissionId"]
          },
        ]
      }
      Read_IngestionLogs: {
        Row: {
          CreatedAt: string
          ExcelHashSHA256: string
          FileName: string
          IngestedBy: string
          IngestionId: string
          MissionId: string
          ProcessedRows: number
        }
        Insert: {
          CreatedAt?: string
          ExcelHashSHA256: string
          FileName: string
          IngestedBy: string
          IngestionId?: string
          MissionId: string
          ProcessedRows: number
        }
        Update: {
          CreatedAt?: string
          ExcelHashSHA256?: string
          FileName?: string
          IngestedBy?: string
          IngestionId?: string
          MissionId?: string
          ProcessedRows?: number
        }
        Relationships: []
      }
      Read_Mission_Tasks: {
        Row: {
          Barcodes: Json
          Cost: number
          CountedQuantity: number | null
          DepositCode: string
          Discrepancy: number | null
          IsFichaComplete: boolean
          MissionId: string
          SalesDuringAudit: number
          SkuCode: string
          SkuDescription: string
          Status: string
          SystemQuantity: number
          TaskId: string
          UpdatedAt: string
        }
        Insert: {
          Barcodes?: Json
          Cost?: number
          CountedQuantity?: number | null
          DepositCode: string
          Discrepancy?: number | null
          IsFichaComplete?: boolean
          MissionId: string
          SalesDuringAudit?: number
          SkuCode: string
          SkuDescription: string
          Status?: string
          SystemQuantity?: number
          TaskId?: string
          UpdatedAt?: string
        }
        Update: {
          Barcodes?: Json
          Cost?: number
          CountedQuantity?: number | null
          DepositCode?: string
          Discrepancy?: number | null
          IsFichaComplete?: boolean
          MissionId?: string
          SalesDuringAudit?: number
          SkuCode?: string
          SkuDescription?: string
          Status?: string
          SystemQuantity?: number
          TaskId?: string
          UpdatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Read_Mission_Tasks_MissionId_fkey"
            columns: ["MissionId"]
            isOneToOne: false
            referencedRelation: "Read_Missions"
            referencedColumns: ["MissionId"]
          },
        ]
      }
      Read_Missions: {
        Row: {
          CountedSkus: number
          CreatedAt: string
          DepositCode: string
          DiscrepantSkus: number
          ExcelHashSHA256: string
          IsGlobalActive: boolean | null
          MissionId: string
          Name: string
          PendingSkus: number
          ReconciledSkus: number
          Status: string
          TotalSkus: number
          UpdatedAt: string
        }
        Insert: {
          CountedSkus?: number
          CreatedAt?: string
          DepositCode: string
          DiscrepantSkus?: number
          ExcelHashSHA256: string
          IsGlobalActive?: boolean | null
          MissionId: string
          Name: string
          PendingSkus?: number
          ReconciledSkus?: number
          Status?: string
          TotalSkus?: number
          UpdatedAt?: string
        }
        Update: {
          CountedSkus?: number
          CreatedAt?: string
          DepositCode?: string
          DiscrepantSkus?: number
          ExcelHashSHA256?: string
          IsGlobalActive?: boolean | null
          MissionId?: string
          Name?: string
          PendingSkus?: number
          ReconciledSkus?: number
          Status?: string
          TotalSkus?: number
          UpdatedAt?: string
        }
        Relationships: [
          {
            foreignKeyName: "Read_Missions_ExcelHashSHA256_fkey"
            columns: ["ExcelHashSHA256"]
            isOneToOne: false
            referencedRelation: "Read_IngestionLogs"
            referencedColumns: ["ExcelHashSHA256"]
          },
        ]
      }
      Read_Users_Gamification: {
        Row: {
          CreatedAt: string | null
          Level: number | null
          Role: string | null
          TotalXP: number | null
          UserId: string
          Username: string
        }
        Insert: {
          CreatedAt?: string | null
          Level?: number | null
          Role?: string | null
          TotalXP?: number | null
          UserId: string
          Username: string
        }
        Update: {
          CreatedAt?: string | null
          Level?: number | null
          Role?: string | null
          TotalXP?: number | null
          UserId?: string
          Username?: string
        }
        Relationships: []
      }
      Read_Virtual_Transfers: {
        Row: {
          CreatedAt: string
          FromDeposit: string
          MissionId: string
          SkuCode: string
          SkuDescription: string
          Status: string
          ToDeposit: string
          TransferId: string
          TransferQuantity: number
          TransitDeposit: string
          UpdatedAt: string | null
        }
        Insert: {
          CreatedAt?: string
          FromDeposit: string
          MissionId: string
          SkuCode: string
          SkuDescription: string
          Status?: string
          ToDeposit: string
          TransferId?: string
          TransferQuantity: number
          TransitDeposit?: string
          UpdatedAt?: string | null
        }
        Update: {
          CreatedAt?: string
          FromDeposit?: string
          MissionId?: string
          SkuCode?: string
          SkuDescription?: string
          Status?: string
          ToDeposit?: string
          TransferId?: string
          TransferQuantity?: number
          TransitDeposit?: string
          UpdatedAt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Read_Virtual_Transfers_MissionId_fkey"
            columns: ["MissionId"]
            isOneToOne: false
            referencedRelation: "Read_Missions"
            referencedColumns: ["MissionId"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
