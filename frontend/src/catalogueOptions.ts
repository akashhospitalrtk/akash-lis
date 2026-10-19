import type { ResultKind } from './types';

export const departmentSuggestions: Record<string, { specimenType: string; resultKind: ResultKind; method: string }> = {
  Laboratory: { specimenType: '', resultKind: 'NUMERIC', method: '' },
  Biochemistry: { specimenType: 'Serum', resultKind: 'NUMERIC', method: 'Enzymatic' },
  Immunoassay: { specimenType: 'Serum', resultKind: 'NUMERIC', method: 'CLIA' },
  Hematology: { specimenType: 'EDTA whole blood', resultKind: 'NUMERIC', method: 'Automated cell counter' },
  Serology: { specimenType: 'Serum', resultKind: 'POS_NEG', method: 'Immunochromatography' },
  'Clinical Pathology': { specimenType: 'Urine', resultKind: 'TEXT', method: 'Microscopy' },
  Microbiology: { specimenType: '', resultKind: 'TEXT', method: 'Culture' },
  Cytology: { specimenType: '', resultKind: 'TEXT', method: 'Microscopy' },
  Histopathology: { specimenType: 'Tissue', resultKind: 'TEXT', method: 'Microscopy' }
};
// Units depend on the analyte, so department selection never assigns a unit.
export const unitOptions = ['mIU/mL', 'µIU/mL', 'mIU/L', 'IU/L', 'U/L', 'mg/dL', 'g/dL', 'ng/mL', 'pg/mL', 'ng/dL', 'µg/dL', 'mmol/L', 'µmol/L', '%', '10^3/µL', '10^6/µL', 'cells/µL', 'seconds', '/HPF'];
export const methodOptions = ['CLIA', 'ECLIA', 'ELISA', 'Enzymatic', 'Colorimetric', 'Immunoturbidimetry', 'Immunochromatography', 'Automated cell counter', 'Microscopy', 'Culture', 'PCR'];
export const specimenOptions = ['Serum', 'Plasma', 'EDTA whole blood', 'Citrate plasma', 'Whole blood', 'Urine', 'Stool', 'Sputum', 'Swab', 'CSF', 'Semen', 'Tissue'];
