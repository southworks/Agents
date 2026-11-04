# Python Teams behavior inventory

Source pin: `OfficeDev/Microsoft-Teams-Samples@b9aedfea98e3505acbcf68a3931be05a780d6149`.
Each source below is `samples/TeamsSDK/<family>/python/<family>/main.py` at that pin.
Reference contracts are under `automation/teams-sample-sync/tests/js-contracts` and
`automation/teams-sample-sync/tests/contracts`. Python implementation and protected tests
are pending for every row; this inventory does not assert completed parity.

Generated destinations will be `samples/python/teams/<family>/src/agent.py`, with cohesive
feature modules where needed. Protected suites will live outside generated destinations
under `automation/teams-sample-sync/tests/python-contracts`.

| Family / source symbols | Required behavior and reference evidence | Python implementation / protected suite | Manifest and setup |
| --- | --- | --- | --- |
| Cards: `create_card_actions_card`, `handle_card_actions` | Nested forms and cards, command matching and precedence; JS cards contract “card actions preserve nested forms and command precedence” | Pending / bot-cards | Advertise card actions command consistently |
| Cards: `create_toggle_visibility_card`, `handle_toggle_visibility` | Initially hidden helloWorld element and exact visibility target; JS visibility contract | Pending / bot-cards | Advertise toggle visibility command |
| Cards: `handle_card_action`, `handle_message` | Name and missing-name handling, invoke status/body, help with both commands; JS submission/help contracts | Pending / bot-cards | README/help/command surfaces agree |
| AI: `add_ai_label`, `add_sensitivity_label`, `add_feedback_buttons`, `add_citations` | Keyword precedence, AI/sensitivity/feedback metadata, citation claim/URL/keywords/card; all four JS AI contracts | Pending / bot-ai-messages | Explain available keyword commands |
| AI: `handle_feedback`, `handle_feedback_fetch_task`, `handle_message` | Preserve reaction and feedback text, feedback input dialog, stable unknown help | Pending / bot-ai-messages | Document feedback interaction; retain source-only dialog behavior |
| Extensions: `handle_query`, `search_wikipedia`, `create_wikipedia_card`, `create_attachment` | wikipediaSearch ID, sanitized snippets, adaptive results, thumbnail previews, empty and unknown commands; JS search/no-results contracts | Pending / bot-message-extensions | Query command contexts, Wikipedia network requirement |
| Extensions: `handle_link`, `create_link_preview_card`, `handle_message` | Requested URL in preview, compose instructions/help, correct invoke envelope; JS link/help contract | Pending / bot-message-extensions | Supported domains including en.wikipedia.org |
| Dialogs: `handle_message`, three `handle_*_open` functions | Three launch actions, correct input card/custom/fallback URLs; JS launch/fetch/static-page contracts | Pending / bot-task-modules | Serve actual CustomForm page; distinguish dialog actions from slash commands |
| Dialogs: `handle_adaptive_card_submit`, `handle_custom_form_submit`, `handle_multi_step_1_submit`, `handle_multi_step_2_submit` | Preserve submitted text, name/email carry-forward and completion envelopes; JS submission contracts | Pending / bot-task-modules | Endpoint configuration and manifest domains |
| Attachments: `_get_attachment_content`, `_download_attachment`, `_send_file_consent_card` | Byte/name/size/context preservation and consent; JS download/consent contracts | Pending / bot-attachments | supportsFiles and connection setup |
| Attachments: `handle_file_consent`, `_handle_file_upload`, `_upload_to_onedrive` | Early acknowledgement, proactive continuation, file-info result, upload headers/status and cleanup on decline/failure; JS blocked-upload and transport contracts | Pending / bot-attachments | Explain OneDrive consent and transfer checks |
| Meetings: `handle_meeting_start`, participant handlers | Title/time/join action, role preservation, ignore users without AAD identity; JS start/participant contracts | Pending / bot-meetings | Event subscriptions, basic/participant RSC grants |
| Meetings: `handle_meeting_end`, `get_meeting_transcript`, `parse_vtt` | Typed metadata preservation, missing metadata, join URL/resource fallback, bounded retry/delay, newest transcript, Graph route/VTT/fallback; JS end/Graph/retry contracts | Pending / bot-meetings | Graph permissions, webApplicationInfo and transcript prerequisites |
| Targeted: `handle_remind_command`, `deliver_reminder`, `show_my_reminders`, `cancel_reminder_command` | Mention routing, private confirmation, captured identity/conversation, delayed recipient delivery, user-scoped lists and cancellation; JS reminder/list contracts | Pending / agent-targeted-messages | In-memory limitations and targeted installation checks |
| Targeted: `handle_card_action`, `handle_activity`, `show_help`, `handle_message` | Cancel/dismiss/snooze, invoke acknowledgement, cancellable timers, suggested-action routing, AI labels and preview metadata; JS card/help/suggested-action contracts | Pending / agent-targeted-messages | Help and manifest command surfaces agree |
| Targeted: reaction handlers, `parse_time_expression` | Quoted/reply/current ID precedence, slash restrictions, real Teams transport, added/removal semantics, reject invalid/overflow times, isolated application state and cleanup; JS reaction/timer contracts | Pending / agent-targeted-messages | Document timer cleanup and reaction limitations |

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
