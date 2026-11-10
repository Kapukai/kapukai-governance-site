# One commercial record

Use this only when a real person requests a bounded paid engagement. Do not create a deal for a general signup or a fictional test. Keep one active pilot.

No new pipeline or custom fields are required. Use the existing deal owner and `hs_next_step` (Next step). Put the following compact metadata in the existing Deal Description. A linked task carries the next-action due date; the work due date below is the actual agreed delivery date. Do not use the sales close date as a delivery promise.

```text
KAPUKAI DOCUMENT PILOT — v1
Output: [affidavit draft / timeline / dossier]
Document phase: [request / scope / ready / work / deliver / close]
Exception: [none / awaiting response / correction / cancellation / refund pending]
Scope reference and version: [opaque reference]
Scope document SHA-256: [digest of the exact finalized scope file]
Customer acceptance reference: [opaque reference; must identify this scope]
Engineering: $250/hour; maximum [hours]; maximum fee [USD]
Work due: [agreed date and timezone]
Capacity reservation reference: [opaque reference]
Input/processing release reference: [opaque reference]
Payment reference and verified state: [opaque reference; unknown until checked]
Reviewed output reference, version and digest: [opaque reference]
Delivery reference: [opaque reference; separate from customer response]
Customer response reference: [opaque reference and affected output version]
Correction/cancellation/refund: [state and opaque evidence reference]
Closure: [pending / accepted / canceled / explained without acceptance]
```

Set **Next step** to one action someone can perform, such as “Confirm acceptance of scope v1.” Assign one owner and one associated task with the next review date. Update these in place; avoid creating another task for the same action after an uncertain response.

Treat native sales stages as sales information. A Closed Won deal can still have document phase Work or Deliver. Only record completion after the checklist's actual evidence exists. The optional code checker helps review the metadata; it does not enforce HubSpot edits or authenticate the referenced evidence.

Never paste case facts, private file URLs, access tokens, identity documents, signed agreements or payment credentials here. The record identifies evidence; it does not contain the evidence. Keep earlier scope/output versions and actual acceptance in the approved protected record.

See [operator guide](OPERATOR_GUIDE.md) for the six steps and exceptions.
