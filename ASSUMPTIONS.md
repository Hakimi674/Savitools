# Assumptions

A repo-wide ledger of design assumptions and cross-issue dependencies. It is
**not** scoped to a single issue: each section records the assumptions made
while delivering one issue, and the [index](#index) lists every section. Each
entry states a falsifiable claim and points at the code (or a linked issue/PR)
that verifies it — an entry that cannot be tied to either is removed rather
than left to drift (audit:
[#243](https://github.com/Savitura/Savitools/issues/243)).

Entries are numbered **globally and never reused**, so "entry 4" always means
the same thing even as sections are added.

## Index

- [How to add an entry](#how-to-add-an-entry)
- [Soroban Event Stream Inspector — issue #78](#soroban-event-stream-inspector-issue-78) — entries 1–10
- [Unified outbound signing contract — issue #204](#unified-outbound-signing-contract-issue-204) — entries 11–15

## How to add an entry

1. **Find or create your issue's section.** One `##` section per issue, headed
   with a short title and opened by a line that links the issue (and its PR, if
   merged). Add the section to the index with its entry range.
2. **Take the next global number.** Do not restart at 1 inside your section and
   do not renumber existing entries — a repeated number is how two contradictory
   "item 4"s ended up in this file once already
   ([#243](https://github.com/Savitura/Savitools/issues/243)).
3. **Format:** `N. **A bold, falsifiable claim.** Evidence — the file paths and
   symbols that prove it, plus the reasoning that is not visible in the code.`
4. **Verify before you write.** Every claim must be checkable against the code
   (path + behaviour) or against a linked, resolvable issue/PR. If you can point
   at neither, do not record it.
5. **Update in the same PR that changes the behaviour.** An assumption the code
   no longer honours is a bug in this file: edit or delete the entry where you
   change the code.

## Soroban Event Stream Inspector (issue #78)

Section for [issue #78](https://github.com/Savitura/Savitools/issues/78)
(closed by [PR #111](https://github.com/Savitura/Savitools/pull/111)).

1. **"All 15 ScVal types" means every variant the SDK exposes.** The
   lockfile-resolved `@stellar/stellar-sdk` 13.3.0 defines 22 `xdr.ScValType`
   variants; `apps/api/src/modules/contracts/scval-decoder.ts` covers all of
   them. A test asserts the count is 22
   (`apps/api/src/modules/contracts/scval-decoder.spec.ts`) so a future SDK bump
   that adds a variant fails loudly instead of silently falling through to the
   `default` branch.

2. **Wide integers are returned as decimal strings, bytes as hex.**
   `i128`/`u128`/`i256`/`u256`/`u64`/`i64`/`timepoint`/`duration` cannot
   round-trip through JSON as BigInt, and `Number` loses precision past 2^53, so
   `decodeScVal` stringifies them. `raw` always carries the original base64 XDR
   for anyone who needs the exact bytes.

3. **Replay signs each event as its own POST**, matching [issue
   #78](https://github.com/Savitura/Savitools/issues/78)'s acceptance criterion
   ("Replay sends each event as a POST ... with a valid X-SaviTools-Signature
   HMAC header") — not one batched payload.
   `EventsService.replayEvents` runs one signed `fetch` per event
   (`apps/api/src/modules/contracts/events.service.ts`). The wire format is
   shared by every outbound path — Webhook Tester, contract-event replay and
   monitor alerts all call `apps/api/src/modules/webhook/signature.ts`, and
   emit two headers: `X-SaviTools-Signature: sha256=<hex>` and
   `X-SaviTools-Timestamp: <unix seconds>`. The hex is HMAC-SHA256 over the
   UTF-8 bytes of `<timestamp>.<body>` with the exact body bytes sent.
   `verifySignature` rejects signatures older than 300 s (replay window) or
   more than 60 s in the future (sender clock skew).

4. **The signing secret resolves per request, then falls back to
   `WEBHOOK_SIGNING_SECRET`.** `WebhookService.sendWebhook` (via
   `resolveSecret`) and `EventsService.replayEvents` sign with the
   caller-supplied `secret` when present, otherwise with
   `WEBHOOK_SIGNING_SECRET`; when neither is set the webhook goes out unsigned.
   Monitor alerts always sign with the per-webhook DB secret
   (`NotificationWorkerService.decryptAndUpgradeSecret`), never the env var.
   `GET /webhooks/signing` (`WebhookController.getSigningStatus`) is
   implemented, public, and reports whether the env secret is configured plus
   the exact wire format — never a secret — so operators can confirm what
   receivers will see.

5. **Events are not persisted.** Query → decode → return; `EventsService` has
   no repository and the UI holds events in component state
   (`contract-events-tool.tsx`). The issue describes no storage, and Soroban RPC
   is itself the retention layer (roughly 24 h of ledgers — `events.service.ts`
   maps out-of-range `startLedger` errors to a 400 naming that window).

6. **Read endpoints are public; replay is authenticated.** `EventsController`'s
   query and filter routes carry no guard; replay requires `JwtAuthGuard`
   because it sends outbound traffic. `CONTRACT_ADMIN_EMAILS` guards
   deploy/invoke because those spend `DEPLOYER_SECRET_KEY`. Reading events
   spends nothing, and since an empty allowlist denies everyone by design
   (`ContractAuthorizationGuard`), gating reads would ship the tool unusable.

7. **The RPC `type` filter is a parameter, not a constant.** [Issue
   #78](https://github.com/Savitura/Savitools/issues/78) pins
   `type: 'contract'` but also asks for a `contract | system | diagnostic`
   badge, which is only meaningful if the type can vary. `QueryEventsDto.type`
   defaults to `'contract'` and is overridable (`events.service.ts`:
   `dto.type ?? "contract"`).

8. **Filter logic is duplicated between API and web, deliberately.** The API
   copy (`apps/api/src/modules/contracts/event-filters.ts`) is authoritative and
   carries the test table (`event-filters.spec.ts`);
   `apps/web/src/lib/contract-events.ts` mirrors it so the UI filters instantly
   with no round-trip. The SSRF guard used to be duplicated for the same reason
   until [#307](https://github.com/Savitura/Savitools/pull/307) consolidated it
   into `apps/api/src/common/ssrf-guard.ts`; the filter mirror stays, and drift
   risk is the accepted cost — the API copy's test table is what a drift would
   be caught against.

9. **`ContractsModule` imports `AuthModule`.** It used `JwtAuthGuard` on
   deploy/invoke without importing the module that provides it — `MonitorModule`
   is the correct pattern. The `EventsController` needs it for replay, and
   importing it also closed that pre-existing gap (`contracts.module.ts`).

10. **Decoder validation used constructed ScVal fixtures, not a deployed
    fixture contract.** The acceptance criterion asks for "a contract that emits
    one event of each type in a test transaction", which would require deploying
    and funding from CI. In-process fixtures
    (`apps/api/src/modules/contracts/scval-decoder.spec.ts`) exercise the
    identical decode path deterministically and offline. Its merge PR,
    [PR #111](https://github.com/Savitura/Savitools/pull/111), additionally
    recorded a live-testnet run in the verification notes: 200 real events
    decoded in 451 ms (criterion: 3 s), zero decode failures.

## Unified outbound signing contract (issue #204)

Section for [issue #204](https://github.com/Savitura/Savitools/issues/204)
(merged as [PR #227](https://github.com/Savitura/Savitools/pull/227)).

11. **The Webhook Tester signed a different payload than it sent.** Before
    [issue #204](https://github.com/Savitura/Savitools/issues/204) the browser's
    signature panel hashed the pretty-printed editor text
    (`<timestamp>.<payloadEditor>`), while the body the API handed to `fetch`
    came from re-serialising the parsed payload (`JSON.stringify(dto.payload)`)
    — so the signature the tester displayed covered bytes no receiver ever
    received. The signed value is now the single canonical `body` string that
    goes on the wire, and `WebhookHistoryEntry.signature` reports that exact
    body plus the timestamp so the UI and any receiver can recompute the same
    HMAC without re-deriving the serialisation.

12. **The legacy `X-Timestamp` ISO header was dropped rather than kept
    alongside the signing timestamp.** Two timestamps on one request, in
    different formats, is how a receiver ends up checking the wrong one. The
    signing timestamp in `X-SaviTools-Timestamp` is authoritative;
    `WebhookHistoryEntry.timestamp` still records the local send time for the
    UI's own display. The ISO header survives only as
    `LEGACY_ISO_TIMESTAMP_HEADER`, which is recognised on recorded deliveries
    and never emitted.

13. **Replaying a recorded delivery re-signs rather than replaying its
    headers.** Recorded secret-shaped headers are already redacted, so a stored
    signature can never be reproduced; the legacy pair and any stale
    `X-SaviTools-Timestamp` are stripped
    (`stripRecordedSignatureHeaders`) and the delivery is signed afresh with the
    deployment-wide secret (`secret: this.resolveSecret()`). Entries recorded
    under the body-only format are flagged `legacySignature` on read so the UI
    can say the replay no longer matches the original bytes.

14. **`GET /webhooks/signing` is public.** It returns configuration and the
    wire format, never a secret, so a receiver can confirm the contract before
    traffic is pointed at the deployment. The README and `docs/api-reference.md`
    documented the endpoint before it existed: the docs landed 2026-09-02 in
    `b01a701`, while the endpoint itself was only implemented on 2026-09-25 in
    `e255f12`.

15. **The browser re-implements the contract in
    `apps/web/src/lib/webhook-signature.ts`.** The Webhook Tester must
    reproduce the API's bytes to be useful as a verification aid, and it cannot
    import API code. Both sides assert the same known-answer vector
    (`sha256=8fdd9825...` in `signature.spec.ts` and
    `webhook-signature.test.ts`), so a divergence fails one of the two suites
    rather than surfacing as a signature that only the UI believes.
