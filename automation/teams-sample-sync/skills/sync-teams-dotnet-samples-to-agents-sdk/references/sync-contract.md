# Sync contract

Source context is immutable. The accepted implementation result is the only authoritative
capability inventory: it contains a disposition for every source change and stable, evidence-
backed capability IDs. `needs-input` is never an acceptable completed decision. Validation is
bound to output digest; review is bound to output digest, evidence digest, and validation run ID.

The reviewer independently inspects source and candidate and reports concise blocking findings.
It reviews every current change and capability ID exactly once, resolves or retains prior open
findings, and cannot write files. Current validation and historical feedback are separate.
