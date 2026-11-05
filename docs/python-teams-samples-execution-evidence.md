# Python Teams samples execution evidence

Execution began on 2026-11-05 under `python-teams-samples-execution-plan.md`. PR #118 and its generated outputs are excluded from all implementation inputs.

## Prepared inputs

- Original automation baseline: `122ad7abebc6b357286dab3a5e06c21374a033c3`.
- Fresh upstream fetch: `OfficeDev/Microsoft-Teams-Samples@b9aedfea98e3505acbcf68a3931be05a780d6149`. The source pin matches the historical inventory, but was fetched and inspected again for this execution.
- Coordinator-selected SDK map: all five required Microsoft Agents distributions at `1.9.0`, selection identity `pypi:03ba6a68119c7b9232642474a7018b555cfca042848645bb1dfd98c25a0f482a`.
- Trusted Python: CPython 3.11.14, pip 26.1.1, packaging 26.2.
- Source-to-test reconciliation: `docs/python-teams-sync-parity-inventory.md`, including new assertions for citations, dialog acknowledgements, meeting metadata/retry behavior and reaction-delete transport.

Prerequisite changes corrected the message-extension no-results guidance, synchronized Python plugin versions, and made readability an explicit runtime requirement. A read-only independent review found no blockers in preparation commits `f6d2e49` and `e88f0bd`.

## Preparation checks

- Initial automation suite: 114 passed, zero failed, one opt-in live test skipped; build and lint passed.
- Python helper suite before the long-path regression: 60 passed.
- Explicit live Copilot SDK smoke: one passed; planning and implementation remained in the same session with skill access.
- Fresh dependency resolution and hash-verified wheel installation succeeded for the selected SDK, including Graph dependencies. These checks establish local tool availability, not sample parity.

## First cards attempt

The synchronization runtime at base `e88f0bdce1b485e32120aa0e862bba9ccdc17fc7` froze a cards migration plan and created sample source, configuration, documentation and manifest files. No sample was accepted, no verified state was written, and no publication occurred.

Validation exposed a Windows infrastructure failure: installation used extended paths, but environment fingerprinting used ordinary paths and failed on long generated Graph SDK directories with `WinError 3`. Reproducing `preparePythonEnvironment` outside the agent confirmed the failure. The coordinator and its Copilot child were stopped after that diagnosis. Diagnostic files and the incomplete frozen plan remain under `.sync/output/python--bot-cards`; the incomplete sample is not an accepted baseline.

The fingerprint helper now uses extended paths on Windows. A regression test creates an installed-package path longer than `MAX_PATH`, compares prefixed and unprefixed roots, and verifies that changing a file changes the fingerprint. Both digest tests pass, and the complete freshly installed Graph environment was successfully fingerprinted.

The custom validation tool now returns the underlying redacted failure message and retains it in the agent log. Two tests cover actionable errors without credential disclosure and preservation of structured candidate-check failures. Independent review found no blocking issues in these changes. The updated automation suite passed 116 tests, with zero failures and one opt-in skip.

## Remaining execution

The cards pilot must be rerun and pass full validation, independent review and patch verification before the remaining samples proceed. Ubuntu 24.04 is available through WSL; execution tools are being prepared there to match the preferred platform and avoid Windows filesystem overhead. The Node 24.22.2 Linux download was checked against the official SHA-256 manifest.

Live Teams installation, Azure Bot delivery, Graph transcript access, file transfer, targeted delivery and incremental operation have not yet been verified. The live test environment has been requested. No hosted workflow, issue, PR or merge was created by this execution.
