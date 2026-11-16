# 0029. Activities can be deleted
Status: Proposed · Date: 2026-11-16

Context: The owner asked how to delete activities. Admin had no way to remove one: retire (R28) and withdraw (R29) existed in the
API but had no buttons, and a never-published draft could not be removed at all. Offered retire, withdraw and discard, the owner
chose "just do delete" **[CONFIRMED by owner, 2026-11-16]**.

Decision:
- **The route.** New route R31, `DELETE /api/admin/activities/{id}` (admin-api, operator authoriser, scope `ops/content`), removes
  the header, the draft and every version.
- **Order of deletion.** The header goes first, in one transaction with the draft and one audit item (`action "delete"`, every
  version ID, `by`). That transaction is conditioned on the `publishedVersion` read. Up to 97 versions go in the same transaction;
  above that, the rest are deleted afterwards. A retry finishes the job, and 404 means nothing is left.
- **Permissions.** The admin-api role gains `dynamodb:DeleteItem` on the content table.
- **Admin page.** The activity page has a "Delete activity" button with a confirm dialog (Cancel focused). Retire and withdraw keep
  their routes but have no buttons.

Alternatives: retire and withdraw buttons with "discard draft" (offered and declined: the owner wants one button); a soft delete
flag (more states to show, against the owner's ask).

Consequences:
- **Games in progress.** A slot pinned to a deleted version reads as withdrawn. The next attempt is voided with the reward still
  given, and the child sees "This one had a mistake, so we took it away. You still get your reward." A device that loaded the pack
  before the delete still shows the activity until it reloads. Each such attempt logs `VERSION_MISSING` at ERROR, with no alarm.
- **New games.** New runs stop choosing the activity at once. If too few remain for an age, new runs get `BANK_NOT_READY`.
- **IDs.** "Never reused" no longer holds strictly: deleting the highest ID lets the editor offer that number again. That is safe,
  because pins carry the version ID (a publish timestamp), and summaries are keyed by topic.
- **Records.** The audit item is the only record left. The C §activityId row and F §12.6 are amended by reference.

Evidence: owner messages 2026-11-16; api/tests/unit/test_admin_delete.py and the run-in-progress test in test_ops.py.
