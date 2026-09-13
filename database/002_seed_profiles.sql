-- Bootstrap only: administrator edits, blanks, archives and renamed codes survive restarts.
DO $catalogue_seed$
BEGIN
  IF EXISTS (SELECT 1 FROM test_profiles) THEN RETURN; END IF;
INSERT INTO test_profiles (code, name, department) VALUES
  ('CBC', 'Complete Blood Count', 'Hematology'),
  ('LFT', 'Liver Function Test', 'Biochemistry'),
  ('KFT', 'Kidney Function Test', 'Biochemistry'),
  ('WIDAL', 'Widal Test', 'Serology'),
  ('VIRAL', 'Viral Markers', 'Serology'),
  ('VITD', 'Vitamin D3', 'Immunoassay'),
  ('VITB12', 'Vitamin B12', 'Immunoassay'),
  ('BHCG', 'Beta-hCG', 'Immunoassay'),
  ('UPT', 'Urine Pregnancy Test', 'Clinical Pathology'),
  ('URINE', 'Urine Routine Examination', 'Clinical Pathology'),
  ('THYROID', 'Thyroid Profile', 'Immunoassay'),
  ('HBA1C', 'HbA1c', 'Biochemistry'),
  ('MALARIA', 'Malaria Parasite Examination', 'Clinical Pathology'),
  ('DENGUE', 'Dengue Panel', 'Serology'),
  ('SEMEN', 'Semen Analysis', 'Clinical Pathology'),
  ('PAP', 'Pap Smear', 'Cytology'),
  ('ALLERGY', 'Total IgE', 'Immunoassay'),
  ('HBSAG', 'HBsAg', 'Serology'),
  ('HIV', 'HIV I & II', 'Serology')
ON CONFLICT (code) DO NOTHING;

INSERT INTO profile_parameters (profile_id, code, name, result_kind, unit, reference_ranges, select_options, calculation_formula, sort_order)
SELECT id, p.code, p.name, p.kind::result_kind, p.unit, p.ranges::jsonb, p.options::jsonb, p.formula, p.sort_order
FROM test_profiles t
JOIN (VALUES
  ('CBC','HB','Hemoglobin','NUMERIC','g/dL','[{"label":"Adult male","gender":"Male","low":13,"high":17},{"label":"Adult female","gender":"Female","low":12,"high":15},{"label":"Child","ageMax":12,"low":11,"high":14}]','[]',NULL,10),
  ('CBC','TLC','Total Leukocyte Count','NUMERIC','/cumm','[{"label":"Adult","low":4000,"high":11000}]','[]',NULL,20),
  ('CBC','RBC','Red Blood Cell Count','NUMERIC','million/cumm','[{"label":"Adult male","gender":"Male","low":4.5,"high":5.9},{"label":"Adult female","gender":"Female","low":4.1,"high":5.1}]','[]',NULL,30),
  ('CBC','PCV','Packed Cell Volume','NUMERIC','%','[{"label":"Adult male","gender":"Male","low":40,"high":52},{"label":"Adult female","gender":"Female","low":36,"high":48}]','[]',NULL,40),
  ('CBC','MCV','Mean Corpuscular Volume','NUMERIC','fL','[{"label":"Adult","low":80,"high":100}]','[]',NULL,50),
  ('CBC','MCH','Mean Corpuscular Hemoglobin','NUMERIC','pg','[{"label":"Adult","low":27,"high":32}]','[]',NULL,60),
  ('CBC','MCHC','Mean Corpuscular Hb Concentration','NUMERIC','g/dL','[{"label":"Adult","low":32,"high":36}]','[]',NULL,70),
  ('CBC','PLT','Platelet Count','NUMERIC','lakh/cumm','[{"label":"Adult","low":1.5,"high":4.5}]','[]',NULL,80),
  ('CBC','NEUT','Neutrophils','NUMERIC','%','[{"label":"Adult","low":40,"high":75}]','[]',NULL,90),
  ('CBC','LYMPH','Lymphocytes','NUMERIC','%','[{"label":"Adult","low":20,"high":45}]','[]',NULL,100),
  ('CBC','EOS','Eosinophils','NUMERIC','%','[{"label":"Adult","low":1,"high":6}]','[]',NULL,110),
  ('CBC','MONO','Monocytes','NUMERIC','%','[{"label":"Adult","low":2,"high":10}]','[]',NULL,120),
  ('CBC','BASO','Basophils','NUMERIC','%','[{"label":"Adult","low":0,"high":2}]','[]',NULL,130),
  ('LFT','TBIL','Total Bilirubin','NUMERIC','mg/dL','[{"label":"Adult","low":0.2,"high":1.2}]','[]',NULL,10),
  ('LFT','DBIL','Direct Bilirubin','NUMERIC','mg/dL','[{"label":"Adult","low":0,"high":0.3}]','[]',NULL,20),
  ('LFT','AST','SGOT (AST)','NUMERIC','U/L','[{"label":"Adult","low":0,"high":40}]','[]',NULL,30),
  ('LFT','ALT','SGPT (ALT)','NUMERIC','U/L','[{"label":"Adult","low":0,"high":41}]','[]',NULL,40),
  ('LFT','ALP','Alkaline Phosphatase','NUMERIC','U/L','[{"label":"Adult","low":44,"high":147}]','[]',NULL,50),
  ('LFT','TP','Total Protein','NUMERIC','g/dL','[{"label":"Adult","low":6.0,"high":8.3}]','[]',NULL,60),
  ('LFT','ALB','Albumin','NUMERIC','g/dL','[{"label":"Adult","low":3.5,"high":5.0}]','[]',NULL,70),
  ('LFT','GLOB','Globulin','NUMERIC','g/dL','[{"label":"Adult","low":2.0,"high":3.5}]','[]',NULL,80),
  ('LFT','AGR','A/G Ratio','NUMERIC','','[{"label":"Adult","low":1.0,"high":2.5}]','[]','ALB / GLOB',90),
  ('KFT','UREA','Blood Urea','NUMERIC','mg/dL','[{"label":"Adult","low":15,"high":40}]','[]',NULL,10),
  ('KFT','CREAT','Serum Creatinine','NUMERIC','mg/dL','[{"label":"Adult male","gender":"Male","low":0.74,"high":1.35},{"label":"Adult female","gender":"Female","low":0.59,"high":1.04}]','[]',NULL,20),
  ('KFT','NA','Sodium','NUMERIC','mmol/L','[{"label":"Adult","low":135,"high":145}]','[]',NULL,30),
  ('KFT','K','Potassium','NUMERIC','mmol/L','[{"label":"Adult","low":3.5,"high":5.1}]','[]',NULL,40),
  ('KFT','CL','Chloride','NUMERIC','mmol/L','[{"label":"Adult","low":98,"high":107}]','[]',NULL,50),
  ('WIDAL','S_TYphi_O','S. Typhi O','TEXT','Titre','[]','[]',NULL,10),
  ('WIDAL','S_TYphi_H','S. Typhi H','TEXT','Titre','[]','[]',NULL,20),
  ('WIDAL','S_PARATYPHI_AH','S. Paratyphi AH','TEXT','Titre','[]','[]',NULL,30),
  ('WIDAL','S_PARATYPHI_BH','S. Paratyphi BH','TEXT','Titre','[]','[]',NULL,40),
  ('VIRAL','HBsAg','HBsAg','POS_NEG','','[]','["Negative","Positive"]',NULL,10),
  ('VIRAL','HCV','Anti-HCV','POS_NEG','','[]','["Negative","Positive"]',NULL,20),
  ('VIRAL','HIV','HIV I & II','POS_NEG','','[]','["Negative","Positive"]',NULL,30),
  ('VITD','VITD3','Vitamin D3 (25-OH)','NUMERIC','ng/mL','[{"label":"Deficient","low":0,"high":19.9},{"label":"Insufficient","low":20,"high":29.9},{"label":"Sufficient","low":30,"high":100}]','[]',NULL,10),
  ('VITB12','B12','Vitamin B12','NUMERIC','pg/mL','[{"label":"Adult","low":200,"high":900}]','[]',NULL,10),
  ('BHCG','BHCG','Beta-hCG','NUMERIC','mIU/mL','[{"label":"Non-pregnant","gender":"Female","low":0,"high":5}]','[]',NULL,10),
  ('UPT','UPT','Urine Pregnancy Test','POS_NEG','','[]','["Negative","Positive"]',NULL,10),
  ('URINE','COLOR','Colour','SELECT','','[]','["Pale yellow","Yellow","Dark yellow","Amber","Red"]',NULL,10),
  ('URINE','APPEAR','Appearance','SELECT','','[]','["Clear","Slightly hazy","Hazy","Turbid"]',NULL,20),
  ('URINE','PH','pH','NUMERIC','','[{"label":"Normal","low":4.5,"high":8}]','[]',NULL,30),
  ('URINE','SG','Specific Gravity','NUMERIC','','[{"label":"Normal","low":1.005,"high":1.03}]','[]',NULL,40),
  ('URINE','PROTEIN','Protein','POS_NEG','','[]','["Negative","Trace","Positive"]',NULL,50),
  ('URINE','SUGAR','Sugar','POS_NEG','','[]','["Negative","Trace","Positive"]',NULL,60),
  ('URINE','PUS','Pus Cells','TEXT','/HPF','[]','[]',NULL,70),
  ('URINE','RBC','Red Blood Cells','TEXT','/HPF','[]','[]',NULL,80),
  ('URINE','EPITHELIAL','Epithelial Cells','TEXT','/HPF','[]','[]',NULL,90),
  ('THYROID','T3','Triiodothyronine (T3)','NUMERIC','ng/mL','[{"label":"Adult","low":0.8,"high":2.0}]','[]',NULL,10),
  ('THYROID','T4','Thyroxine (T4)','NUMERIC','µg/dL','[{"label":"Adult","low":5.1,"high":14.1}]','[]',NULL,20),
  ('THYROID','TSH','Thyroid Stimulating Hormone (TSH)','NUMERIC','µIU/mL','[{"label":"Adult","low":0.27,"high":4.2}]','[]',NULL,30),
  ('HBA1C','HBA1C','HbA1c','NUMERIC','%','[{"label":"Normal","low":4,"high":5.6}]','[]',NULL,10),
  ('MALARIA','MP_FAL','Plasmodium falciparum','POS_NEG','','[]','["Negative","Positive"]',NULL,10),
  ('MALARIA','MP_VIV','Plasmodium vivax','POS_NEG','','[]','["Negative","Positive"]',NULL,20),
  ('DENGUE','DENGUE_NS1','Dengue NS1 Antigen','POS_NEG','','[]','["Negative","Positive"]',NULL,10),
  ('DENGUE','DENGUE_IGM','Dengue IgM','POS_NEG','','[]','["Negative","Positive"]',NULL,20),
  ('DENGUE','DENGUE_IGG','Dengue IgG','POS_NEG','','[]','["Negative","Positive"]',NULL,30),
  ('SEMEN','SEM_VOLUME','Volume','NUMERIC','mL','[{"label":"WHO lower reference","low":1.4}]','[]',NULL,10),
  ('SEMEN','SEM_COLOR','Colour','SELECT','','[]','["Grey-opalescent","Yellowish","Other"]',NULL,20),
  ('SEMEN','SEM_LIQU','Liquefaction','TEXT','minutes','[]','[]',NULL,30),
  ('SEMEN','SEM_COUNT','Sperm concentration','NUMERIC','million/mL','[{"label":"WHO lower reference","low":16}]','[]',NULL,40),
  ('SEMEN','SEM_MOTILITY','Total motility','NUMERIC','%','[{"label":"WHO lower reference","low":42}]','[]',NULL,50),
  ('SEMEN','SEM_MORPH','Normal forms','NUMERIC','%','[{"label":"WHO lower reference","low":4}]','[]',NULL,60),
  ('PAP','PAP_ADEQUACY','Specimen adequacy','TEXT','','[]','[]',NULL,10),
  ('PAP','PAP_FINDINGS','Microscopic findings','TEXT','','[]','[]',NULL,20),
  ('PAP','PAP_IMPRESSION','Cytology impression','TEXT','','[]','[]',NULL,30),
  ('ALLERGY','TOTAL_IGE','Total IgE','NUMERIC','IU/mL','[{"label":"Adult","low":0,"high":100}]','[]',NULL,10),
  ('HBSAG','HBSAG','HBsAg','POS_NEG','','[]','["Negative","Positive"]',NULL,10),
  ('HIV','HIV_1_2','HIV I & II','POS_NEG','','[]','["Negative","Positive"]',NULL,10)
) AS p(profile_code, code, name, kind, unit, ranges, options, formula, sort_order)
ON t.code = p.profile_code
ON CONFLICT (profile_id, code) DO NOTHING;

-- Complete the most commonly expected fields in the bundled starter panels.
-- These are conservative adult starter intervals. Every laboratory must verify
-- intervals and methods against its own population, analyser and reagent inserts.
INSERT INTO profile_parameters (profile_id, code, name, result_kind, unit, method, reference_ranges, select_options, calculation_formula, sort_order)
SELECT id, p.code, p.name, p.kind::result_kind, p.unit, p.method, p.ranges::jsonb, p.options::jsonb, p.formula, p.sort_order
FROM test_profiles t
JOIN (VALUES
  ('CBC','RDWCV','Red Cell Distribution Width (RDW-CV)','NUMERIC','%','Automated haematology analyser','[{"label":"Adult","low":11.5,"high":14.5}]','[]',NULL,75),
  ('CBC','MPV','Mean Platelet Volume','NUMERIC','fL','Automated haematology analyser','[{"label":"Adult","low":7.5,"high":12}]','[]',NULL,85),
  ('LFT','IBIL','Indirect Bilirubin','NUMERIC','mg/dL','Calculated (Total Bilirubin - Direct Bilirubin)','[{"label":"Adult","low":0.2,"high":0.9}]','[]','TBIL - DBIL',25),
  ('LFT','GGT','Gamma-Glutamyl Transferase (GGT)','NUMERIC','U/L','Enzymatic colorimetric','[{"label":"Adult male","gender":"Male","low":9,"high":48},{"label":"Adult female","gender":"Female","low":7,"high":32}]','[]',NULL,55),
  ('KFT','URIC','Uric Acid','NUMERIC','mg/dL','Uricase colorimetric','[{"label":"Adult male","gender":"Male","low":3.4,"high":7.0},{"label":"Adult female","gender":"Female","low":2.4,"high":6.0}]','[]',NULL,25),
  ('KFT','HCO3','Bicarbonate','NUMERIC','mmol/L','Enzymatic photometric','[{"label":"Adult","low":22,"high":29}]','[]',NULL,60),
  ('KFT','CA','Calcium, Total','NUMERIC','mg/dL','Photometric colorimetric','[{"label":"Adult","low":8.6,"high":10.2}]','[]',NULL,70),
  ('KFT','PHOS','Phosphorus, Inorganic','NUMERIC','mg/dL','Phosphomolybdate photometric','[{"label":"Adult","low":2.5,"high":4.5}]','[]',NULL,80),
  ('URINE','KETONE','Ketones','SELECT','','Reagent strip','[]','["Negative","Trace","1+","2+","3+"]',NULL,65),
  ('URINE','BLOOD','Blood / Haemoglobin','SELECT','','Reagent strip','[]','["Negative","Trace","1+","2+","3+"]',NULL,66),
  ('URINE','BILIRUBIN','Bilirubin','SELECT','','Reagent strip','[]','["Negative","Positive"]',NULL,67),
  ('URINE','UROB','Urobilinogen','TEXT','mg/dL','Reagent strip','[]','[]',NULL,68),
  ('URINE','NITRITE','Nitrite','POS_NEG','','Reagent strip','[]','["Negative","Positive"]',NULL,69),
  ('URINE','CASTS','Casts','TEXT','/LPF','Microscopy','[]','[]',NULL,100),
  ('URINE','CRYSTALS','Crystals','TEXT','/HPF','Microscopy','[]','[]',NULL,110),
  ('URINE','BACTERIA','Bacteria','TEXT','/HPF','Microscopy','[]','[]',NULL,120),
  ('SEMEN','SEM_PH','pH','NUMERIC','','pH paper / validated pH method','[{"label":"WHO lower reference","low":7.2}]','[]',NULL,35),
  ('SEMEN','SEM_TOTAL','Total sperm number','NUMERIC','million/ejaculate','Manual or computer-assisted microscopy','[{"label":"WHO lower reference","low":39}]','[]',NULL,45),
  ('SEMEN','SEM_PROGRESSIVE','Progressive motility','NUMERIC','%','Manual or computer-assisted microscopy','[{"label":"WHO lower reference","low":30}]','[]',NULL,55),
  ('SEMEN','SEM_VITALITY','Vitality (live spermatozoa)','NUMERIC','%','Eosin-nigrosin vital staining','[{"label":"WHO lower reference","low":54}]','[]',NULL,65)
) AS p(profile_code, code, name, kind, unit, method, ranges, options, formula, sort_order)
ON t.code = p.profile_code
ON CONFLICT (profile_id, code) DO NOTHING;

-- Populate a reportable method for the original starter fields without replacing
-- methods that a laboratory administrator has already validated and configured.
UPDATE profile_parameters pp
SET method = CASE
  WHEN tp.code = 'CBC' AND pp.code = 'HB' THEN 'SLS photometry (automated haematology analyser)'
  WHEN tp.code = 'CBC' THEN 'Automated haematology analyser'
  WHEN tp.code = 'LFT' AND pp.code IN ('TBIL','DBIL') THEN 'Diazo photometry'
  WHEN tp.code = 'LFT' AND pp.code IN ('AST','ALT') THEN 'IFCC kinetic UV'
  WHEN tp.code = 'LFT' AND pp.code = 'ALP' THEN 'p-Nitrophenyl phosphate photometry'
  WHEN tp.code = 'LFT' AND pp.code = 'TP' THEN 'Biuret colorimetric'
  WHEN tp.code = 'LFT' AND pp.code = 'ALB' THEN 'Bromocresol green photometry'
  WHEN tp.code = 'LFT' AND pp.code IN ('GLOB','AGR') THEN 'Calculated'
  WHEN tp.code = 'KFT' AND pp.code = 'UREA' THEN 'Urease enzymatic photometry'
  WHEN tp.code = 'KFT' AND pp.code = 'CREAT' THEN 'Enzymatic colorimetric'
  WHEN tp.code = 'KFT' AND pp.code IN ('NA','K','CL') THEN 'Indirect ion-selective electrode'
  WHEN tp.code = 'WIDAL' THEN 'Tube agglutination'
  WHEN tp.code IN ('VIRAL','HBSAG','HIV') THEN 'Immunoassay (platform-specific)'
  WHEN tp.code IN ('VITD','VITB12','BHCG','THYROID','ALLERGY') THEN 'Chemiluminescent immunoassay'
  WHEN tp.code = 'UPT' THEN 'Immunochromatographic assay'
  WHEN tp.code = 'URINE' AND pp.code IN ('COLOR','APPEAR') THEN 'Visual examination'
  WHEN tp.code = 'URINE' AND pp.code IN ('PUS','RBC','EPITHELIAL') THEN 'Microscopy'
  WHEN tp.code = 'URINE' THEN 'Reagent strip'
  WHEN tp.code = 'HBA1C' THEN 'High-performance liquid chromatography (HPLC)'
  WHEN tp.code = 'MALARIA' THEN 'Peripheral blood smear microscopy'
  WHEN tp.code = 'DENGUE' THEN 'Immunoassay (platform-specific)'
  WHEN tp.code = 'SEMEN' THEN 'WHO-recommended manual microscopy'
  WHEN tp.code = 'PAP' THEN 'Cytology microscopy (Bethesda reporting)'
  ELSE pp.method
END
FROM test_profiles tp
WHERE pp.profile_id = tp.id AND pp.method IS NULL;

UPDATE test_profiles
SET specimen_type = CASE code
  WHEN 'CBC' THEN 'EDTA whole blood'
  WHEN 'URINE' THEN 'Fresh urine'
  WHEN 'UPT' THEN 'Urine'
  WHEN 'SEMEN' THEN 'Semen'
  WHEN 'PAP' THEN 'Cervical cytology specimen'
  WHEN 'MALARIA' THEN 'EDTA whole blood / blood smear'
  ELSE 'Serum'
END
WHERE specimen_type IS NULL;

END
$catalogue_seed$;
