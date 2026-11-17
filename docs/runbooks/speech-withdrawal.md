# Runbook: a speech clip turns out to be wrong

In v1 this is a runbook, not a route ([D §D9.6](../plan/D-ux-and-content-operations.md), spine S5.2): an approved
speech version is never changed, so the activities that use it are withdrawn and republished with a fixed one.

1. **Find the activities that use it.** Admin → Speech → open the definition → **Delete**. While any activity draft or
   version uses it, the delete is refused and the message names each activity (R32): nothing is deleted. Write the
   list down. (For a phonics sound you can also read the Audio row of each phonics activity, D A3.)
2. **Withdraw** each listed activity's current version (Admin → the activity → Versions → Withdraw, reason "speech
   clip wrong"; D8.3). For children it behaves as D6.4 "voided": a run already holding it ends that slot fairly.
3. **Fix the clip.** Edit the speech draft (or the SSML), Preview, listen, Approve: a new speech version. For a sound
   the voice cannot say well, use a human recording (D9.2).
4. **Republish** each activity so its new version refers to the new speech version (the editor resolves the latest
   approved one), going through the checklist as usual.
5. Record it below; if it is a new kind of fault, add a line to the speech checklist.

## Log

| Date | Speech definition | What was wrong | Activities withdrawn and republished |
|---|---|---|---|
| | | | |
