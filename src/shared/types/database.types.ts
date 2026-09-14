export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      organization: {
        Row: {
          id: string
          name: string
          slug: string
          logo_url: string | null
          website: string | null
          industry: string | null
          currency: string
          timezone: string
          parent_organization_id: string | null
          plan: 'starter' | 'pro' | 'enterprise'
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['organization']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['organization']['Insert']>
      }
      branch: {
        Row: {
          id: string
          organization_id: string
          name: string
          code: string
          address: string | null
          city: string | null
          country: string | null
          is_headquarters: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['branch']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['branch']['Insert']>
      }
      department: {
        Row: {
          id: string
          organization_id: string
          branch_id: string | null
          name: string
          code: string | null
          head_employee_id: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['department']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['department']['Insert']>
      }
      organization_module: {
        Row: {
          id: string
          organization_id: string
          module_key: string
          is_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['organization_module']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['organization_module']['Insert']>
      }
      user_organization: {
        Row: {
          id: string
          user_id: string
          organization_id: string
          role: string
          branch_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['user_organization']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['user_organization']['Insert']>
      }
      employee: {
        Row: {
          id: string
          organization_id: string
          user_id: string | null
          employee_id: string
          first_name: string
          last_name: string
          email: string
          phone: string | null
          avatar_url: string | null
          department_id: string | null
          branch_id: string | null
          position: string | null
          employment_type: 'full-time' | 'part-time' | 'contract' | 'intern'
          status: 'active' | 'on-leave' | 'inactive' | 'terminated'
          hire_date: string | null
          salary: number | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
          deleted_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['employee']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['employee']['Insert']>
      }
      product_category: {
        Row: {
          id: string
          organization_id: string
          name: string
          code: string | null
          parent_id: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['product_category']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['product_category']['Insert']>
      }
      product: {
        Row: {
          id: string
          organization_id: string
          sku: string
          name: string
          description: string | null
          category_id: string | null
          unit_price: number
          cost_price: number | null
          image_url: string | null
          barcode: string | null
          is_active: boolean
          reorder_level: number
          created_at: string
          updated_at: string
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
          deleted_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['product']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['product']['Insert']>
      }
      warehouse: {
        Row: {
          id: string
          organization_id: string
          branch_id: string | null
          name: string
          code: string | null
          address: string | null
          is_default: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['warehouse']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['warehouse']['Insert']>
      }
      stock_level: {
        Row: {
          id: string
          organization_id: string
          product_id: string
          warehouse_id: string
          quantity: number
          reserved_quantity: number
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['stock_level']['Row'], 'id' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['stock_level']['Insert']>
      }
      customer: {
        Row: {
          id: string
          organization_id: string
          name: string
          email: string | null
          phone: string | null
          address: string | null
          city: string | null
          country: string | null
          segment: 'retail' | 'wholesale' | 'corporate' | 'vip' | null
          credit_limit: number
          outstanding_balance: number
          total_spend: number
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          created_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['customer']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['customer']['Insert']>
      }
      sale: {
        Row: {
          id: string
          organization_id: string
          branch_id: string | null
          reference_number: string
          customer_id: string | null
          cashier_id: string | null
          subtotal: number
          tax_amount: number
          discount_amount: number
          total_amount: number
          payment_method: 'cash' | 'card' | 'mobile' | 'credit' | null
          payment_status: 'paid' | 'pending' | 'partial' | 'cancelled'
          notes: string | null
          sale_date: string
          created_at: string
          updated_at: string
          deleted_at: string | null
          created_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['sale']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['sale']['Insert']>
      }
      sale_item: {
        Row: {
          id: string
          organization_id: string
          sale_id: string
          product_id: string
          quantity: number
          unit_price: number
          discount_amount: number
          line_total: number
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['sale_item']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['sale_item']['Insert']>
      }
      invoice: {
        Row: {
          id: string
          organization_id: string
          invoice_number: string
          customer_id: string
          sale_id: string | null
          branch_id: string | null
          issue_date: string
          due_date: string
          subtotal: number
          tax_amount: number
          discount_amount: number
          total_amount: number
          paid_amount: number
          status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled'
          notes: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
          created_by: string | null
          updated_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['invoice']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['invoice']['Insert']>
      }
      invoice_payment: {
        Row: {
          id: string
          organization_id: string
          invoice_id: string
          amount: number
          payment_method: string
          payment_date: string
          reference: string | null
          notes: string | null
          created_at: string
          created_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['invoice_payment']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['invoice_payment']['Insert']>
      }
      leave_type: {
        Row: {
          id: string
          organization_id: string
          name: string
          days_allowed: number
          is_paid: boolean
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['leave_type']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['leave_type']['Insert']>
      }
      leave_request: {
        Row: {
          id: string
          organization_id: string
          employee_id: string
          leave_type_id: string
          start_date: string
          end_date: string
          days_requested: number
          reason: string | null
          status: 'pending' | 'approved' | 'rejected' | 'cancelled'
          approved_by: string | null
          approved_at: string | null
          created_at: string
          updated_at: string
          created_by: string | null
        }
        Insert: Omit<Database['public']['Tables']['leave_request']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['leave_request']['Insert']>
      }
      notification: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          title: string
          body: string
          type: 'info' | 'success' | 'warning' | 'error'
          is_read: boolean
          action_url: string | null
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['notification']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['notification']['Insert']>
      }
      approval_request: {
        Row: {
          id: string
          organization_id: string
          module: string
          reference_type: string
          reference_id: string
          title: string
          description: string | null
          requester_id: string
          approver_id: string
          status: 'pending' | 'approved' | 'rejected' | 'cancelled'
          comment: string | null
          created_at: string
          updated_at: string
          decided_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['approval_request']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['approval_request']['Insert']>
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
