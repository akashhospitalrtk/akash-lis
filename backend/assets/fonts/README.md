# Report fonts

Noto Sans and Noto Sans Devanagari are distributed under the SIL Open Font License in `OFL.txt` and `OFL-Devanagari.txt`, respectively.

Source: Google's font repository, downloaded for PDF report generation:

- https://github.com/google/fonts/tree/main/ofl/notosans
- https://github.com/google/fonts/tree/main/ofl/notosansdevanagari

The backend embeds subsets in each generated PDF. Keep these assets when packaging the backend; the production Dockerfile copies `backend/assets` into `/app/assets`.

Inter Bold (`Inter-Bold.woff`) is copied from the project's locked
`@fontsource/inter` package and licensed under `OFL-Inter.txt`. It is embedded for
report headings and bold patient labels so printing does not depend on a
workstation's substitute Helvetica font.
