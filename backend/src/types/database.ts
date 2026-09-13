import type { lab_orders, order_tests, profile_parameters, test_profiles, test_results } from '../../generated/prisma/client.js';
import type { ReferenceRange as RangeInput } from '../schemas/profileSchemas.js';

// pg returns NUMERIC as strings. SQL result shapes are declared, not SQL-inferred.
export type ReferenceRange = Omit<RangeInput, 'ageUnit'> & { ageUnit?: RangeInput['ageUnit'] };
export type ProfileRow = test_profiles;
type ResultMetadata = {
  reference_ranges: ReferenceRange[]; select_options: string[]; common_values: string[];
  numeric_step: string | null; slider_min: string | null; slider_max: string | null;
  critical_low: string | null; critical_high: string | null;
};
export type ParameterRow = Omit<profile_parameters, keyof ResultMetadata> & ResultMetadata;
export type ResultRow = Omit<test_results, keyof ResultMetadata> & ResultMetadata;
export type OrderRow = Omit<lab_orders, 'age_value' | 'age_unit'> & { age_value: string | null; age_unit: 'days' | 'weeks' | 'months' | 'years' };
export type OrderTestRow = order_tests;
export type PatientAge = { age_years?: number | null; age_value?: number | string | null; age_unit?: 'days' | 'weeks' | 'months' | 'years'; gender?: string | null };
