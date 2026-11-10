# Start one document pilot

One real request. One accepted scope. One reviewed output. One recorded outcome.

This is the preparation release for a manually coordinated pilot. It adds no database, subscriptions, paid checkout or private upload portal. HubSpot remains the commercial record. Existing free-resource and participation flows are unchanged.

## Use these three files

1. [Scope and use template](SCOPE_AND_USE_TEMPLATE.md) — prepare the exact offer and permission terms. It is a draft; complete and approve all fields before offering it.
2. [Deal checklist](DEAL_CHECKLIST.md) — copy the metadata section into the existing HubSpot deal once a concrete opportunity exists.
3. [Operator guide](OPERATOR_GUIDE.md) — follow the six steps and handle exceptions in the same record.

Keep one active pilot, choosing an affidavit draft, timeline or dossier. Engineering is $250/hour with a written hours cap. Tool availability remains subject to its actual test/release status.

## Review helper

`community/backend/commercial-pilot/workflow.mjs` evaluates an order's metadata and reports its phase, next action and missing evidence. It checks an exact scope fingerprint, payment agreement, capacity, processing release, document versions, delivery, acceptance, correction and refund state. It does not retrieve or authenticate that evidence, enforce HubSpot edits, issue payments or send messages. A positive result means the supplied metadata passes the checks; it does not independently prove that its assertions are true.

From `community/backend`:

```sh
node --test tests/commercial-pilot.test.mjs
node commercial-pilot/check.mjs --demo
node commercial-pilot/check.mjs /protected/path/order-metadata.json
```

The checker exits 0 for no listed blockers, 1 for an incomplete review, and 2 for invalid input. A canceled or explained closure can have no blockers while `complete` remains false. Inspect the reported outcome; exit 0 is not a payment or fulfillment certificate. Never save real order metadata in this public repository.

The initial checker models full payment of the USD engineering cap before work. It does not yet model deposits, staged billing or additional tax/fee lines. Finalize the actual payment terms and extend these checks before using a different payment schedule. The example is wholly fictional, including its payment, handling-route and delivery assertions.

## Before the first real order

Read [the release record](RELEASE_2026-10-20.md). Payment-provider and actual private delivery tests must be completed on the chosen routes. No real customer has accepted this template. The separate engineering task in HubSpot tracks the remaining setup.
