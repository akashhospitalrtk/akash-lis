# India common investigation catalogue

This is an editable, broad starter menu, not an exhaustive list of every test
performed in India. It uses the existing LIS profile/parameter editor. There are
no added approval states, database columns, reagent-tracking fields or UI screens.
New profiles are active and can be archived using the existing editor.

## Installed locally on 28 September 2026

The source menu contains 486 profiles and 913 parameter definitions across 18
departments. The local import added 468 profiles / 823 parameter fields, skipped
18 matching profiles, and preserved all 21 pre-existing profiles. The resulting
local catalogue contains 489 profiles / 913 parameter fields. Exports describe
the master menu, so their counts differ from the installed catalogue.

The pre-import catalogue snapshot is `backups/catalogue-before-20260928.json`
(ignored by Git). The existing backup service also created the full archive
`lis-20260928T171801Z-86a7c6991cd2-312.dump` in its configured backup destination.
The archive listing was checked; no claim of a new full restore drill is made.

Verification: backend build; three catalogue unit tests; disposable database
checks for rollback, concurrent imports, duplicate skipping, preserved archived
and configured profiles, audit records, permission enforcement, order snapshots,
numeric formula results and editable methods. The browser rendered all 486 master
profiles against isolated API fixtures using the running frontend, including
search, pagination, method/range edits, reload and mobile layout. Local database
checks then compared every old catalogue row with the snapshot, confirmed the
468 import audit events, and confirmed HTTP 200 API health. Browser fixtures did
not read real patients or write production data. Clinical assay validation is
outside these software checks.

## Content and use

- Common methods are suggested configurations, not confirmation of the hospital's
  instruments or reagent kits. Edit them in Investigations before using the assay.
- Parameters include names, local codes, specimen, result type, methods and units.
  Qualitative tests have result options. No patient results or suggested results
  are supplied. Critical limits and LOINC mappings are intentionally unset.
- A limited set of adult numerical examples is labelled in the range itself and
  parameter description. These examples affect low/high flags when saved. Age
  matching is explicitly restricted to 18 years and over; they are not validated
  pediatric or pregnancy intervals. Other intervals are blank and editable.
- Reproductive hormones, drug levels, qualitative cutoffs and genetic tests do
  not have a universal healthy range. Local decision limits and interpretation
  must come from the actual assay/protocol. No approximation of strict cutoffs
  into inclusive low/high bounds is performed.
- Calculations are limited to simple unit-consistent arithmetic. Calculated LDL,
  eGFR, risk scores and therapeutic targets are not fabricated. Viral-load profiles
  include separate detection status and assay-limit fields; leave the numerical
  result empty for an unquantifiable specimen, never enter zero as 'not detected'.
- Cultures use editable narrative fields for growth, isolates and susceptibility;
  this does not implement a structured AST or blood-component inventory module.
- Specialist pathology, genetics, transfusion and referral names do not establish
  in-house capability. Archive investigations that the laboratory does not offer.
- Single analytes and panels are intentionally separate orderable investigations.
  Existing profiles (including archived ones) are skipped on matching code, known
  alias or normalized name. Existing values and patient-order snapshots are never
  overwritten by this importer. A panel renamed in both code and name may still
  need manual duplicate review.

## Sources and limits

The menu is an authored expansion informed by the [ICMR National Essential
Diagnostics List 2025](https://www.icmr.gov.in/icmrobject/uploads/Report/1752588650_nedl2ndedition.pdf).
Specialist additions are not claimed to be mandated by that list.

Common chemistry method families can be checked against the [Erba reagent IFU
directory](https://www.erbalachema.com/en/product-support/instructions/instructions-diagnostic-kits/blt-biolatest/).
CLIA/ELISA, PCR, microscopy and specialist methods are proposed method families;
the actual performing laboratory may use a different platform or implementation.

The three-part CBC parameter set follows [Erba H360 product information](https://www.erbalachema.com/en/products-and-solutions/hematology/hematology-analyser-h-360/).
MID is mixed cells, GRAN is granulocytes. The H360 analytical limits are not
patient reference intervals. Existing CBC profiles are preserved, not replaced.

The small selection of adult numerical examples is from [ABIM Laboratory Test
Reference Ranges, January 2026](https://www.abim.org/Media/bfijryql/laboratory-reference-ranges.pdf).
WBC is converted from cells/uL to 10^3/uL; monovalent electrolytes use numerically
equivalent mmol/L instead of mEq/L. These are educational examples for review,
not local interval verification. The rest of the catalogue leaves ranges blank.

## Operator commands

From `backend`, using the environment for the intended local database:

```powershell
npm.cmd run catalogue:india
npm.cmd run catalogue:india -- --export ../docs/catalogue
npm.cmd run catalogue:india -- --apply --snapshot ../backups/catalogue-before-import.json
```

The first command previews. The last command adds missing profiles in one
transaction and records catalogue/system audit events. It creates a new snapshot
file before inserting records and refuses to overwrite that snapshot file. The
script records a system actor (null user) because it is an operator CLI, not a
logged-in browser action. It does not invent an administrator identity.

Repeated runs skip existing profiles, including deliberately archived tests.
Changing the master file does not update installed tests; use the normal editor.
The JSON and CSV exports are review artifacts, not an unauthenticated HTTP import
API. Container installations can run the compiled script at
`dist/src/scripts/importIndiaCatalogue.js`.

The catalogue snapshot contains only catalogue configuration and must be kept
outside version control. It is not a full patient-database backup. Existing backup
operations remain responsible for the full database. Do not restore by deleting
profiles with patient history: use the existing archive/edit workflow.
