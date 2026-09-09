# MVP workflow

1. A technician creates an accession with patient/sample details, or chooses a read-only patient lookup result.
2. One or more reusable profiles create order-test snapshots, ensuring reports stay historically correct if a profile changes later.
3. The technician presses Enter/Tab through result fields. Numeric values are immediately flagged against the selected sex/age range; calculated parameters are recomputed after save.
4. The technician reviews and saves the completed order. An authorizer reviews and authorizes it.
5. The report view is print-optimized for A4 and records printing in the audit trail.

Administrators manage user access. Technicians may register, enter, edit and import; authorizers (or administrators) may authorize and print.
