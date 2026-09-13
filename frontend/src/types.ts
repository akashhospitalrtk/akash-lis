export type Role = 'ADMIN' | 'TECHNICIAN' | 'AUTHORIZER';
export type ResultKind = 'NUMERIC' | 'TEXT' | 'POS_NEG' | 'SELECT';
export type OrderStatus = 'PENDING' | 'COMPLETED' | 'AUTHORIZED';
export type SampleStatus = 'REGISTERED' | 'COLLECTED' | 'IN_PROCESS' | 'RESULTS_PENDING' | 'APPROVED' | 'DELIVERED';

export interface User { id: string; username: string; fullName: string; role: Role; designation?: string | null }
export interface ProfileParameter {
  id: string; profile_id: string; code: string; name: string; result_kind: ResultKind; unit?: string | null;
  description?: string | null; method?: string | null; loinc_code?: string | null; reference_note?: string | null;
  reference_ranges: ReferenceRange[]; select_options: string[]; common_values: string[]; calculation_formula?: string | null; suggested_value?: string | null;
  numeric_step?: number | string | null; slider_min?: number | string | null; slider_max?: number | string | null;
  critical_low?: number | string | null; critical_high?: number | string | null; sort_order: number; active?: boolean;
}
export interface Profile { description?: string | null; id: string; code: string; name: string; department: string; active?: boolean; specimen_type?: string | null; turnaround_time?: string | null; instructions?: string | null; parameters: ProfileParameter[] }
export type AgeUnit = 'days' | 'weeks' | 'months' | 'years';
export interface ReferenceRange { ageUnit?: AgeUnit; label?: string; gender?: string; ageMin?: number; ageMax?: number; low?: number; high?: number }
export interface Result {
  id: string; order_test_id: string; parameter_code: string; parameter_name: string; result_kind: ResultKind; result_value?: string | null;
  unit?: string | null; reference_ranges: ReferenceRange[]; select_options: string[]; common_values: string[]; calculation_formula?: string | null; suggested_value?: string | null;
  description?: string | null; method?: string | null; loinc_code?: string | null; reference_note?: string | null;
  numeric_step?: number | string | null; slider_min?: number | string | null; slider_max?: number | string | null;
  critical_low?: number | string | null; critical_high?: number | string | null;
  abnormal_flag?: string | null; comments?: string | null; sort_order: number;
}
export interface OrderTest { description?: string | null; id: string; profile_id: string; profile_code: string; profile_name: string; status: OrderStatus; remarks?: string | null; sort_order: number; results: Result[] }
export interface AuditEvent { id: string; event_type: string; details: Record<string, unknown>; created_at: string; user_name?: string | null }
export interface ReportAmendment {
  id: string; amendment_no: number; reason: string; created_at: string; reauthorized_at?: string | null; printed_at?: string | null;
  started_by_name?: string | null; reauthorized_by_name?: string | null;
}
export interface Order {
  id: string; accession_no: string; patient_source: string; external_patient_id?: string | null; uhid?: string | null;
  patient_name: string; age_value?: number | null; age_unit?: AgeUnit; age_years?: number | null; gender?: string | null; mobile?: string | null; referring_doctor?: string | null;
  patient_type?: string | null; sample_date: string; status: OrderStatus; sample_status?: SampleStatus; sample_received_at?: string | null; delivered_at?: string | null; created_at: string; printed_at?: string | null;
  authorized_at?: string | null; amendment_count?: number; amended_at?: string | null; amended_by_name?: string | null; amendment_reason?: string | null;
  created_by_name?: string; created_by_designation?: string | null; authorized_by_name?: string | null;
  authorized_by_designation?: string | null; authorized_signature_label?: string | null; audit?: AuditEvent[]; amendments?: ReportAmendment[];
  tests?: OrderTest[] | string;
}
export interface Hospital { name: string; address: string; phone: string }
