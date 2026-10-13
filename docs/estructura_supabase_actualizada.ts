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
      "confirm-transfer": {
        Args: {
          transfer_id: string
          mission_id: string
          sku_code: string
          user_id?: string
        }
        Returns: {
          success: boolean
          transfer_id: string
          status: 'COMPLETED'
        }
      }
      "register-count": {
        Args: {
          mission_id: string
          task_id: string
          deposit_code: string
          sku_code: string
          counted_quantity: number
          system_quantity: number
          sales_during_audit?: number
          user_id?: string
          target_deposit?: string
          target_system_quantity?: number
        }
        Returns: {
          status: string
          code: number
          data: {
            task_id: string
            calculated_discrepancy: number
            status: 'COMPLETED_MATCH' | 'DISCREPANT'
          }
        }
      }
      "register-floor-count": {
        Args: {
          discrepancy_id: string
          mission_id: string
          sku_code: string
          sku_description?: string
          origin_deposit: string
          target_deposit: string
          warehouse_discrepancy: number
          origin_discrepancy: number
          floor_counted_qty: number
          target_counted_quantity: number
          floor_system_qty: number
          target_system_quantity: number
          sales_during_audit?: number
          user_id?: string
        }
        Returns: {
          status: string
          code: number
          data: {
            discrepancy_id: string
            transfer_suggested: boolean
            transfer_id?: string
            transferred_qty?: number
          }
        }
      }
      "ingest-excel": {
        Args: {
          deposit_code: string
          user_id?: string
          excel_hash?: string
          file_name?: string
        }
        Returns: {
          status: string
          mission_id: string
          total_skus: number
        }
      }
      "reports-pdf": {
        Args: {
          mission_id: string
          filtered_tasks?: Json
          metrics?: Json
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
} as const;

// ============================================================================
// CONTRATOS Y ESQUEMAS DE LAS SUPABASE EDGE FUNCTIONS (v.0.4 PRIME)
// ============================================================================

export interface ConfirmTransferArgs {
  transfer_id: string;
  mission_id: string;
  sku_code: string;
  transfer_quantity?: number;
  user_id?: string;
}

export interface ConfirmTransferResponse {
  success: boolean;
  transfer_id: string;
  status: 'COMPLETED';
  adjusted_discrepancy?: number;
}

export interface RegisterCountArgs {
  mission_id: string;
  task_id: string;
  deposit_code: string;
  sku_code: string;
  sku_description?: string;
  counted_quantity: number;
  system_quantity: number;
  sales_during_audit?: number;
  user_id?: string;
  target_deposit?: string;
  target_system_quantity?: number;
  discrepancy_id?: string;
}

export interface RegisterCountResponse {
  status: 'success' | 'error';
  code: number;
  data: {
    task_id: string;
    calculated_discrepancy: number;
    status: 'COMPLETED_MATCH' | 'DISCREPANT';
    discrepancy_id?: string | null;
  };
}

export interface RegisterFloorCountArgs {
  discrepancy_id: string;
  mission_id: string;
  sku_code: string;
  sku_description?: string;
  origin_deposit: string;
  target_deposit: string;
  warehouse_discrepancy: number;
  origin_discrepancy: number;
  floor_counted_qty: number;
  target_counted_quantity: number;
  floor_system_qty: number;
  target_system_quantity: number;
  sales_during_audit?: number;
  user_id?: string;
}

export interface RegisterFloorCountResponse {
  status: 'success' | 'error';
  code: number;
  data: {
    discrepancy_id: string;
    transfer_suggested: boolean;
    transfer_id?: string;
    transferred_qty?: number;
  };
}

export interface IngestExcelArgs {
  deposit_code: string;
  user_id?: string;
  excel_hash?: string;
  file_name?: string;
}

export interface ReportsPdfArgs {
  mission_id: string;
  filtered_tasks?: Json;
  metrics?: Json;
}

// ============================================================================
// ESQUEMA DE EVENTOS INMUTABLES CQRS (EventStore)
// ============================================================================

export type DomainEventType =
  | 'MissionCreated'
  | 'TaskCountRegistered'
  | 'DiscrepancyDetected'
  | 'DiscrepancyCancelled'
  | 'FloorCountRegistered'
  | 'VirtualTransferCreated'
  | 'VirtualTransferExecuted';

export interface EventStoreEntity<TPayload = Json> {
  EventId: string;
  AggregateId: string;
  AggregateType: 'Mission' | 'MissionTask' | 'CrossDiscrepancy' | 'FloorDiscrepancy' | 'VirtualTransfer';
  EventType: DomainEventType;
  UserId: string;
  CorrelationId: string;
  CausationId?: string | null;
  SequenceNum: number;
  Timestamp: string;
  Version: number;
  Payload: TPayload;
  Metadata: Json;
}

