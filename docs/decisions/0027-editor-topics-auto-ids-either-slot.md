# 0027. Editor: topic registry, automatic IDs, either-slot activities, one review tick
Status: Accepted · Date: 2026-11-16

Context: The owner reviewed the Gate G editor on 2026-11-16 **[CONFIRMED by owner, 2026-11-16]**:
- Typing IDs is slow; picking a topic should fill everything in.
- The curriculum code and source fields are not needed.
- An activity should be usable as a meteor activity and as a normal one.
- Pictures should be previewed while choosing.
- One tick box, not six or seven.
- Preview-solve showed "+0 space credits".

[C §C19](../plan/C-game-and-learning-design.md#c19-topic-tables-by-age-and-subject-ages-5-6-and-7) already proposed a topic
registry with curriculum references, but it had not been built.

Decision:
- **Topic registry.** [contracts/topics.json](../../contracts/topics.json) is generated from the C19 tables by
  `scripts/gen_topics.py`, and CI checks it is current. It holds each topic's ID, subject, title, description, ages, curriculum
  references, types and audio. Both API Lambdas and both apps ship it, and adding a topic is a normal release.
- **Topic rules.** At validate and publish, the topic must be in the registry for its subject (rule `unknown_topic`), and the
  activity's ages must lie within the topic's ages (rule `topic_ages`). Once the activity has a published version, its topic is
  locked: `unknown_topic` is skipped, and `topic_ages` still applies when the locked topic is in the registry. An activity
  published earlier under a topic typed by hand therefore stays editable.
- **Curriculum and source.** `curriculumReference` becomes optional, and the editor no longer shows or writes it, `curriculumNote`
  or `source`. At publish, the version gets the topic's curriculum references when the definition has none, so the record still
  carries the spec's `curriculumReference` (prompt.md:548). Those entries are the C19 text as written (51 of them are not bare
  codes) and are not pattern-checked. `definitionHash` covers the version as published, including them.
- **Automatic IDs.** New activity: the operator chooses an interaction type and a topic. The subject, ages, title and ID then fill
  in, and the subject stays read-only afterwards. The ID is the next free `ma-`/`ph-`/`sp-` number across every activity,
  retired ones included, so IDs are never reused. On a collision the editor tries the next number.
- **Either slot.** `rewardCategory` gains `BOTH`, and new activities default to it. A `BOTH` activity belongs to its subject's
  normal group and its meteor group, but is still used at most once per run. The reward stays a property of the slot.
  Selection is greedy as before. When a slot is stuck, a swap step (augmenting path) lets an earlier slot hand over its unit and
  refill itself, so a run is refused only when no assignment exists. Plans that greedy selection could already make are unchanged,
  and so is every plan for a bank without `BOTH`, so `ALGORITHM_VERSION` stays 1 **[ASSUMPTION]**.
- **One tick.** Publish and speech Approve each show a single "I have checked this" box with the checks listed beneath it. The tick
  records every checklist key, so the server contract is unchanged.
- **Pictures and the 0-credit line.** The picker is a searchable grid of thumbnails. The learning panel prints no reward line when
  the reward has 0 credits and no power, and the admin preview says the slot decides the reward.

Alternatives:
- Keep typed IDs, and add a "suggest" button (rejected: the owner wants no typing).
- A separate copy of an activity for each slot (rejected: two records to keep in step).
- Keep the seven ticks (rejected by the owner).

Consequences:
- Topic IDs stay append-only (C19).
- Activities published before this change under a topic not in the registry stay editable.
- One tick is a weaker record than seven separate ones. It is acceptable while the owner is the only operator; revisit if another
  grown-up gets admin.
- The spine and C §C22.1/C22.3 are amended by reference only.

Evidence: owner's review message, 2026-11-16; the C19 tables; the selection tests for `BOTH` units.
