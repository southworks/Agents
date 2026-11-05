# Python Teams behavior inventory

Source pin: `OfficeDev/Microsoft-Teams-Samples@b9aedfea98e3505acbcf68a3931be05a780d6149`.
Each source below is `samples/TeamsSDK/<family>/python/<family>/main.py` at that pin.
Reconciled on 2026-11-05 against this exact source pin and the protected Python suites.
Reference contracts remain under `automation/teams-sample-sync/tests/js-contracts` and
`automation/teams-sample-sync/tests/contracts`. All seven Python suites now exist; fresh
implementations have passed local validation and independent patch verification; live tenant
testing remains user-owned and pending. See [execution evidence](python-teams-samples-execution-evidence.md).

Generated destinations are `samples/python/teams/<family>/src/agent.py`, with cohesive
feature modules where needed. Protected suites live outside generated destinations
under `automation/teams-sample-sync/tests/python-contracts`. Exact test references are
listed below the table. No PR #118 implementation or evidence was used.

| Family / source symbols | Required behavior and reference evidence | Python implementation / protected suite | Manifest and setup |
| --- | --- | --- | --- |
| Cards: `create_card_actions_card`, `handle_card_actions` | Nested forms and cards, command matching and precedence; JS cards contract “card actions preserve nested forms and command precedence” | Implemented; local checks passed / bot-cards | Advertise card actions command consistently |
| Cards: `create_toggle_visibility_card`, `handle_toggle_visibility` | Initially hidden helloWorld element and exact visibility target; JS visibility contract | Implemented; local checks passed / bot-cards | Advertise toggle visibility command |
| Cards: `handle_card_action`, `handle_message` | Name and missing-name handling, invoke status/body, help with both commands; JS submission/help contracts | Implemented; local checks passed / bot-cards | README/help/command surfaces agree |
| AI: `add_ai_label`, `add_sensitivity_label`, `add_feedback_buttons`, `add_citations` | Keyword precedence, AI/sensitivity/feedback metadata, citation claim/URL/keywords/card; all four JS AI contracts | Implemented; local checks passed / bot-ai-messages | Explain available keyword commands |
| AI: `handle_feedback`, `handle_feedback_fetch_task`, `handle_message` | Preserve reaction and feedback text, feedback input dialog, stable unknown help | Implemented; local checks passed / bot-ai-messages | Document feedback interaction; retain source-only dialog behavior |
| Extensions: `handle_query`, `search_wikipedia`, `create_wikipedia_card`, `create_attachment` | wikipediaSearch ID, sanitized snippets, adaptive results, thumbnail previews, empty and unknown commands; JS search/no-results contracts | Implemented; local checks passed / bot-message-extensions | Query command contexts, Wikipedia network requirement |
| Extensions: `handle_link`, `create_link_preview_card`, `handle_message` | Requested URL in preview, compose instructions/help, correct invoke envelope; JS link/help contract | Implemented; local checks passed / bot-message-extensions | Supported domains including en.wikipedia.org |
| Dialogs: `handle_message`, three `handle_*_open` functions | Three launch actions, correct input card/custom/fallback URLs; JS launch/fetch/static-page contracts | Implemented; local checks passed / bot-task-modules | Serve actual CustomForm page; distinguish dialog actions from slash commands |
| Dialogs: `handle_adaptive_card_submit`, `handle_custom_form_submit`, `handle_multi_step_1_submit`, `handle_multi_step_2_submit` | Preserve submitted text, name/email carry-forward and completion envelopes; JS submission contracts | Implemented; local checks passed / bot-task-modules | Endpoint configuration and manifest domains |
| Attachments: `_get_attachment_content`, `_download_attachment`, `_send_file_consent_card` | Byte/name/size/context preservation and consent; JS download/consent contracts | Implemented; local checks passed / bot-attachments | supportsFiles and connection setup |
| Attachments: `handle_file_consent`, `_handle_file_upload`, `_upload_to_onedrive` | Early acknowledgement, proactive continuation, file-info result, upload headers/status and cleanup on decline/failure; JS blocked-upload and transport contracts | Implemented; local checks passed / bot-attachments | Explain OneDrive consent and transfer checks |
| Meetings: `handle_meeting_start`, participant handlers | Title/time/join action, role preservation, ignore users without AAD identity; JS start/participant contracts | Implemented; local checks passed / bot-meetings | Event subscriptions, basic/participant RSC grants |
| Meetings: `handle_meeting_end`, `get_meeting_transcript`, `parse_vtt` | Typed metadata preservation, missing metadata, join URL/resource fallback, bounded retry/delay, newest transcript, Graph route/VTT/fallback; JS end/Graph/retry contracts | Implemented; local checks passed / bot-meetings | Graph permissions, webApplicationInfo and transcript prerequisites |
| Targeted: `handle_remind_command`, `deliver_reminder`, `show_my_reminders`, `cancel_reminder_command` | Mention routing, private confirmation, captured identity/conversation, delayed recipient delivery, user-scoped lists and cancellation; JS reminder/list contracts | Implemented; local checks passed / agent-targeted-messages | In-memory limitations and targeted installation checks |
| Targeted: `handle_card_action`, `handle_activity`, `show_help`, `handle_message` | Cancel/dismiss/snooze, invoke acknowledgement, cancellable timers, suggested-action routing, AI labels and preview metadata; JS card/help/suggested-action contracts | Implemented; local checks passed / agent-targeted-messages | Help and manifest command surfaces agree |
| Targeted: reaction handlers, `parse_time_expression` | Quoted/reply/current ID precedence, slash restrictions, real Teams transport, added/removal semantics, reject invalid/overflow times, isolated application state and cleanup; JS reaction/timer contracts | Implemented; local checks passed / agent-targeted-messages | Document timer cleanup and reaction limitations |

## Source differences that require deliberate migration

- Cards directly indexes `data['name']`; missing-name behavior needs the existing parity contract.
- Extensions assigns `attachments` only inside the recognized command branch; unknown command
  IDs must return the no-results envelope rather than an unbound-local exception.
- AI includes a feedback-fetch dialog in addition to feedback submission. Preserve it even
  though the shorter minimum checklist focuses on feedback metadata and submission.
- Attachments queues a task against the incoming context. Preserve early acknowledgement
  while using captured conversation data and supported proactive continuation after the turn.
- Meetings creates ClientSecretCredential and a Graph client at import. Make optional Graph
  configuration lazy so credential-free import/readiness works. Its end handler assumes
  channel metadata exists and has no retry; add required fallback and retry behavior.
- Targeted reminders use module-global state. Move state into the factory, retain in-memory
  operation, and add shutdown cleanup. Do not introduce persistence.
- Source reaction removal sends a reply, whereas JS parity expects no additional reply.
  Python contracts explicitly preserve that acknowledgement as a source-specific behavior.
  The frozen migration plan must record this difference from JS; neither behavior should
  be silently dropped during reconciliation.

No released-SDK parity limitation has yet been established. Windows installation path-length
failure is environment evidence, not proof that a Teams capability is unavailable.

The published 1.9.0 Python message namespace has no dedicated feedback-submit or feedback-fetch
registration method. Generic `AgentApplication.invoke` supports both protocol names and
allows explicit response activities, so this is an API mapping requirement rather than an
established functionality gap. The Python AI contracts preserve upstream custom feedback
and its dialog; JS uses default feedback without that extra dialog.


## Exact protected test references

All paths below are relative to `automation/teams-sample-sync/tests/python-contracts`.
Each reference names the actual class and method to inspect when writing the frozen
behavior-to-implementation plan. All listed suites passed against the fresh candidates.

### bot-cards

Suite: `bot-cards.py`.

- `CardContracts.test_nested_forms_and_command_precedence`
- `CardContracts.test_visibility_targets_initially_hidden_element`
- `CardContracts.test_submission_and_missing_name_preserve_invoke_envelope`
- `CardContracts.test_unknown_message_advertises_both_commands`

### bot-ai-messages

Suite: `bot-ai-messages.py`.

- `AiMessageContracts.test_label_precedes_other_keywords`
- `AiMessageContracts.test_sensitivity_and_custom_feedback_metadata`
- `AiMessageContracts.test_complete_citation`
- `AiMessageContracts.test_feedback_submission_preserves_reaction_and_text`
- `AiMessageContracts.test_feedback_fetch_returns_input_dialog`
- `AiMessageContracts.test_unknown_text_returns_stable_help`

### bot-message-extensions

Suite: `bot-message-extensions.py`.

- `MessageExtensionContracts.test_search_cards_sanitize_snippets_and_preserve_previews`
- `MessageExtensionContracts.test_default_search_handles_malformed_responses_and_http_failures`: default HTTP helper parsing and request encoding, using mocked HTTPX transport rather than an injected search function.
- `MessageExtensionContracts.test_empty_results_and_unknown_commands_return_no_results`
- `MessageExtensionContracts.test_unfurl_preserves_requested_url`
- `MessageExtensionContracts.test_help_explains_compose_search_and_echo_remains_useful`

### bot-task-modules

Suite: `bot-task-modules.py`.

- `DialogContracts.test_all_three_launch_actions`
- `DialogContracts.test_fetch_selects_input_custom_url_and_name_step`
- `DialogContracts.test_multistep_state_and_completion`
- `DialogContracts.test_text_and_custom_submission_envelopes`
- `DialogContracts.test_custom_form_route_serves_teams_dialog_page`

### bot-attachments

Suite: `bot-attachments.py`.

- `AttachmentContracts.test_default_transfer_helpers_preserve_bytes_headers_and_status_handling`
- `AttachmentContracts.test_upload_preserves_bytes_and_returns_file_info_proactively`
- `AttachmentContracts.test_acceptance_acknowledges_before_slow_upload_completes`
- `AttachmentContracts.test_decline_clears_pending_data_and_help_uses_agent_terminology`
- `AttachmentContracts.test_failed_upload_cannot_reuse_pending_bytes`

### bot-meetings

Suite: `bot-meetings.py`.

- `MeetingContracts.test_graph_transport_selects_newest_transcript_and_requests_vtt`
- `MeetingContracts.test_start_preserves_title_time_and_join_action`
- `MeetingContracts.test_end_preserves_resource_fallback_retries_and_vtt`
- `MeetingContracts.test_exhausted_retries_return_clear_fallback`
- `MeetingContracts.test_channel_resource_takes_precedence_over_meeting_info`
- `MeetingContracts.test_missing_graph_resource_returns_fallback_without_requesting_transcript`
- `MeetingContracts.test_missing_meeting_metadata_does_not_call_graph`
- `MeetingContracts.test_participant_roles_and_agent_only_filtering`

### agent-targeted-messages

Suite: `agent-targeted-messages.py`.

- `TargetedContracts.test_mentioned_reminder_confirms_privately_and_delivers_to_recipient`
- `TargetedContracts.test_listing_and_cancel_enforce_ownership`
- `TargetedContracts.test_suggested_actions_acknowledge_and_share_command_routing`
- `TargetedContracts.test_reaction_id_precedence`
- `TargetedContracts.test_default_reaction_transport_uses_the_teams_client`
- `TargetedContracts.test_slash_reactions_are_blocked_and_prompt_preview_is_preserved`
- `TargetedContracts.test_help_and_fallback_keep_suggestions_and_ai_metadata`
- `TargetedContracts.test_card_cancel_dismiss_and_snooze_acknowledge`
- `TargetedContracts.test_reaction_events_preserve_added_and_removed_behavior`
- `TargetedContracts.test_invalid_times_and_shutdown_do_not_leave_timers`
- `TargetedContracts.test_application_instances_do_not_share_reminders`

## Coverage beyond the protected suites

The suites exercise real SDK dispatch with offline transports and reject unexpected
network or credential access. Full coordinator validation also verifies dependency
locks, manifest capabilities, public readiness and anonymous HTTP rejection. Frozen
plans and independent review reconcile the actual commands, README and manifest.

Additional execution checks closed the following initial coverage gaps:

- **Meeting recovery and default metadata:** the supported SDK metadata path is
  exercised without a `meeting_info` override. Supplemental Graph-builder checks
  verify organizer-scoped join-URL lookup, apostrophe escaping, resource-ID precedence,
  retries and unavailable results. The existing .NET setup already documents the
  application permissions and organizer policy used by the planned fallback.
- **Targeted ownership and timers:** supplemental actual SDK dispatch checks cover
  foreign card cancellation/dismissal, numeric negative snoozes, failed confirmations
  and failed proactive delivery. Real default-scheduler checks prove delayed delivery
  and release of completed/cancelled tasks; injected timers alone did not prove this.
- **Attachment fallback:** additional tests exercise failed downloads and the actual
  SDK welcome fallback. Independent review checked host cleanup wiring to upload
  draining. Stopping a live host during transfer remains a tenant-checklist scenario.

These checks are retained with the per-sample operator inputs and audits in the
execution artifact bundle. See [execution evidence](python-teams-samples-execution-evidence.md)
and its hash-pinned machine-readable results for the current accepted identities.

Local evidence does not prove authenticated Teams delivery, actual Entra/Graph/OneDrive
permissions, client behavior, or live host shutdown during a transfer. Those checks
remain explicitly assigned to the user in the tenant checklist.

## Preparation correction

The original `references/sdk-1.9.md` prescribed an empty `type: result` response for
unknown message-extension queries. During this reconciliation, the preparation owner
corrected it to the pinned source and contract response: `type: message` with
`No results found for '<query>'`, sent through an explicit invoke response. This correction
must be included in the frozen guidance fingerprint; the contract was not weakened.


## Additional protected coverage prepared for fresh candidates

- Meeting contracts now assert channel-resource precedence over meeting-info fallback,
  no transcript request when both resource sources are absent, the exhausted retry waits
  `[30, 10, 10]`, and agent-only filtering for both participant join and leave.
- `AiMessageContracts.test_complete_citation` now checks appearance name and abstract.
  The name is `AI messages agent`, an intentional terminology correction from upstream's
  `AI messages bot`; `Excerpt description` remains the exact source abstract.
- `DialogContracts.test_text_and_custom_submission_envelopes` now checks that the custom
  form acknowledgement preserves both submitted name and email, as the source does.

These assertions were added before sample generation and passed against the fresh
candidates. See the execution evidence for current full-validation and integration results.
