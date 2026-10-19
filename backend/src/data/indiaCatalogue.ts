import { parameterSchema, profileSchema, type ParameterInput, type ProfileInput } from '../schemas/profileSchemas.js';

// Editable starting configurations, not manufacturer application settings.
export const catalogueVersion = 'india-common-2026-09-28-v1';
export const catalogueSources = {
  menu: 'https://www.icmr.gov.in/icmrobject/uploads/Report/1752588650_nedl2ndedition.pdf',
  chemistry: 'https://www.erbalachema.com/en/product-support/instructions/instructions-diagnostic-kits/blt-biolatest/',
  h360: 'https://www.erbalachema.com/en/products-and-solutions/hematology/hematology-analyser-h-360/',
  intervals: 'https://www.abim.org/Media/bfijryql/laboratory-reference-ranges.pdf',
};
const guidance = 'Editable common-method starting configuration. Review the method, specimen and units for your assay before reporting. Adult example intervals are not pediatric or pregnancy intervals. Blank intervals require assay-specific interpretation; they do not mean normal.';
const profiles: ProfileInput[] = [];
const p = (code: string, name: string, unit: string, method: string, extra: Partial<ParameterInput> = {}) => parameterSchema.parse({ code, name, unit, method, resultKind: 'NUMERIC', ...extra });
const txt = (code: string, name: string, method: string, note = '') => p(code, name, '', method, { resultKind: 'TEXT', referenceNote: note });
const sel = (code: string, name: string, method: string, options = ['Negative', 'Positive', 'Indeterminate'], note = 'Interpret using the assay instructions and clinical context.') => p(code, name, '', method, { resultKind: 'SELECT', selectOptions: options, referenceNote: note });
const adult = (low: number, high: number, gender?: 'Male' | 'Female') => ({ label: 'Adult example (ABIM); review locally', ageMin: 18, ageUnit: 'years' as const, low, high, ...(gender ? { gender } : {}) });
// Only a small set of closed numerical adult intervals is supplied. No assay cutoffs,
// therapeutic targets, analytical measuring ranges or critical values are invented.
const examples: Record<string, ParameterInput['referenceRanges']> = {
  FBS: [adult(70, 99)], ALB: [adult(3.5, 5.5)], ALT: [adult(10, 40)], AST: [adult(10, 40)],
  ALP: [adult(30, 120)], TBIL: [adult(0.3, 1)], DBIL: [adult(0.1, 0.3)], IBIL: [adult(0.2, 0.7)],
  BUN: [adult(8, 20)], CREAT: [adult(0.5, 1.1, 'Female'), adult(0.7, 1.3, 'Male')],
  NA: [adult(136, 145)], K: [adult(3.5, 5)], CL: [adult(98, 106)], CA: [adult(8.6, 10.2)],
  ICA: [adult(1.16, 1.31)], APTT: [adult(25, 35)], FIBRINOGEN: [adult(200, 400)],
  HB: [adult(12, 16, 'Female'), adult(14, 18, 'Male')], TLC: [adult(4, 11)],
  ESR: [adult(0, 20, 'Female'), adult(0, 15, 'Male')],
};
function panel(code: string, name: string, department: string, specimenType: string, parameters: ParameterInput[], instructions = '') {
  profiles.push(profileSchema.parse({ code, name, department, specimenType, instructions,
    description: `${guidance} Catalogue: ${catalogueVersion}. Sources and limitations: docs/india-catalogue.md.`,
    parameters: parameters.map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 })) }));
}
function numericRows(department: string, specimen: string, method: string, rows: string) {
  for (const line of rows.trim().split('\n')) {
    const [code, name, unit = '', customMethod, customSpecimen] = line.trim().split('|');
    const ranges = examples[code] || [];
    panel(code, name, department, customSpecimen || specimen, [p(code, name, unit, customMethod || method, {
      referenceRanges: ranges,
      description: ranges.length ? `Adult reference example: ${catalogueSources.intervals}. Review for local use. Not established for children or pregnancy.` : 'Reference interval or decision limit depends on assay and patient context; configure locally.',
    })]);
  }
}
function qualitativeRows(department: string, specimen: string, method: string, rows: string, options?: string[]) {
  for (const line of rows.trim().split('\n')) {
    const [code, name, customMethod, customSpecimen] = line.trim().split('|');
    panel(code, name, department, customSpecimen || specimen, [sel(code, name, customMethod || method, options)]);
  }
}
function narrativeRows(department: string, specimen: string, method: string, rows: string) {
  for (const line of rows.trim().split('\n')) {
    const [code, name, customMethod, customSpecimen] = line.trim().split('|');
    panel(code, name, department, customSpecimen || specimen, [txt('FINDINGS', 'Findings', customMethod || method), txt('INTERPRETATION', 'Interpretation', 'Professional interpretation')]);
  }
}
numericRows('Biochemistry', 'Serum', 'Colorimetry', `
FBS|Fasting plasma glucose|mg/dL|GOD-POD|Fluoride plasma
PPBS|Postprandial plasma glucose|mg/dL|GOD-POD|Fluoride plasma
RBS|Random plasma glucose|mg/dL|GOD-POD|Fluoride plasma
HBA1C|HbA1c|%|Ion-exchange HPLC|EDTA whole blood
FRUCTOSAMINE|Fructosamine|umol/L|Nitroblue tetrazolium colorimetry
UREA|Urea|mg/dL|Urease-GLDH
BUN|Blood urea nitrogen|mg/dL|Urease-GLDH
CREAT|Creatinine|mg/dL|Kinetic Jaffe
URIC|Uric acid|mg/dL|Uricase-POD
NA|Sodium|mmol/L|Ion-selective electrode
K|Potassium|mmol/L|Ion-selective electrode
CL|Chloride|mmol/L|Ion-selective electrode
BICARB|Bicarbonate (total CO2)|mmol/L|Enzymatic
CA|Calcium total|mg/dL|Arsenazo III
ICA|Ionized calcium|mmol/L|Direct ion-selective electrode|Heparinized whole blood
PHOS|Inorganic phosphorus|mg/dL|Phosphomolybdate UV
MG|Magnesium|mg/dL|Xylidyl blue
TBIL|Bilirubin total|mg/dL|Diazo
DBIL|Bilirubin direct|mg/dL|Diazo
AST|AST (SGOT)|U/L|IFCC kinetic UV, without P5P
ALT|ALT (SGPT)|U/L|IFCC kinetic UV, without P5P
ALP|Alkaline phosphatase|U/L|pNPP, AMP buffer
GGT|Gamma-glutamyl transferase|U/L|IFCC kinetic
TP|Total protein|g/dL|Biuret
ALB|Albumin|g/dL|Bromocresol green
LDH|Lactate dehydrogenase|U/L|Kinetic UV
AMMONIA|Ammonia|umol/L|Enzymatic GLDH|EDTA plasma
BILE_ACIDS|Total bile acids|umol/L|Enzymatic cycling
CHOL|Total cholesterol|mg/dL|CHOD-PAP
TG|Triglycerides|mg/dL|GPO-PAP
HDL|HDL cholesterol (direct)|mg/dL|Homogeneous enzymatic
LDL|LDL cholesterol (direct)|mg/dL|Homogeneous enzymatic
APOA1|Apolipoprotein A1|mg/dL|Immunoturbidimetry
APOB|Apolipoprotein B|mg/dL|Immunoturbidimetry
LPA|Lipoprotein(a)|mg/dL|Immunoturbidimetry
CK|Creatine kinase total|U/L|NAC-activated kinetic UV
CKMB_ACTIVITY|CK-MB activity|U/L|Immunoinhibition
AMYLASE|Amylase|U/L|Enzymatic colorimetry
LIPASE|Lipase|U/L|Enzymatic colorimetry
IRON|Serum iron|ug/dL|Ferrozine
TIBC|Total iron binding capacity|ug/dL|Colorimetry
UIBC|Unsaturated iron binding capacity|ug/dL|Ferrozine
TRANSFERRIN|Transferrin|mg/dL|Immunoturbidimetry
STFR|Soluble transferrin receptor|mg/L|Immunoturbidimetry
LACTATE|Lactate|mmol/L|Enzymatic|Fluoride plasma
PYRUVATE|Pyruvate|mg/dL|Enzymatic|Specially deproteinized blood
OSM_SERUM|Serum osmolality|mOsm/kg|Freezing-point depression
COPPER|Serum copper|ug/dL|ICP-MS
ZINC|Serum zinc|ug/dL|ICP-MS
SELENIUM|Serum selenium|ug/L|ICP-MS
CERULOPLASMIN|Ceruloplasmin|mg/dL|Immunoturbidimetry
CHOLINESTERASE|Cholinesterase|U/L|Kinetic colorimetry
HAPTOGLOBIN|Haptoglobin|mg/dL|Immunoturbidimetry
ACE|Angiotensin converting enzyme|U/L|Enzymatic spectrophotometry
CYSTATINC|Cystatin C|mg/L|Immunoturbidimetry
SWEAT_CL|Sweat chloride|mmol/L|Coulometric titration|Sweat
`);
numericRows('Immunoassay', 'Serum', 'CLIA', `
TSH|Thyroid stimulating hormone|mIU/L
T3|Triiodothyronine total|ng/dL
T4|Thyroxine total|ug/dL
FT3|Free T3|pg/mL
FT4|Free T4|ng/dL
ANTI_TPO|Anti-thyroid peroxidase antibody|IU/mL
ANTI_TG|Anti-thyroglobulin antibody|IU/mL
TRAB|TSH receptor antibody|IU/L
THYROGLOBULIN|Thyroglobulin|ng/mL
CALCITONIN|Calcitonin|pg/mL
FSH|Follicle stimulating hormone|mIU/mL
LH|Luteinizing hormone|mIU/mL
PROLACTIN|Prolactin|ng/mL
ESTRADIOL|Estradiol|pg/mL
PROGESTERONE|Progesterone|ng/mL
TESTOSTERONE|Testosterone total|ng/dL
FREE_TESTOSTERONE|Testosterone free|pg/mL|Equilibrium dialysis / LC-MS/MS
SHBG|Sex hormone binding globulin|nmol/L
DHEAS|DHEA sulfate|ug/dL
ANDROSTENEDIONE|Androstenedione|ng/dL|LC-MS/MS
OHP17|17-hydroxyprogesterone|ng/dL|LC-MS/MS
AMH|Anti-Mullerian hormone|ng/mL
INHIBIN_A|Inhibin A|pg/mL|ELISA
INHIBIN_B|Inhibin B|pg/mL|ELISA
BHCG|Beta-hCG|mIU/mL
FREE_BHCG|Free beta-hCG|ng/mL
PAPPA|Pregnancy-associated plasma protein A|mIU/L
CORTISOL_AM|Cortisol morning|ug/dL
CORTISOL_PM|Cortisol evening|ug/dL
ACTH|Adrenocorticotropic hormone|pg/mL|CLIA|EDTA plasma
ALDOSTERONE|Aldosterone|ng/dL
RENIN|Direct renin concentration|mIU/L|CLIA|EDTA plasma
GH|Growth hormone|ng/mL
IGF1|Insulin-like growth factor 1|ng/mL
IGFBP3|IGF binding protein 3|ug/mL
INSULIN|Fasting insulin|uIU/mL
CPEPTIDE|C-peptide|ng/mL
PTH|Parathyroid hormone intact|pg/mL
VITD|Vitamin D 25-OH total|ng/mL
VITD125|Vitamin D 1,25-dihydroxy|pg/mL|LC-MS/MS
VITB12|Vitamin B12|pg/mL
FOLATE|Folate serum|ng/mL
FERRITIN|Ferritin|ng/mL
OSTEOCALCIN|Osteocalcin|ng/mL
BCTX|Beta-CTX|ng/mL|ECLIA
P1NP|Procollagen type 1 N-terminal propeptide|ng/mL|ECLIA
TROP_I|Troponin I|ng/mL
TROP_T|Troponin T|ng/mL|ECLIA
HSTROP_I|High sensitivity troponin I|ng/L
HSTROP_T|High sensitivity troponin T|ng/L|ECLIA
CKMB_MASS|CK-MB mass|ng/mL
MYOGLOBIN|Myoglobin|ng/mL
BNP|B-type natriuretic peptide|pg/mL|CLIA|EDTA plasma
NTPROBNP|NT-proBNP|pg/mL|ECLIA
PROCALCITONIN|Procalcitonin|ng/mL
HOMOCYSTEINE|Homocysteine|umol/L|Enzymatic|EDTA plasma
AFP|Alpha-fetoprotein|ng/mL
CEA|Carcinoembryonic antigen|ng/mL
CA125|CA-125|U/mL
CA199|CA 19-9|U/mL
CA153|CA 15-3|U/mL
CA724|CA 72-4|U/mL|ECLIA
PSA|Prostate specific antigen total|ng/mL
FREE_PSA|Prostate specific antigen free|ng/mL
B2MG|Beta-2 microglobulin|mg/L|Immunoturbidimetry
HE4|Human epididymis protein 4|pmol/L|ECLIA
NSE|Neuron specific enolase|ng/mL|ECLIA
CHROMOGRANIN|Chromogranin A|ng/mL|ELISA
SCC|Squamous cell carcinoma antigen|ng/mL
CYFRA21|CYFRA 21-1|ng/mL|ECLIA
PROGRP|Pro-gastrin releasing peptide|pg/mL|ECLIA
GASTRIN|Gastrin|pg/mL
`);
numericRows('Hematology', 'EDTA whole blood', 'Electrical impedance', `
HB|Haemoglobin|g/dL|Cyanide-free colorimetry
TLC|Total leukocyte count|10^3/uL
RBC|Red blood cell count|10^6/uL
PLT|Platelet count|10^3/uL
ESR|Erythrocyte sedimentation rate|mm/hr|Westergren
RETIC|Reticulocyte count|%|Supravital staining and microscopy
AEC|Absolute eosinophil count|cells/uL|Manual counting
IPF|Immature platelet fraction|%|Fluorescence flow cytometry
G6PD|G6PD quantitative|U/g Hb|Kinetic UV
CD4|CD4 absolute count|cells/uL|Flow cytometry
`);
numericRows('Coagulation', 'Sodium citrate plasma', 'Coagulometry', `
PT|Prothrombin time|seconds
APTT|Activated partial thromboplastin time|seconds
TT|Thrombin time|seconds
FIBRINOGEN|Fibrinogen|mg/dL|Clauss
DDIMER|D-dimer|mg/L FEU|Latex immunoturbidimetry
FDP|Fibrin degradation products|ug/mL|Latex immunoturbidimetry
FACTOR8|Factor VIII activity|%
FACTOR9|Factor IX activity|%
FACTOR11|Factor XI activity|%
VWF_AG|von Willebrand factor antigen|%|Immunoturbidimetry
VWF_ACT|von Willebrand factor activity|%|GPIb binding assay
PROTEINC|Protein C activity|%|Chromogenic assay
PROTEINS|Protein S free antigen|%|Immunoturbidimetry
AT3|Antithrombin activity|%|Chromogenic assay
ANTI_XA|Anti-Xa activity|IU/mL|Chromogenic assay
`);
narrativeRows('Coagulation', 'Sodium citrate plasma', 'Coagulometry', `
PT_MIX|PT mixing study
APTT_MIX|APTT mixing study
LUPUS_AC|Lupus anticoagulant testing|Screen, mixing and confirmatory coagulation assays
DRVVT|Dilute Russell viper venom test|Screen and confirmatory coagulation assays
APCR|Activated protein C resistance|Functional coagulation assay
FACTOR13|Factor XIII deficiency screening|Clot solubility screening
`);
numericRows('Immunology', 'Serum', 'Immunoturbidimetry', `
CRP|C-reactive protein|mg/L
HSCRP|High sensitivity C-reactive protein|mg/L
RF|Rheumatoid factor quantitative|IU/mL
ASO|Antistreptolysin O quantitative|IU/mL
ANTI_CCP|Anti-cyclic citrullinated peptide|U/mL|CLIA
C3|Complement C3|mg/dL
C4|Complement C4|mg/dL
CH50|Total complement activity CH50|U/mL|Liposome immunoassay
IGG|Immunoglobulin G|mg/dL
IGA|Immunoglobulin A|mg/dL
IGM|Immunoglobulin M|mg/dL
ALLERGY|Total IgE|IU/mL|CLIA
KAPPA|Free kappa light chains|mg/L|Nephelometry
LAMBDA|Free lambda light chains|mg/L|Nephelometry
`);
qualitativeRows('Immunology', 'Serum', 'ELISA', `
DSDNA|Anti-double stranded DNA antibody
ANTISM|Anti-Smith antibody
ANTIRNP|Anti-U1 RNP antibody
SSA|Anti-SSA (Ro) antibody
SSB|Anti-SSB (La) antibody
SCL70|Anti-Scl-70 antibody
JO1|Anti-Jo-1 antibody
CENTROMERE|Anti-centromere antibody
MPO|Anti-MPO antibody
PR3|Anti-PR3 antibody
ACL_IGG|Anticardiolipin IgG
ACL_IGM|Anticardiolipin IgM
B2GP_IGG|Beta-2 glycoprotein I IgG
B2GP_IGM|Beta-2 glycoprotein I IgM
TTG_IGA|Tissue transglutaminase IgA
TTG_IGG|Tissue transglutaminase IgG
DGP_IGA|Deamidated gliadin peptide IgA
DGP_IGG|Deamidated gliadin peptide IgG
AMA|Anti-mitochondrial antibody|Indirect immunofluorescence
ASMA|Anti-smooth muscle antibody|Indirect immunofluorescence
LKM|Anti-LKM antibody|Indirect immunofluorescence
PCA|Anti-parietal cell antibody|Indirect immunofluorescence
IFAB|Intrinsic factor antibody
GBM|Anti-glomerular basement membrane antibody
ACHR|Acetylcholine receptor antibody|Radioimmunoassay
AQP4|Aquaporin-4 antibody|Cell-based immunofluorescence
MOG|MOG antibody|Cell-based immunofluorescence
EMA|Endomysial IgA antibody|Indirect immunofluorescence
`);
for (const [code, name] of [['ANA','ANA by IFA'],['PANCA','p-ANCA by IFA'],['CANCA','c-ANCA by IFA']]) {
  panel(code, name, 'Immunology', 'Serum', [sel('RESULT', 'Result', 'Indirect immunofluorescence'), txt('TITRE', 'Titre', 'Serial dilution / immunofluorescence'), txt('PATTERN', 'Pattern', 'Indirect immunofluorescence')]);
}
narrativeRows('Immunology', 'Serum', 'Line immunoassay', `
ANA_PROFILE|ANA profile
ENA_PROFILE|Extractable nuclear antigen profile
IGG_SUBCLASSES|IgG subclasses|Immunonephelometry
ALLERGEN_IGE|Allergen specific IgE panel|Fluorescence enzyme immunoassay
`);
qualitativeRows('Serology', 'Serum', 'ELISA', `
DENGUE_NS1|Dengue NS1 antigen
DENGUE_IGM|Dengue IgM
DENGUE_IGG|Dengue IgG
CHIK_IGM|Chikungunya IgM
JE_IGM|Japanese encephalitis IgM
SCRUB_IGM|Scrub typhus IgM
LEPTO_IGM|Leptospira IgM
BRUCELLA|Brucella antibodies|Agglutination
RK39|Kala-azar rK39 antibody|Immunochromatography
MEASLES_IGM|Measles IgM
MUMPS_IGM|Mumps IgM
RUBELLA_IGM|Rubella IgM
RUBELLA_IGG|Rubella IgG
TOXO_IGM|Toxoplasma IgM
TOXO_IGG|Toxoplasma IgG
CMV_IGM|CMV IgM
CMV_IGG|CMV IgG
HSV1_IGG|HSV-1 type specific IgG
HSV2_IGG|HSV-2 type specific IgG
EBV_VCA_IGM|EBV VCA IgM
EBV_VCA_IGG|EBV VCA IgG
EBNA|EBV nuclear antigen IgG
HAV_IGM|Hepatitis A IgM
HEV_IGM|Hepatitis E IgM
HBSAG|HBsAg|CLIA
HBEAG|Hepatitis B e antigen|CLIA
ANTI_HBE|Anti-HBe|CLIA
HBC_TOTAL|Anti-HBc total|CLIA
HBC_IGM|Anti-HBc IgM|CLIA
HCV_AB|Anti-HCV total|CLIA
HIV|HIV I & II|Immunochromatography
HIV_AGAB|HIV-1/2 antigen-antibody screening|CLIA
TPHA|Treponema pallidum haemagglutination|Haemagglutination
COVID_AG|SARS-CoV-2 antigen|Immunochromatography|Nasopharyngeal swab
COVID_AB|SARS-CoV-2 antibodies|CLIA
INFLUENZA_AG|Influenza A/B antigen|Immunochromatography|Nasopharyngeal swab
MALARIA_AG|Malaria antigen (Pf/Pv)|Immunochromatography|EDTA whole blood
CRYPTO_AG|Cryptococcal antigen|Lateral flow immunoassay
`);
numericRows('Serology', 'Serum', 'CLIA', 'ANTI_HBS|Anti-HBs quantitative|mIU/mL');
for (const code of ['RPR','VDRL']) panel(code, `${code} with titre`, 'Serology', 'Serum', [sel('RESULT','Result', 'Flocculation', ['Non-reactive','Reactive']), txt('TITRE','Titre','Serial dilution')]);

numericRows('Clinical Pathology', 'Urine', 'Colorimetry', `
UR_PROTEIN|Urine protein spot|mg/dL|Pyrogallol red
UR_MICROALB|Urine microalbumin spot|mg/L|Immunoturbidimetry
UR_CREAT|Urine creatinine spot|mg/dL|Kinetic Jaffe
UR_CA|Urine calcium spot|mg/dL|Arsenazo III
UR_URIC|Urine uric acid spot|mg/dL|Uricase-POD
UR_NA|Urine sodium spot|mmol/L|Ion-selective electrode
UR_OSM|Urine osmolality|mOsm/kg|Freezing-point depression
`);
for (const [code,name,unit,method] of [
  ['UR24_PROTEIN','24-hour urine protein','mg/24 hr','Pyrogallol red'],
  ['UR24_CREAT','24-hour urine creatinine','mg/24 hr','Kinetic Jaffe'],
  ['UR24_CA','24-hour urine calcium','mg/24 hr','Arsenazo III'],
  ['UR24_URIC','24-hour urine uric acid','mg/24 hr','Uricase-POD'],
  ['UR24_NA','24-hour urine sodium','mmol/24 hr','Ion-selective electrode'],
  ['UR24_CORTISOL','24-hour urine free cortisol','ug/24 hr','LC-MS/MS'],
  ['UR24_VMA','24-hour urine VMA','mg/24 hr','HPLC'],
  ['UR24_METAN','24-hour urine metanephrines','ug/24 hr','LC-MS/MS'],
]) panel(code, name, 'Clinical Pathology', '24-hour urine', [p('VOLUME','Collection volume','mL','Volumetry'),p('DURATION','Collection duration','hours','Recorded collection time'),p('EXCRETION',name,unit,method)], 'Record complete collection duration and total volume. Enter the laboratory-calculated excretion.');
qualitativeRows('Clinical Pathology', 'Urine', 'Reagent strip', `
UPT|Urine Pregnancy Test|Immunochromatography
UR_KETONES|Urine ketones
UR_BLOOD|Urine blood / haemoglobin
UR_BILE|Urine bilirubin
`);
narrativeRows('Clinical Pathology','Urine','Microscopy', 'UR_EOS|Urine eosinophils|Hansel stain\nBENCEJONES|Urinary Bence Jones protein|Immunofixation');
qualitativeRows('Clinical Pathology','Stool','Immunochromatography', `
STOOL_OCCULT|Faecal occult blood (FIT)
ROTA_AG|Rotavirus antigen
ADENO_AG|Adenovirus antigen
HP_STOOL|Helicobacter pylori stool antigen
CDIFF_TOXIN|Clostridioides difficile toxin A/B|Enzyme immunoassay
STOOL_REDUCING|Stool reducing substances|Copper reduction
STOOL_FAT|Stool fat qualitative|Sudan staining
`);
numericRows('Clinical Pathology','Stool','ELISA','CALPROTECTIN|Faecal calprotectin|ug/g\nELASTASE|Faecal elastase|ug/g\nSTOOL_PH|Stool pH||pH indicator');
narrativeRows('Microbiology','Specimen as submitted','Microscopy', `
PBS|Peripheral blood smear|Stained smear microscopy|EDTA whole blood
MALARIA|Malaria Parasite Examination|Thick and thin smear microscopy|EDTA whole blood
FILARIA|Microfilaria examination|Thick smear microscopy|Timed peripheral blood
GRAM|Gram stain|Gram staining
AFB|AFB smear|Ziehl-Neelsen stain|Sputum
MOD_AFB|Modified acid-fast smear|Modified acid-fast stain
KOH|KOH mount|Potassium hydroxide wet mount
FUNGAL_STAIN|Fungal stain|Calcofluor white microscopy
INDIA_INK|India ink preparation|Negative staining|CSF
ALBERT|Albert stain|Albert staining|Throat swab
WETMOUNT|Wet mount|Wet mount microscopy
SLITSKIN|Slit-skin smear|Modified acid-fast stain|Slit-skin smear
CORNEAL|Corneal scraping examination|Microscopy|Corneal scraping
VAGINAL_WET|Vaginal wet mount|Wet mount microscopy|Vaginal swab
STOOL|Stool routine and microscopy|Macroscopy and microscopy|Stool
`);
for (const [code,specimen] of Object.entries({ BLOOD:'Blood',URINE:'Urine',STOOL:'Stool',SPUTUM:'Sputum',THROAT:'Throat swab',PUS:'Pus',CSF:'CSF',FLUID:'Sterile body fluid',HVS:'High vaginal swab',CERVICAL:'Endocervical swab',URETHRAL:'Urethral swab',SEMEN:'Semen',TISSUE:'Tissue',CATHETER:'Catheter tip',EAR:'Ear swab',EYE:'Eye swab',NASAL:'Nasal swab',BAL:'Bronchoalveolar lavage' })) {
  panel(`CULT_${code}`, `${specimen} culture and susceptibility`, 'Microbiology', specimen, [
    txt('MICROSCOPY','Direct microscopy','Microscopy'), txt('GROWTH','Culture findings','Aerobic culture'),
    txt('ORGANISM','Organism identification','Biochemical identification'),
    txt('AST','Antimicrobial susceptibility','Disc diffusion / MIC', 'Report organism, antimicrobial, MIC or zone, units, interpretation and breakpoint standard/version for each isolate.'),
    txt('COMMENT','Interpretation','Professional interpretation'),
  ]);
}
narrativeRows('Microbiology','Specimen as submitted','Culture and identification', `
FUNGAL_CULT|Fungal culture|Fungal culture and microscopy
ANAEROBIC_CULT|Anaerobic culture|Anaerobic culture and identification
TB_CULT|Mycobacterial liquid culture|Liquid culture
TB_SOLID_CULT|Mycobacterial solid culture|Lowenstein-Jensen culture
TB_DST1|TB first-line susceptibility|Phenotypic susceptibility
TB_DST2|TB second-line susceptibility|Phenotypic susceptibility
CHOLERA_CULT|Vibrio cholerae culture|Selective culture|Stool
DIPHTHERIA_CULT|Diphtheria culture|Selective culture|Throat swab
MRSA|MRSA detection|Cefoxitin susceptibility testing
ESBL|ESBL detection|Combined disc testing
CARBAPENEMASE|Carbapenemase detection|Carbapenem inactivation method
VRE|VRE detection|Susceptibility testing
MIC|Minimum inhibitory concentration|Broth microdilution
`);
qualitativeRows('Molecular Diagnostics','Specimen as submitted','Real-time PCR', `
MTB_NAAT|Mycobacterium tuberculosis NAAT
HCV_QUAL|HCV RNA qualitative|Real-time RT-PCR|EDTA plasma
HPV_DNA|High-risk HPV DNA|Real-time PCR|Cervical sample
COVID_PCR|SARS-CoV-2 RNA|Real-time RT-PCR|Respiratory swab
FLU_PCR|Influenza A/B RNA|Real-time RT-PCR|Respiratory swab
CT_PCR|Chlamydia trachomatis DNA|Real-time PCR|First-catch urine / genital swab
NG_PCR|Neisseria gonorrhoeae DNA|Real-time PCR|First-catch urine / genital swab
HSV_PCR|HSV-1/2 DNA
HIV_EID|HIV early infant diagnosis|Nucleic acid amplification|Dried blood spot
HLA_B27|HLA-B27|PCR-SSP|EDTA whole blood
` , ['Not detected','Detected','Indeterminate','Invalid']);
numericRows('Molecular Diagnostics','EDTA plasma','Real-time PCR', `
HBV_DNA|HBV DNA viral load|IU/mL
HCV_RNA|HCV RNA viral load|IU/mL|Real-time RT-PCR
HIV_VL|HIV-1 RNA viral load|copies/mL|Real-time RT-PCR
CMV_VL|CMV DNA viral load|IU/mL
EBV_VL|EBV DNA viral load|IU/mL
BK_VL|BK virus DNA viral load|IU/mL
`);
// Numeric viral loads also require detection and quantification-limit text; zero is
// never used to represent undetected or below-quantification results.
for (const profile of profiles.filter(x => ['HBV_DNA','HCV_RNA','HIV_VL','CMV_VL','EBV_VL','BK_VL'].includes(x.code))) {
  profile.parameters.push(sel('DETECTION','Detection status','Nucleic acid amplification',['Not detected','Detected below quantification','Quantified','Above quantification','Invalid']),txt('LIMITS','Assay limits and interpretation','Assay-specific interpretation'));
}
narrativeRows('Molecular Diagnostics','Specimen as submitted','Multiplex PCR', `
RESP_PANEL|Respiratory pathogen panel
ME_PANEL|Meningitis encephalitis panel||CSF
GI_PANEL|Gastrointestinal pathogen panel||Stool
TB_LPA|TB line probe assay|Reverse hybridization
`);
for (const [code,name,method] of [
  ['BCRABL','BCR-ABL1 qualitative','RT-PCR'],['BCRABL_QUANT','BCR-ABL1 quantitative','Real-time RT-PCR, international scale'],
  ['PMLRARA','PML-RARA','RT-PCR'],['JAK2V617F','JAK2 V617F','Allele-specific PCR'],['JAK2EX12','JAK2 exon 12','Sequencing'],
  ['CALR','CALR mutation','Fragment analysis / sequencing'],['MPL','MPL mutation','Sequencing'],['NPM1','NPM1 mutation','PCR / sequencing'],
  ['FLT3','FLT3 mutation','PCR and fragment analysis'],['EGFR','EGFR mutation','Real-time PCR'],['KRAS','KRAS mutation','Real-time PCR'],
  ['NRAS','NRAS mutation','Real-time PCR'],['BRAF','BRAF mutation','Real-time PCR'],['ALK','ALK rearrangement','FISH'],
  ['ROS1','ROS1 rearrangement','FISH'],['HER2_FISH','HER2 amplification','FISH'],['BRCA','BRCA1 and BRCA2','NGS with deletion/duplication analysis'],
  ['MSI','Microsatellite instability','PCR fragment analysis'],['NTRK','NTRK fusion','RNA sequencing'],
]) narrativeRows('Molecular Oncology','Specimen specified by performing laboratory',method,`${code}|${name}`);
narrativeRows('Histopathology','Formalin-fixed tissue','Histological examination', `
BIOPSY_SMALL|Small biopsy histopathology
BIOPSY_LARGE|Resection specimen histopathology
FROZEN|Frozen section|Cryostat histology|Fresh tissue
DECALC|Decalcified tissue histopathology
SPECIAL_STAINS|Histochemical special stains|Histochemistry
IHC|Immunohistochemistry panel|Immunohistochemistry
RENAL_BIOPSY|Renal biopsy examination|Light microscopy, immunofluorescence and electron microscopy|Renal tissue in appropriate media
LIVER_BIOPSY|Liver biopsy examination
BM_BIOPSY|Bone marrow trephine biopsy
MMR_IHC|Mismatch repair protein panel|Immunohistochemistry
ERPRHER2|ER PR HER2 breast markers|Immunohistochemistry
KI67|Ki-67 proliferation index|Immunohistochemistry
PDL1|PD-L1 expression|Immunohistochemistry
`);
for (const profile of profiles.filter(x => x.department === 'Histopathology')) {
  profile.parameters = [txt('SITE','Specimen and site','Gross examination'),txt('CLINICAL','Clinical information','Provided clinical history'),txt('GROSS','Gross description','Gross examination'),txt('MICRO','Microscopic description',profile.parameters[0].method || 'Histology'),txt('DIAGNOSIS','Diagnosis','Pathologist interpretation'),txt('COMMENT','Comment','Pathologist interpretation')];
}
narrativeRows('Cytology','Specimen as submitted','Cytological examination', `
FNAC|Fine needle aspiration cytology||Aspirate
PAP|Pap Smear|Papanicolaou staining|Cervical smear
LBC|Liquid based cervical cytology|Liquid based cytology|Cervical sample
FLUID_CYTO|Body fluid cytology||Body fluid
SPUTUM_CYTO|Sputum cytology||Sputum
URINE_CYTO|Urine cytology||Urine
BRUSH_CYTO|Brush cytology||Brush specimen
CELLBLOCK|Cell block examination|Cell block histology
BM_ASPIRATE|Bone marrow aspiration examination|Stained smear microscopy|Bone marrow aspirate
`);
narrativeRows('Flow Cytometry','Specimen specified by performing laboratory','Flow cytometry', `
FLOW_ACUTE|Acute leukaemia immunophenotyping
FLOW_CHRONIC|Chronic leukaemia immunophenotyping
FLOW_LYMPHOMA|Lymphoma immunophenotyping
FLOW_PLASMA|Plasma cell disorder panel
PNH|PNH clone analysis
MRD|Minimal residual disease panel
`);
narrativeRows('Genetics','Specimen specified by performing laboratory','Cytogenetic analysis', `
KARYOTYPE|Constitutional karyotype|G-banded karyotyping|Heparinized blood
BM_KARYOTYPE|Bone marrow karyotype|G-banded karyotyping|Heparinized bone marrow
FISH_MYELOMA|Myeloma FISH panel|FISH
FISH_MDS|MDS FISH panel|FISH
PRENATAL_KARYO|Prenatal karyotype|G-banded karyotyping|Amniotic fluid / chorionic villi
QFPCR|Common aneuploidy QF-PCR|Quantitative fluorescent PCR
NIPT|Non-invasive prenatal screening|Cell-free DNA sequencing|Maternal blood in cell-free DNA tube
THAL_GENE|Thalassaemia mutation analysis|PCR and sequencing|EDTA whole blood
SMA|Spinal muscular atrophy testing|MLPA|EDTA whole blood
FRAGILEX|Fragile X testing|Repeat-primed PCR|EDTA whole blood
CMA|Chromosomal microarray|SNP / oligonucleotide microarray|EDTA whole blood
EXOME|Clinical exome sequencing|NGS|EDTA whole blood
WES|Whole exome sequencing|NGS|EDTA whole blood
`);
numericRows('Therapeutic Drug Monitoring','Serum','Immunoassay', `
LITHIUM|Lithium|mmol/L|Ion-selective electrode
DIGOXIN|Digoxin|ng/mL
PHENYTOIN|Phenytoin total|ug/mL
VALPROATE|Valproic acid|ug/mL
CARBAMAZEPINE|Carbamazepine|ug/mL
PHENOBARBITAL|Phenobarbital|ug/mL
LEVETIRACETAM|Levetiracetam|ug/mL|LC-MS/MS
TACROLIMUS|Tacrolimus|ng/mL|LC-MS/MS|EDTA whole blood
CYCLOSPORINE|Cyclosporine|ng/mL|LC-MS/MS|EDTA whole blood
METHOTREXATE|Methotrexate|umol/L
VANCOMYCIN|Vancomycin|ug/mL
GENTAMICIN|Gentamicin|ug/mL
AMIKACIN|Amikacin|ug/mL
THEOPHYLLINE|Theophylline|ug/mL
PARACETAMOL|Paracetamol|ug/mL|Enzymatic colorimetry
SALICYLATE|Salicylate|mg/dL|Colorimetry
ETHANOL|Ethanol|mg/dL|Headspace gas chromatography|Fluoride whole blood
LEAD|Blood lead|ug/dL|ICP-MS|Trace-element EDTA whole blood
MERCURY|Blood mercury|ug/L|ICP-MS|Trace-element whole blood
ARSENIC|Urine arsenic|ug/L|ICP-MS|Urine
`);
qualitativeRows('Toxicology','Urine','Immunoassay', `
AMPHETAMINE|Amphetamine screen
BENZODIAZEPINE|Benzodiazepine screen
CANNABIS|Cannabinoid screen
COCAINE|Cocaine metabolite screen
OPIATES|Opiate screen
BARBITURATE|Barbiturate screen
METHADONE|Methadone screen
`);
narrativeRows('Metabolic Screening','Specimen specified by performing laboratory','Tandem mass spectrometry', `
NBS|Expanded newborn screening||Dried blood spot
NBS_TSH|Newborn TSH|Fluoroimmunoassay|Dried blood spot
NBS_OHP17|Newborn 17-hydroxyprogesterone|Fluoroimmunoassay|Dried blood spot
NBS_G6PD|Newborn G6PD|Fluorometry|Dried blood spot
NBS_PHE|Newborn phenylalanine||Dried blood spot
NBS_GAL|Newborn galactosaemia screen|Enzymatic fluorometry|Dried blood spot
NBS_BIOT|Newborn biotinidase|Enzymatic colorimetry|Dried blood spot
NBS_IRT|Newborn immunoreactive trypsinogen|Fluoroimmunoassay|Dried blood spot
AMINO_ACIDS|Plasma amino acid profile|LC-MS/MS|Heparin plasma
ORGANIC_ACIDS|Urine organic acid profile|GC-MS|Urine
ACYLCARNITINE|Acylcarnitine profile||Dried blood spot
MPS|Mucopolysaccharidosis screening|Glycosaminoglycan analysis|Urine
`);

// Panels reuse the very same analyte definitions (units, methods and intervals).
const param = (code: string) => structuredClone(profiles.find(item => item.code === code)!.parameters[0]);
panel('LFT','Liver Function Test','Biochemistry','Serum',[
  ...['TBIL','DBIL'].map(param), p('IBIL','Bilirubin indirect','mg/dL','Calculated',{calculationFormula:'TBIL - DBIL', referenceRanges:examples.IBIL}),
  ...['AST','ALT','ALP','GGT','TP','ALB'].map(param), p('GLOB','Globulin','g/dL','Calculated',{calculationFormula:'TP - ALB'}),p('AGR','Albumin globulin ratio','ratio','Calculated',{calculationFormula:'ALB / GLOB'}),
]);
panel('KFT','Kidney Function Test','Biochemistry','Serum',['UREA','CREAT','URIC','NA','K','CL'].map(param));
panel('ELECTROLYTES','Electrolytes','Biochemistry','Serum',['NA','K','CL'].map(param));
panel('LIPID','Lipid Profile','Biochemistry','Serum', [...['CHOL','TG','HDL','LDL'].map(param),p('NONHDL','Non-HDL cholesterol','mg/dL','Calculated',{calculationFormula:'CHOL - HDL'}),p('CHOL_HDL','Total cholesterol HDL ratio','ratio','Calculated',{calculationFormula:'CHOL / HDL'})]);
panel('THYROID','Thyroid Profile','Immunoassay','Serum',['T3','T4','TSH'].map(param));
panel('FREE_THYROID','Free Thyroid Profile','Immunoassay','Serum',['FT3','FT4','TSH'].map(param));
panel('IRON_PROFILE','Iron Profile','Biochemistry','Serum',[...['IRON','TIBC','FERRITIN'].map(param),p('TSAT','Transferrin saturation','%','Calculated',{calculationFormula:'IRON / TIBC * 100'})]);
panel('COAG_PROFILE','Coagulation Profile','Coagulation','Sodium citrate plasma',[param('PT'),p('INR','INR','ratio','Instrument calculation using reagent ISI'),param('APTT'),param('FIBRINOGEN')]);
panel('DENGUE','Dengue Panel','Serology','Serum',['DENGUE_NS1','DENGUE_IGM','DENGUE_IGG'].map(param));
panel('VIRAL','Viral Markers','Serology','Serum',['HBSAG','HCV_AB','HIV'].map(param));
panel('UR_ACR','Urine albumin creatinine ratio','Clinical Pathology','Urine',[param('UR_MICROALB'),param('UR_CREAT'),p('ACR','Albumin creatinine ratio','mg/g','Calculated',{calculationFormula:'UR_MICROALB / UR_CREAT * 100'})]);
panel('UR_PCR','Urine protein creatinine ratio','Clinical Pathology','Urine',[param('UR_PROTEIN'),param('UR_CREAT'),p('PCR','Protein creatinine ratio','mg/g','Calculated',{calculationFormula:'UR_PROTEIN / UR_CREAT * 1000'})]);
panel('OGTT','Oral glucose tolerance test (75 g, nonpregnant adult)','Biochemistry','Fluoride plasma',[p('FASTING','Fasting glucose','mg/dL','GOD-POD'),p('TWO_HOUR','Two-hour glucose','mg/dL','GOD-POD')], 'Record glucose dose and exact collection times. Pregnancy protocols require a separate profile.');
panel('OGTT_GDM','Gestational OGTT (75 g, fasting protocol)','Biochemistry','Fluoride plasma',[p('FASTING','Fasting glucose','mg/dL','GOD-POD'),p('ONE_HOUR','One-hour glucose','mg/dL','GOD-POD'),p('TWO_HOUR','Two-hour glucose','mg/dL','GOD-POD')], 'Use the locally selected gestational diabetes protocol and its decision thresholds.');
panel('CBC','Complete Blood Count','Hematology','EDTA whole blood',[
  param('HB'),param('TLC'),param('RBC'),p('PCV','Haematocrit','%','Analyzer calculated'),p('MCV','Mean corpuscular volume','fL','Analyzer measured'),p('MCH','Mean corpuscular haemoglobin','pg','Analyzer calculated'),p('MCHC','Mean corpuscular haemoglobin concentration','g/dL','Analyzer calculated'),p('RDWCV','RDW-CV','%','RBC distribution analysis'),p('RDWSD','RDW-SD','fL','RBC distribution analysis'),param('PLT'),p('MPV','Mean platelet volume','fL','Platelet distribution analysis'),p('PCT','Plateletcrit','%','Analyzer platelet index'),p('PDWCV','PDW-CV','%','Platelet distribution analysis'),p('PDWSD','PDW-SD','fL','Platelet distribution analysis'),p('PLCR','Platelet large cell ratio','%','Platelet distribution analysis'),p('PLCC','Platelet large cell count','10^3/uL','Analyzer platelet index'),
  ...['LYMPH','MID','GRAN'].flatMap(code => [p(code,`${code} percentage`,'%','Electrical impedance, three-part differential'),p(`${code}_ABS`,`${code} absolute`,'10^3/uL','Electrical impedance, three-part differential')]),
], 'Three-part differential: MID is mixed cells and GRAN is granulocytes. Do not relabel as monocytes or neutrophils.');
panel('MANUAL_DIFF','Manual differential leukocyte count','Hematology','EDTA whole blood',['Neutrophils','Lymphocytes','Monocytes','Eosinophils','Basophils'].map(name => p(name.toUpperCase(),name,'%','Stained smear microscopy')));
panel('HB_HPLC','Haemoglobin fractionation','Hematology','EDTA whole blood',[p('HBA','HbA','%','HPLC'),p('HBA2','HbA2','%','HPLC'),p('HBF','HbF','%','HPLC'),txt('VARIANTS','Variant haemoglobins','HPLC'),txt('INTERPRETATION','Interpretation','Professional interpretation')]);
qualitativeRows('Hematology','EDTA whole blood','Sodium metabisulfite screening','SICKLING|Sickling test');
narrativeRows('Hematology','EDTA whole blood','Osmotic fragility assay','OSM_FRAG|Osmotic fragility');
panel('URINE','Urine Routine Examination','Clinical Pathology','Urine',[
  txt('COLOUR','Colour','Visual examination'),txt('APPEARANCE','Appearance','Visual examination'),p('PH','pH','','Reagent strip'),p('SG','Specific gravity','','Reagent strip'),
  ...['Protein','Glucose','Ketones','Blood','Bilirubin','Leukocyte esterase'].map(name => sel(name.toUpperCase().replaceAll(' ','_'),name,'Reagent strip',['Negative','Trace','1+','2+','3+','4+'])),
  sel('NITRITE','Nitrite','Reagent strip',['Negative','Positive']),txt('UROB','Urobilinogen','Reagent strip'),
  ...['RBC','WBC','EPITHELIAL'].map(code => p(code,`${code} cells`,'/HPF','Microscopy')),
  txt('CASTS','Casts','Microscopy'),txt('CRYSTALS','Crystals','Microscopy'),txt('ORGANISMS','Organisms','Microscopy'),
]);
panel('SEMEN','Semen Analysis','Clinical Pathology','Semen',[
  p('VOLUME','Volume','mL','Volumetry'),p('PH','pH','','pH indicator'),txt('LIQUEFACTION','Liquefaction','Timed observation'),txt('VISCOSITY','Viscosity','Visual examination'),p('CONCENTRATION','Sperm concentration','10^6/mL','Counting chamber microscopy'),p('TOTAL','Total sperm number','10^6/ejaculate','Calculated',{calculationFormula:'VOLUME * CONCENTRATION'}),p('PROGRESSIVE','Progressive motility','%','Microscopy'),p('NONPROGRESSIVE','Non-progressive motility','%','Microscopy'),p('IMMOTILE','Immotile sperm','%','Microscopy'),p('VITALITY','Vitality','%','Eosin-nigrosin staining'),p('MORPHOLOGY','Normal forms','%','Stained smear microscopy'),txt('CELLS','Other cells','Microscopy'),
], 'Record abstinence interval, collection completeness and collection/analysis times.');
narrativeRows('Clinical Pathology','Semen','Microscopy','POST_VASECTOMY|Post-vasectomy semen examination');
qualitativeRows('Clinical Pathology','Semen','Resorcinol colorimetry','SEM_FRUCTOSE|Semen fructose');
for (const [code,specimen] of Object.entries({CSF:'CSF',PLEURAL:'Pleural fluid',ASCITIC:'Ascitic fluid',SYNOVIAL:'Synovial fluid',PERICARDIAL:'Pericardial fluid',BAL_FLUID:'Bronchoalveolar lavage'})) {
  panel(`${code}_ANALYSIS`,`${specimen} analysis`,'Clinical Pathology',specimen,[txt('APPEARANCE','Appearance','Visual examination'),p('WBC','Nucleated cells','cells/uL','Counting chamber'),p('RBC','Red cells','cells/uL','Counting chamber'),txt('DIFF','Differential cell count','Microscopy'),p('GLUCOSE','Glucose','mg/dL','GOD-POD'),p('PROTEIN','Total protein',code==='CSF'?'mg/dL':'g/dL',code==='CSF'?'Pyrogallol red':'Biuret'),txt('COMMENT','Interpretation','Professional interpretation')]);
}
numericRows('Biochemistry','Pleural fluid','Enzymatic colorimetry','PLEURAL_ADA|Pleural fluid ADA|U/L');
narrativeRows('Clinical Pathology','Synovial fluid','Polarized light microscopy','CRYSTALS|Synovial crystals');
narrativeRows('Immunology','CSF and paired serum','Isoelectric focusing and immunoblot','OCB|CSF oligoclonal bands');
panel('ABG','Arterial blood gas analysis','Biochemistry','Heparinized arterial whole blood',[
  p('PH','pH','','Potentiometry'),p('PCO2','pCO2','mmHg','Potentiometry'),p('PO2','pO2','mmHg','Amperometry'),p('HCO3','Bicarbonate','mmol/L','Analyzer calculated'),p('BE','Base excess','mmol/L','Analyzer calculated'),p('SAT','Oxygen saturation','%','Co-oximetry'),
], 'Record collection time, oxygen therapy and inspired oxygen fraction.');
panel('BLOOD_GROUP','ABO and RhD grouping','Immunohaematology','EDTA whole blood',[sel('ABO','ABO group','Forward and reverse agglutination',['A','B','AB','O','Discrepant']),sel('RHD','RhD','Agglutination',['Positive','Negative','Indeterminate'])]);
qualitativeRows('Immunohaematology','EDTA whole blood','Antiglobulin test','DAT|Direct antiglobulin test\nIAT|Indirect antiglobulin test||Serum');
narrativeRows('Immunohaematology','Specimen specified by blood bank','Immunohaematology', 'AB_SCREEN|Red cell antibody screen|Indirect antiglobulin test\nAB_IDENT|Red cell antibody identification|Reagent cell panel\nCROSSMATCH|Blood compatibility testing|Serological crossmatch\nRH_PHENOTYPE|Extended Rh and Kell phenotype|Agglutination\nAB_TITRE|Red cell antibody titre|Serial dilution antiglobulin testing');

export const indiaCatalogue = profiles.map(profile => profileSchema.parse({ ...profile, parameters: profile.parameters.map((item,index) => ({ ...item,sortOrder:(index+1)*10 })) }));
const codes = indiaCatalogue.map(profile => profile.code);
if (new Set(codes).size !== codes.length) throw new Error('Duplicate master catalogue profile code.');

// Known local aliases are only used to SKIP duplicates, never to edit an existing test.
export const catalogueAliases: Record<string, string[]> = {
  CBC:['CBC','CBP','HEMOGRAM'],LFT:['LFT','LIVER'],KFT:['KFT','RFT','RENAL'],LIPID:['LIPID','LIPID_PROFILE'],
  CREAT:['CREAT','CREATININE'],FBS:['FBS','FPG'],PPBS:['PPBS','PPBG'],RBS:['RBS','RBG'],
  ALLERGY:['ALLERGY','IGE'],VITB12:['VITB12','B12'],VITD:['VITD','VITD3'],THYROID:['THYROID','TFT'],
  BLOOD_GROUP:['BLOOD_GROUP','ABO_RH'],HB_HPLC:['HB_HPLC','HB_ELECTROPHORESIS'],
};
