import type { ReferenceRange } from './types';

export type TemplateParameter = {
  code: string; name: string; unit: string; method: string; loincCode?: string;
  referenceRanges?: ReferenceRange[]; referenceNote?: string; calculationFormula?: string;
};
export type CatalogueTemplate = {
  key: string; code: string; name: string; department: string; specimenType: string;
  source: string; guidance: string; parameters: TemplateParameter[];
};
// Only catalogue metadata. Never copy patient results or identifiers into templates.
const field = (code: string, name: string, unit: string, method: string, low?: number, high?: number, loincCode?: string): TemplateParameter => ({
  code, name, unit, method, loincCode,
  referenceRanges: low !== undefined || high !== undefined ? [{ label: 'Source report: adult female', gender: 'Female', ageMin: 18, low, high }] : []
});
const source = 'Supplied sample report (pages 1, 3–6 and 8)';
const guidance = 'Reference example from another laboratory. Confirm the reagent method before saving. Source intervals are optional and scoped to adult females; pregnancy and pediatric intervals need separate validation.';

export const catalogueTemplates: CatalogueTemplate[] = [
  {
    key: 'h360', code: 'CBC', name: 'Complete Blood Count (H360, 3-part differential)', department: 'Hematology', specimenType: 'EDTA whole blood',
    source: 'Erba H360 manufacturer brochure',
    guidance: 'H360 reports Lymph, MID and Gran groups. MID is a mixed-cell group and Gran is not a separate neutrophil count. Use a separate manual differential when needed. Confirm display units against the instrument printout; no manufacturer analytical measuring limits are used as patient reference ranges.',
    parameters: [
      field('HB', 'Hemoglobin (HGB)', 'g/dL', 'Cyanide-free colorimetry'),
      field('TLC', 'Total Leukocyte Count (WBC)', '10^3/uL', 'Electrical impedance'),
      field('RBC', 'Red Blood Cell Count (RBC)', '10^6/uL', 'Electrical impedance'),
      field('PCV', 'Hematocrit (HCT / PCV)', '%', 'Calculated by H360'),
      field('MCV', 'Mean Corpuscular Volume (MCV)', 'fL', 'Measured by H360'),
      field('MCH', 'Mean Corpuscular Hemoglobin (MCH)', 'pg', 'H360 erythrocyte index'),
      field('MCHC', 'Mean Corpuscular Hemoglobin Concentration (MCHC)', 'g/dL', 'H360 erythrocyte index'),
      field('RDWCV', 'Red Cell Distribution Width (RDW-CV)', '%', 'H360 red-cell distribution'),
      field('RDWSD', 'Red Cell Distribution Width (RDW-SD)', 'fL', 'H360 red-cell distribution'),
      field('PLT', 'Platelet Count (PLT)', '10^3/uL', 'Electrical impedance'),
      field('MPV', 'Mean Platelet Volume (MPV)', 'fL', 'H360 platelet distribution'),
      field('PCT', 'Plateletcrit (PCT)', '%', 'H360 platelet index'),
      field('PDWCV', 'Platelet Distribution Width (PDW-CV)', '%', 'H360 platelet distribution'),
      field('PDWSD', 'Platelet Distribution Width (PDW-SD)', 'fL', 'H360 platelet distribution'),
      field('PLCR', 'Platelet Large Cell Ratio (P-LCR)', '%', 'H360 platelet distribution'),
      field('PLCC', 'Platelet Large Cell Count (P-LCC)', '10^3/uL', 'H360 platelet distribution'),
      field('LYMPH', 'Lymphocytes (Lymph %)', '%', 'Electrical impedance, 3-part differential'),
      field('LYMPH_ABS', 'Lymphocytes, Absolute (Lymph #)', '10^3/uL', 'Electrical impedance, 3-part differential'),
      field('MID', 'Mixed Cells (MID %)', '%', 'Electrical impedance, 3-part differential'),
      field('MID_ABS', 'Mixed Cells, Absolute (MID #)', '10^3/uL', 'Electrical impedance, 3-part differential'),
      field('GRAN', 'Granulocytes (Gran %)', '%', 'Electrical impedance, 3-part differential'),
      field('GRAN_ABS', 'Granulocytes, Absolute (Gran #)', '10^3/uL', 'Electrical impedance, 3-part differential')
    ]
  },
  { key: 'vitd-report', code: 'VITD', name: 'Vitamin D, 25-OH Total (D2 + D3)', department: 'Immunoassay', specimenType: 'Serum', source, guidance,
    parameters: [{ ...field('VITD3', 'Vitamin D, 25-OH Total (D2 + D3)', 'ng/mL', 'CLIA', undefined, undefined, '62292-8'), referenceNote: 'Source report categories (ng/mL): deficiency <10; insufficiency 10–30; sufficiency 30–100; toxicity >100. Boundary at 30 overlaps in the source; resolve in the local SOP. Display only; no automatic flag.' }] },
  { key: 'b12-report', code: 'VITB12', name: 'Vitamin B12', department: 'Immunoassay', specimenType: 'Serum', source, guidance,
    parameters: [field('B12', 'Vitamin B12', 'pg/mL', 'CLIA', 180, 914, '2132-9')] },
  { key: 'iron-report', code: 'IRON', name: 'Iron Profile', department: 'Biochemistry', specimenType: 'Serum', source, guidance,
    parameters: [field('IRON', 'Iron', 'ug/dL', 'Ferrene', 50, 170, '2498-4'), field('UIBC', 'Unsaturated Iron Binding Capacity (UIBC)', 'ug/dL', 'Spectrophotometry and Calculation', 110, 370), field('TIBC', 'Iron Binding Capacity - Total (TIBC)', 'ug/dL', 'Ferrene', 250, 450), field('TSAT', 'Transferrin Saturation', '%', 'Spectrophotometry and Calculation', 20, 50)] },
  { key: 'kft-report', code: 'KFT', name: 'KFT with Electrolytes', department: 'Biochemistry', specimenType: 'Serum', source, guidance: `${guidance} Direct ISE in this report is not the Chem 7 photometer method. Confirm the separate electrolyte instrument or reagent method. BUN formula is left blank until the lab verifies its conversion.`,
    parameters: [field('CREAT', 'Creatinine', 'mg/dL', 'Modified Picrate Jaffe Kinetic', 0.40, 1.04, '2160-0'), field('UREA', 'Urea', 'mg/dL', 'GLDH', 15, 45), field('URIC', 'Uric Acid', 'mg/dL', 'Uricase', 2.6, 6), field('NA', 'Sodium', 'mmol/L', 'ISE Direct', 135, 155), field('K', 'Potassium', 'mmol/L', 'ISE Direct', 3.5, 5.5), field('CL', 'Chloride - Serum', 'mmol/L', 'ISE Direct', 97, 107), field('CA', 'Calcium', 'mg/dL', 'Arsenazo III', 8.1, 10.4), field('BUN', 'Blood Urea Nitrogen (BUN)', 'mg/dL', 'Calculated', 8, 23)] },
  { key: 'lipid-report', code: 'LIPID', name: 'Lipid Profile', department: 'Biochemistry', specimenType: 'Serum', source, guidance: `${guidance} The source gives alternative HDL/LDL methods. Select the actual method; formulas and categorical cutoffs are not inferred.`,
    parameters: [field('CHOL', 'Cholesterol - Total', 'mg/dL', 'Cholesterol Oxidase Esterase Peroxidase'), field('TG', 'Triglycerides', 'mg/dL', 'GPO-POD'), field('HDL', 'Cholesterol - HDL', 'mg/dL', ''), field('LDL', 'Cholesterol - LDL', 'mg/dL', ''), field('VLDL', 'VLDL Cholesterol', 'mg/dL', 'Calculated'), { ...field('NONHDL', 'Non-HDL Cholesterol', 'mg/dL', 'Calculated'), calculationFormula: 'CHOL - HDL' }, { ...field('CHOL_HDL', 'Total Cholesterol / HDL Ratio', 'ratio', 'Calculated'), calculationFormula: 'CHOL / HDL' }, { ...field('HDL_LDL', 'HDL / LDL Cholesterol Ratio', 'ratio', 'Calculated'), calculationFormula: 'HDL / LDL' }, { ...field('LDL_HDL', 'LDL / HDL Cholesterol Ratio', 'ratio', 'Calculated'), calculationFormula: 'LDL / HDL' }] },
  { key: 'lft-report', code: 'LFT', name: 'Liver Function Test', department: 'Biochemistry', specimenType: 'Serum', source, guidance: `${guidance} “Spectrophotometry” describes detection but does not identify the protein/albumin reagent. Strict upper cutoffs are documented in the guide, not converted into inclusive limits.`,
    parameters: [field('TBIL', 'Bilirubin Total', 'mg/dL', 'Diazo method'), field('DBIL', 'Bilirubin Conjugated', 'mg/dL', 'Diazo method'), { ...field('IBIL', 'Bilirubin Unconjugated Indirect', 'mg/dL', 'Calculated', 0.2, 0.8), calculationFormula: 'TBIL - DBIL' }, field('AST', 'Aspartate Aminotransferase (AST / SGOT)', 'U/L', 'UV WITH P5P'), field('ALT', 'Alanine Aminotransferase (ALT / SGPT)', 'U/L', 'UV WITH P5P'), field('ALP', 'Alkaline Phosphatase (ALP)', 'U/L', 'PNPP AMP', 46, 116), field('GGT', 'Gamma Glutamyl Transferase (GGT)', 'U/L', 'IFCC Method, Kinetic'), field('TP', 'Protein Total Serum', 'g/dL', 'Spectrophotometry', 6.1, 8.1), field('ALB', 'Albumin - Serum', 'g/dL', 'Spectrophotometry', 3.4, 5), field('GLOB', 'Globulin', 'g/dL', 'Spectrophotometry', 2, 3.5), field('AGR', 'A/G (Albumin / Globulin) Ratio', 'ratio', 'Spectrophotometry', 0.8, 2), { ...field('AST_ALT', 'SGOT / SGPT Ratio', 'ratio', 'Calculated'), calculationFormula: 'AST / ALT' }] },
  { key: 'thyroid-report', code: 'THYROID', name: 'Thyroid Profile (Total T3, Total T4, TSH)', department: 'Immunoassay', specimenType: 'Serum', source, guidance: `${guidance} Total T3/T4 are different tests from free T3/T4. CLIA is not inferred from Chem 7.`,
    parameters: [field('T3', 'Triiodothyronine (T3), Total', 'ng/mL', 'CLIA', 0.60, 1.81, '3053-6'), field('T4', 'Thyroxine (T4), Total', 'ug/dL', 'CLIA', 3.5, 12.6, '3026-2'), field('TSH', 'Thyroid Stimulating Hormone (TSH), Ultrasensitive', 'uIU/mL', 'CLIA', 0.35, 5.50, '3016-3')] }
];

export const methodSuggestions = [...new Set(catalogueTemplates.flatMap((template) => template.parameters.map((parameter) => parameter.method)).filter(Boolean))];
