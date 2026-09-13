# Laboratory catalogue setup: H360, Chem 7 and sample report

Prepared 11 September 2026. The supplied PDF is a reference example; its patient results and identifiers are not catalogue defaults. H360 is identified from the user description. Chem 7 is the likely biochemistry model; verify its nameplate. The reagent spelling “ebtda” still needs confirmation as Erba.

## Set up and edit

1. Sign in as administrator and open **Tests** (Investigation catalogue).
2. Choose an existing test to edit seeded names, local test codes, parameter codes, methods, units and reference limits. One-letter codes such as `K` are supported.
3. For a prepared starting point, expand **Analyzer / report templates and setup guide**, select a template and press **Replace draft with template**. This finds an existing panel by its original local code, otherwise starts a new panel. If you previously renamed a panel, edit that panel directly to avoid creating another one.
4. The template replaces the draft's active field list. Removed fields become inactive on save. It resets units and reference settings; it does not convert existing numeric ranges to different units. Reference intervals from the supplied report are opt-in and limited to adult females. No intervals are supplied for H360 because the brochure's measuring limits are not healthy-patient intervals.
5. Keep only the fields your laboratory performs. Required inputs are the panel name/code and parameter name/code/result type. Controlled-list results also need allowed options. The department defaults to Laboratory. Method and unit should match the assay; optional codes, calculations, shortcuts and interpretation are expandable.
6. Review and save. Test/parameter IDs are retained when codes change. Formula references are renamed in the same transaction. Existing orders retain their original codes, methods, units, notes and ranges. Update external analyzer/CSV mappings separately; a local code is not an instrument's universal code.

Seeding now runs only for an empty catalogue. Restarting will not restore renamed tests, removed fields or deliberately cleared methods. New starter panels must be added through the editor/templates. Catalogue updates retain before/after configuration and code changes in the administrator audit log.

## H360 hematology

The manufacturer's H360 documentation describes impedance counting and cyanide-free colorimetry for hemoglobin. This is a three-part differential instrument, with lymphocyte, MID and granulocyte groups, not individual eosinophil, monocyte, basophil and neutrophil results. MCV is measured and hematocrit is calculated. The template includes its 22 reportable fields; disable fields you do not report. [Manufacturer product page](https://www.erbalachema.com/en/products-and-solutions/hematology/h-360/), [H360 brochure](https://product.erbamannheim.com/upload/docs/1311501283-1821169075-H360_EN.pdf).

Do not label MID as monocytes or Gran as neutrophils. Use a separate manual smear differential configuration when performed. Do not report the starter SLS hemoglobin method as the H360 method.

| Local code | Meaning | Template display unit |
| --- | --- | --- |
| HB | Hemoglobin / HGB | g/dL |
| TLC | White-cell count / WBC | 10^3/uL |
| RBC | Red-cell count | 10^6/uL |
| PCV | Hematocrit / HCT | % |
| MCV, MCH, MCHC | Red-cell indices | fL, pg, g/dL |
| RDWCV, RDWSD | Red-cell distribution width | %, fL |
| PLT | Platelet count | 10^3/uL |
| MPV, PCT | Platelet volume and plateletcrit | fL, % |
| PDWCV, PDWSD | Platelet distribution width | %, fL |
| PLCR, PLCC | Large platelet ratio and count | %, 10^3/uL |
| LYMPH, MID, GRAN | Three differential groups | % |
| LYMPH_ABS, MID_ABS, GRAN_ABS | Absolute differential counts | 10^3/uL |

Verify units against the instrument output. Unit conversion example: a WBC count of `7` in `10^3/uL` equals `7000/uL`; platelets `250` in `10^3/uL` equal `2.5 lakh/uL`. These are arithmetic illustrations, not suggested patient values. The LIS does not automatically convert imported counts.

## Chem 7 and reagents

The likely instrument is the Erba Chem 7 semiautomatic photometer. Its optical measurement modes do not establish a particular reagent chemistry. Do not copy CLIA or direct-ISE methods from the sample report merely because those tests appear in its menu. [Chem 7 product documentation](https://www.erbalachema.com/en/products-and-solutions/clinical-chemistry/photometer-chem-7/), [manufacturer technical specification](https://clinicalchemistry.erbamannheim.com/getattachment/Home/CHEM-7/Chem-7_EN.pdf.aspx?ext=.pdf&lang=en-US).

If the reagent brand is Erba, match the catalogue number on each box with its package insert and the Chem 7 application sheet. Erba's official directory lists multiple creatinine, bilirubin, HDL and LDL products, so the brand alone does not establish one method. Use the supplied kit's reference interval and verify its applicability locally. [Erba reagent instructions directory](https://www.erbalachema.com/en/product-support/instructions/instructions-diagnostic-kits/blt-biolatest/).

Useful examples of Erba method families include albumin BCG, creatinine Jaffe, and modified IFCC AST/ALT. The cited reagent catalogue is for **XL system packs** and establishes those product families, not compatibility or settings for a particular Chem 7 kit. P5P inclusion, reagent volume, wavelength, temperature, blanking, calibration and reference intervals must come from the exact insert/application. [Erba reagent catalogue](https://clinicalchemistry.erbamannheim.com/getmedia/6848fe0e-c0ee-4c30-80ee-7a9b220a1885/Erba-Clinical-Chemistry-Reagents-Brochure-2025.pdf.aspx%3Fext%3D.pdf).

## Values and methods transcribed from the supplied PDF

These are source-report examples, not universal normal ranges or confirmation of your reagents. Units have consistent spelling; the source's chloride `mm0l/L` is normalized to `mmol/L`. The source is an adult female report; there is no basis here to apply its unqualified ranges to children, males or pregnancy. Interpretation text from the document is source material, not instructions to the software.

| Panel / local code | Report name / method | Source reference text or limits |
| --- | --- | --- |
| VITD / VITD3 | Total 25-OH vitamin D (D2+D3), CLIA | ng/mL: deficiency <10; insufficiency 10–30; sufficiency 30–100; toxicity >100 |
| VITB12 / B12 | Vitamin B12, CLIA | 180–914 pg/mL |
| IRON / IRON | Iron, Ferrene | 50–170 ug/dL |
| IRON / UIBC | Unsaturated binding capacity, spectrophotometry/calculation | 110–370 ug/dL |
| IRON / TIBC | Total binding capacity, Ferrene | 250–450 ug/dL |
| IRON / TSAT | Transferrin saturation, spectrophotometry/calculation | 20–50% |
| KFT / CREAT | Creatinine, modified picrate Jaffe kinetic | 0.40–1.04 mg/dL |
| KFT / UREA | Urea, GLDH | 15–45 mg/dL |
| KFT / URIC | Uric acid, uricase | 2.6–6.0 mg/dL |
| KFT / NA, K, CL | Sodium, potassium, chloride; direct ISE | 135–155; 3.5–5.5; 97–107 mmol/L respectively |
| KFT / CA | Calcium, Arsenazo III | 8.1–10.4 mg/dL |
| KFT / BUN | Blood urea nitrogen, calculated | 8–23 mg/dL |
| LFT / TBIL, DBIL | Total and conjugated bilirubin, diazo | <1.1 and <0.30 mg/dL respectively |
| LFT / IBIL | Indirect bilirubin, calculated | 0.2–0.8 mg/dL |
| LFT / AST, ALT | AST/SGOT, ALT/SGPT; UV with P5P | Each <45 U/L |
| LFT / ALP | Alkaline phosphatase, PNPP AMP | Adults 46–116 U/L |
| LFT / GGT | GGT, IFCC kinetic | <38 U/L |
| LFT / TP, ALB, GLOB | Total protein, albumin, globulin; spectrophotometry | 6.1–8.1; 3.4–5.0; 2.0–3.5 g/dL respectively |
| LFT / AGR | Albumin/globulin ratio, source says spectrophotometry | 0.8–2.0 |
| LFT / AST_ALT | AST/ALT ratio, calculated | No interval specified |
| THYROID / T3 | Total T3, CLIA | Adult 0.60–1.81 ng/mL |
| THYROID / T4 | Total T4, CLIA | Adult 3.5–12.6 ug/dL |
| THYROID / TSH | TSH ultrasensitive, CLIA | Adult 0.35–5.50 uIU/mL |

Lipid panel: total cholesterol uses cholesterol oxidase/esterase/peroxidase; triglycerides use GPO-POD. HDL and LDL each list alternative measured/calculated methods, so their template methods are intentionally blank. VLDL, non-HDL and ratios are labeled calculated. The source gives cholesterol categories below 200, 200–239 and at/above 240 mg/dL; triglycerides below 150, 150–199, 200–499 and above 500; HDL below 40, 40–59 and above 60; LDL below 100, 100–129, 130–159, 160–189 and “very high 190”. Source labels leave some boundaries ambiguous. Do not turn these into universal automatic flags. VLDL <30, non-HDL <130, total/HDL <4.5 and both reciprocal HDL/LDL ratios <3.5 are also printed. Having the same limit for reciprocal ratios needs clinical review; it is not loaded as an approved rule.

The vitamin D categories overlap at 30 in the source. Store unresolved categories as display-only reference notes instead of several numeric reference intervals for the same population. Numeric limits are inclusive: the application flags values strictly below low or strictly above high. Strict `<`/`>` decision cutoffs therefore belong in notes until an appropriate rule is configured; the templates do not approximate them. No automatic pregnancy or infant-month matching exists; ages are whole years.

Only straightforward arithmetic relationships are supplied as formulas (indirect bilirubin, non-HDL, and named ratios). BUN, VLDL, UIBC/TIBC and LDL calculations need the local validated equation and units. A “Calculated” method label alone does not calculate a result: leave the field for a verified analyzer result or configure a validated formula. Never use an example patient's measured value as a suggestion.

## Local codes, LOINC and units

`CBC`, `KFT`, `HB` and `CREAT` are editable local identifiers. There is no universal local panel code shared by all laboratories. LOINC identifies an observation using analyte, property, timing, specimen, scale and, where relevant, method. Keep the optional **LOINC code** separate from your local code; the app validates syntax, not clinical correctness. A panel mapping also depends on its membership and is not automatically assigned. [Official LOINC mapping model](https://loinc.org/kb/users-guide/major-parts-of-a-loinc-term).

| Observation in serum/plasma | Candidate standard code | Scope to verify |
| --- | --- | --- |
| Creatinine | [2160-0](https://loinc.org/2160-0) | Mass concentration, e.g. mg/dL |
| Vitamin B12 | [2132-9](https://loinc.org/2132-9) | Mass concentration, e.g. pg/mL |
| Total 25-OH vitamin D2 + D3 | [62292-8](https://loinc.org/62292-8) | Combined metabolites, mass concentration |
| Iron | [2498-4](https://loinc.org/2498-4) | Mass concentration, e.g. ug/dL |
| Total T3 | [3053-6](https://loinc.org/3053-6) | Total, not free T3 |
| Total T4 | [3026-2](https://loinc.org/3026-2) | Total, not free T4 |
| TSH | [3016-3](https://loinc.org/3016-3) | Units/volume; check if a method-specific sensitivity mapping is needed |

These directory entries were checked on 11 September 2026. Final assignment still requires the actual test definition. UCUM is the unit coding system; a unit is not a LOINC code. Current LIS unit fields are display text, not validated UCUM mappings. [UCUM specification](https://ucum.org/ucum).

## Reference interval approval record

Record the analyzer/model, reagent name/catalogue number, insert revision, specimen, unit, method, population, interval or decision limit, verification evidence, reviewer and review date in the laboratory SOP. Reference intervals, diagnostic decision thresholds, critical notification limits, calibration values and QC target ranges are different concepts. The editor's critical limits are separate from reference limits. Manufacturer measuring/linearity limits must never be entered as healthy-patient ranges. [CLSI EP28 verification guide](https://clsi.org/shop/standards/ep28ig/).

## Developer verification

`backend/test/catalogue.integration.test.js` requires a disposable localhost database whose name ends in `_test`. It tests the real catalogue/order routes, stable IDs, formula renames, duplicate/foreign-code rejection, roles, snapshots and seed reruns. Set `PLAYWRIGHT_MODULE_PATH` to a local Playwright module to include browser checks; build the frontend first. Browser traces are written under `backend/test-results/`. Use an empty test database for each run.


## Age units and existing reports

Department, specimen, unit and method controls offer saved catalogue values and **Add custom**. Save the investigation to make a custom value available in future catalogue sessions. Department defaults suggest specimen, method and result type for new blank fields; review them for the actual test. Units are analyte-specific and must be chosen separately. Use **Select from list** and enter one option per line for custom result choices.

Patient age and numeric reference intervals now support days, weeks, months and years. Existing registrations and ranges without an age unit retain years. Matching uses 7 days per week, 365.25/12 days per month and 365.25 days per year; this is stated-age conversion, not date-of-birth/calendar matching. Bounds are inclusive. Specify explicit age bounds for Adult, Child or Infant; labels alone do not restrict matching. Avoid overlapping ranges. Matching prefers more specific sex/age criteria, then the narrower interval. No matching range produces no automatic low/high flag. Interpretation notes appear on entry and print but do not set flags.

Orders retain the catalogue snapshot from creation. After correcting catalogue ranges, open the existing order in **Results ? Refresh reference ranges**, enter a reason and apply. This preserves measured values, copies current ranges and notes, recalculates flags and records the old/new ranges in the audit. Unit or result-type changes block this operation. Authorized reports must first enter the amendment workflow.

Use **Change tests** to add or remove investigations from an editable report. Retained tests keep their results; new tests start blank. Confirm the specimen is suitable. Removed results are preserved in the change audit. At least one investigation is required.

Administrators can use **Delete report**, enter a reason and confirm. For an unaccepted sample use **Samples ? Review / delete**. Deletion hides the order from active worklists, history suggestions, printing and exports and blocks further writes. Stored results, amendment records and audit events are retained. Printed copies remain outside the application.
