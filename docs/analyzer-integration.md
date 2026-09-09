# CBC analyzer integration

The MVP does **not** open a serial or network connection to an analyzer. Before doing so, collect:

1. Analyzer manufacturer and exact model.
2. Interface documentation and licensed protocol option (serial/TCP, ASTM, HL7 or proprietary).
3. Connection settings: COM port or address, baud/parity/data/stop bits, framing, encoding and handshake.
4. A de-identified sample message/export plus mapping from analyzer codes to LIS parameter codes.
5. Whether the analyzer expects query/host acknowledgement or only sends results.

Implement the transport as an adapter under `backend/src/services/analyzers/`, translate its message into `NormalizedAnalyzerResult`, then pass it to `applyAnalyzerResults`. This preserves one validation, audit and abnormal-flagging path for CSV and future live integrations.

Never authorize analyzer results automatically in the first deployment; route them into the normal review workflow.
