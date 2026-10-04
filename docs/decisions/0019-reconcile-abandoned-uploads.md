# ADR 0019: Reconcile abandoned uploads with storage

- Status: Accepted
- Date: 2026-10-04
- Refines ADR 0008's stale-row reconciliation and ADR 0017's record deletion.

## Context

Initialization creates a `PENDING` row whose `expiresAt` is the file lifetime
the owner chose, from one hour to seven days. The presigned PUT it returns is
valid for 15 minutes. If the browser's direct upload fails, or the tab closes,
nothing tells the server, and the row stays `PENDING` until that lifetime ends:
scheduled cleanup only expires due rows, manual expiry accepts only `READY`, and
owner deletion accepted only `EXPIRED`, `DELETING` and `DELETED`.

A failed upload in production therefore stayed `PENDING` for its full lifetime,
and the owner could not delete it. ADR 0008 requires cleanup to eventually
reconcile stale `PENDING` rows with storage; tying that to the file lifetime
made "eventually" as long as seven days.

A browser-side failure is not proof that the upload failed. If the response to
a successful PUT is lost, R2 holds a complete object, and only the completion
request is missing.

## Decision

A `PENDING` upload is **reconciled with storage** through the existing
completion logic, so R2 decides the outcome. Reconciliation happens in two
cases:

- **Browser-reported failure.** When its direct PUT fails, the upload page calls
  `POST /api/uploads/{fileId}/abandon`, with the same owner session and
  same-origin checks as completion. The call is best effort. It is not made
  after a failure at the completion step, which can simply be retried.
- **Age.** A `PENDING` row is **abandoned** once it is six hours old. Scheduled
  cleanup looks for such rows, excluding rows that are already due, and owner
  deletion applies the same rule to the selected row.

| Storage state at reconciliation | Result                                     |
| ------------------------------- | ------------------------------------------ |
| Object matches size and type    | `READY`, exactly as a normal completion    |
| Object mismatched               | `FAILED`, object deleted (as ADR 0008)     |
| File lifetime already over      | `EXPIRED`, object deleted (as ADR 0008)    |
| No object, row six hours old    | `FAILED`                                   |
| No object, younger row          | Unchanged, still `PENDING`                 |
| Storage cannot be inspected     | Unchanged; retried unless it expires first |

An absent object is evidence only for the moment it was checked: a PUT whose
connection failed can still commit shortly afterwards, and R2 offers no way to
stop a PUT that has started. So absence fails a row only once it is six hours
old, by which time such a commit has long landed: a reconciliation from then on
completes it instead of failing it. A browser-reported failure with no object
therefore leaves the row `PENDING`.

Every transition is the existing conditional update from `PENDING`, so a row
that another request has already moved is left as it is, and reconciling it
again is harmless. The owner may delete `FAILED` records. Reconciliation never
deletes an absent upload's object directly: deletion keeps the fenced lease and
waits 30 minutes after initialization, the upload grant plus a buffer (ADR 0017).
An alternative that failed the row at once and checked storage again before
deleting was rejected: a check before deletion cannot fence a PUT either, it
added a `FAILED` to `READY` transition, and objects it could not inspect would
have stalled the deletion batch for every kind of record.

The 15-minute URL limits when a PUT may start, not how long it may run. Six
hours is far beyond that: a 3 GB transfer still running six hours after
initialization would have to average below about 1.1 Mbit/s. A file with the
one-hour lifetime expires first anyway. A unit test keeps the cutoff at least
four times the 30-minute deletion safety window.

## Consequences

- A browser-reported failure is reconciled within seconds. If R2 received the
  upload after all, it becomes available and its link can be retrieved from the
  file list, even though the upload page reported a failure. If R2 has nothing,
  the upload stays `PENDING` and becomes deletable once it is six hours old, or
  when its lifetime ends if that comes first, rather than only at the end of a
  lifetime of up to seven days.
- Every other stale upload, including one whose tab closed, is reconciled when
  the owner deletes it after six hours, or by scheduled cleanup, which takes the
  oldest 100 such uploads per run.
- A late commit is not guaranteed a reconciliation. Cleanup runs daily and
  skips rows that are already due, so an upload with a one-hour lifetime, or a
  24-hour one that no run reaches between six and 24 hours, simply expires and
  its object is deleted, as every unfinished upload was before this decision.
  The owner was told that upload failed and still holds the file.
- If storage cannot be inspected for 100 of these uploads on every run, they
  hold the reconciliation batch and newer abandoned uploads wait. Those still
  expire and are deleted at the end of their lifetime, the behaviour before
  this decision; scheduled deletion of other records is not affected.
- Only a transfer still running six hours after initialization can be failed
  while its object is on the way: a 3 GB transfer slower than the bound above.
  Its completion is refused as not completable, and if its object arrives after
  the failed row has been deleted, it is orphaned, the limitation ADR 0017
  already records. An object-store lifecycle backstop remains advisable.
- The file list decides whether a `PENDING` row is six hours old with the
  browser's clock at load time, as it already does for expiry. A skewed clock
  can show or hide the delete action early; the server applies its own clock.
- `upload.abandon` records that an abandonment request was handled, not which
  state resulted. Cleanup reports reconciled rows as `reconciledCount`, and
  counts a reconciliation that could not inspect storage as a retryable failure.
- No schema change or migration. A rollback to an earlier release leaves
  `FAILED` rows to scheduled cleanup, as before; the owner cannot delete them by
  hand until this release returns.
- The age-based query filters on `status`, `created_at` and `expires_at`
  without a dedicated index. `PENDING` rows are few, so this is acceptable at
  the current scale.
