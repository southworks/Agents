# Python Teams samples tenant test checklist

Sample baseline: `623c82dcff583c9bb35588bc15ce10ee20b78ea5`. Documentation-only follow-up commits preserve the same sample files.

Owner: the user. Run these checks after the fresh samples pass local validation. Local contracts use real SDK routing with offline transports; they do not prove delivery or permissions in a Teams tenant.

Record the tested Git commit, sample, date, tenant type, installation scope and public host. Mark each scenario passed, failed or blocked, and retain a short observation or screenshot. Keep tokens, passwords, signed upload URLs and personal conversation data out of the report.

## Prepare each sample

1. Start from the exact reviewed candidate revision and read that sample's README. Use a fresh Python environment and its documented dependency/lock installation steps.
2. Configure the existing Azure Bot and Entra application using the sample's environment template. Enable the Teams channel and use the intended tenant/authentication model. Set the messaging endpoint to the public host's `/api/messages` route.
3. Replace every documented manifest placeholder with the matching application ID, domain and other required values. Apply only the Graph/RSC permissions justified by the sample and obtain the required consent. Keep secrets in environment configuration.
4. Create the Teams package with `manifest.json` and its referenced icons at the ZIP root. Install it in a scope declared by the manifest. Reinstall or update the package if its manifest changes during testing.
5. Confirm `GET /` succeeds without credentials. Confirm an anonymous request to `/api/messages` cannot execute sample behavior. Then send a real Teams activity and confirm it reaches the agent through authenticated processing.

Use the final README for exact commands, permissions and package paths. A missing prerequisite is a blocked test, not a passing scenario.

## Cards

Location: `samples/python/teams/bot-cards`.

- Send `card actions`. Check the Open URL action, submitted-name form and nested cards.
- Submit a name and confirm the acknowledgement contains it. Check that the Teams invoke completes without a client error or a spinning action.
- Send `toggle visibility`. Confirm the message starts hidden and toggles in both directions.
- Send a message containing both command phrases and verify card actions take precedence. Send unknown text and confirm useful help lists both commands.
- Where team/group-chat scopes are declared, repeat command delivery with the mention behavior documented by the sample.

## AI messages

Location: `samples/python/teams/bot-ai-messages`.

- Exercise each documented keyword and confirm the intended AI label, sensitivity metadata, feedback controls and citations are visible where supported by the Teams client.
- Use a message containing overlapping keywords and check documented precedence.
- Open a citation and confirm its source URL and content match the message.
- Open the custom feedback dialog, submit a reaction and feedback text, and confirm the acknowledgement preserves the submitted information.
- Send unknown text and confirm the help response remains useful.

## Message extensions

Location: `samples/python/teams/bot-message-extensions`.

- Open the extension from the compose area and search Wikipedia. Check adaptive result cards, readable snippets and thumbnail previews.
- Select a result and confirm the inserted content links to the expected Wikipedia article.
- Search for a value with no matches. Confirm the user receives a clear no-results message without an invoke error.
- Paste a supported Wikipedia URL and verify the unfurled preview retains that exact URL.
- Check every manifest-declared command context and the documented help/echo interaction.

Unknown protocol command IDs are covered by the local contract; no unsupported Teams UI manipulation is needed to manufacture them.

## Task modules

Location: `samples/python/teams/bot-task-modules`.

- Launch the adaptive input dialog and confirm submitted text appears in its acknowledgement.
- Launch the custom form. Confirm the public `/customform` page loads inside Teams, initializes the Teams SDK and submits successfully.
- Submit a name and email through the custom form and check both values in the acknowledgement.
- Complete the multi-step dialog. Confirm the name survives into the email step and the final message contains the submitted information.
- Check the fallback link and endpoint/domain configuration using the supported client flow. Record whether a failure comes from the agent response, page hosting, manifest or client policy.

## Attachments

Location: `samples/python/teams/bot-attachments`.

- Send a small non-sensitive file in a supported scope. Confirm its filename and size appear correctly in the consent card.
- Decline consent. Confirm no file is uploaded and the interaction is acknowledged.
- Send another file and accept consent. Confirm Teams acknowledges promptly, the upload completes, and the final file-info attachment opens the correct bytes.
- Reuse or click a completed consent action again if the client permits it. Confirm the file is not uploaded twice.
- Safely reproduce an unavailable transfer endpoint in a disposable test configuration. Confirm the error is handled and pending data is not reused.
- Stop the agent during a pending transfer and check that shutdown handles background work without unobserved task errors. Record whether work was drained or cancelled.

## Meetings

Location: `samples/python/teams/bot-meetings`.

- Install in the declared meeting scope and verify required meeting event subscriptions and consent.
- Follow the final README for `OnlineMeetings.Read.All` and `OnlineMeetingTranscript.Read.All` application permissions, admin consent and the organizer's application-access policy. These match the existing .NET meetings setup; local validation does not grant or verify them.
- Where available, test both a supplied Graph meeting resource ID and recovery through the meeting join URL with a known organizer. Record the input path actually exercised; one successful path does not prove the other.
- Start a meeting. Confirm title, timestamp and join action are correct.
- Join and leave with real participants. Confirm names/roles are preserved and agent-only entries do not generate participant messages.
- End a meeting with transcription enabled and permitted Graph access. Allow the documented initial delay/retries, then verify the newest transcript is returned and speaker text is readable.
- Exercise a meeting without an available transcript and confirm a clear fallback rather than a crash.
- Record any Graph denial with its permission/consent context. Do not treat a mocked resource-ID fallback as proof of live join-URL recovery; record that scenario separately if encountered.

## Targeted messages

Location: `samples/python/teams/agent-targeted-messages`.

- Create a short reminder for yourself and for a mentioned second test user. Confirm private acknowledgement and delayed delivery to the intended recipient.
- Use two users to list reminders. Confirm one user's reminders do not appear in another user's list and text cancellation enforces ownership.
- Test cancel, dismiss and snooze card actions. Confirm invokes complete and cancelled reminders do not fire; snoozed reminders fire once at the new time.
- Exercise suggested actions and check they route to the same commands as text input.
- Add and remove a reaction from a supported ordinary message. Confirm the correct message is targeted, including reply/quoted-message cases.
- Check documented slash restrictions and private prompt-preview behavior where supported by the client.
- Restart the process and confirm the documented in-memory state limitation. Stop with pending reminders and inspect shutdown for timer/task errors.

## Results and defect handoff

For a failure, include the tested commit, sample, scenario, expected result, actual result and sanitized reproduction steps. Separate application failures from missing consent, tenant policy, unavailable services and client limitations.

Return generated-sample corrections through the synchronization process. A correction requires fresh validation and a new tested revision. Keep a scenario pending until it has been repeated on that revision; results from an earlier candidate do not automatically apply.

Current live-test status: assigned to the user; not yet executed or reported.
