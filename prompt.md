You are working with me in my existing repository. Act as a senior game designer, educational-content architect, React/TypeScript/Phaser engineer and AWS serverless architect.

YOUR TASK IS TO PLAN THE BUILD. Read the approved specification below, inspect the existing repository, then produce a complete, practical implementation plan. Do not begin implementation, change application files, create a replacement bootstrap, run Terraform apply, deploy infrastructure or generate the whole codebase.

I am an experienced AWS Solutions Architect who is learning software development and wants to write the code myself. Explain decisions and trade-offs as a colleague. Give me a sequence of manageable tasks with observable completion criteria. Small conceptual examples are fine; an unsolicited implementation is not.

FIRST, INSPECT WHAT EXISTS

Read repository instructions.

Locate the repository structure, bootstrap module, Terraform backend, AWS provider/environment conventions, OIDC role integration and editable GitHub Actions workflow examples.

Identify facts from actual files and cite their paths in your plan.

Reuse existing conventions. Do not invent repository paths, resources or account details.

If you cannot access the repository, say so, distinguish that limitation from the product requirements, and still produce the useful product/architecture plan with a clear repository-inspection step.

PRIORITY INSTRUCTIONS

The approved product brief below is authoritative. Do not restart requirements discovery or replace it with your preferred product.

Use React + TypeScript + Phaser, Python Lambda, DynamoDB, Cognito, Terraform and GitHub Actions.

Reuse my existing bootstrap, Terraform state setup, OIDC and pipeline patterns. Production only for now, in the existing London workload account, using one manually triggered coordinated release.

I will handle my established DNS-account lookup/integration. Respect aliens.jackgl.com and admin.aliens.jackgl.com; identify the integration points without redesigning DNS.

Individual child accounts, no parent-account concept. Username/password, nickname/avatar and private DOB-derived age.

Six stationary astronaut classes, three upgrade levels, a fixed route, fifty authored waves, bosses every ten, and optional endless continuation. All ages have the same combat and rewards; questions differ.

Learning and meteor activities are untimed. Three attempts, reward once on success, no reward after three incorrect answers, no penalty to credits/colony and no adaptive remedial difficulty.

Phonics has a Play button that calls an authenticated microservice/API invoking a dedicated Python TTS Lambda and delivers audio to the browser. Amazon Polly is the proposed engine. Do not replace it with browser speech synthesis.

Resolve offline continuation honestly: prepare finite campaign content and speech audio online, cache actual audio bytes, then play cached clips offline. An offline browser cannot call Lambda and endless content is not infinite.

Preserve attempts and rewards across refresh/reconnect; distinguish a suspended run from terminal defeat. Several saves can exist, but one authoritative active writer is accepted per account.

Keep roles, names, numerical balance and module choices clearly labelled as confirmed requirements or engineering/creative proposals.

Do not claim tests, assets, deployments or repository features exist unless you have actually verified them.

Do not ask me budget questions. Make reasonable labelled choices for routine details. Raise only genuine blockers that cannot be settled by inspecting the repository or by stating an assumption.

REQUIRED RESPONSE STRUCTURE

A. Repository findings
Provide actual observed paths/configuration, reuse decisions and missing integration work.

B. Confirmed scope and design decisions
Summarise the product, exclusions and the distinction between the full first release and a small first playable milestone. List remaining engineering assumptions without re-asking the discovery questionnaire.

C. Game and learning design
Provide the six named class proposals, all three levels, purchase/upgrade/refund values, targeting/support rules, alien/carrier/boss definitions, complete 50-wave schedule, meteor powers, badge rules and bounded endless scaling. Label numerical values as initial playtest settings. Include worked age-5 and age-7 examples with the same combat/reward opportunity and a coherent credit/purchase sequence. Include age-6 coverage in the content-bank design.

D. UX and content operations
Describe screens, keyboard/mouse flows, question interaction types, admin publication/versioning, generated-art inventory and phonics preview/review.

E. Architecture and service boundaries
Provide a readable architecture diagram and the dedicated TTS sequence. Define React/Phaser responsibilities, API/Lambda boundaries, authentication/authorisation, offline preparation, audio caching and the family-level trust model.

F. State and data
Provide run/activity/session state machines, exact checkpoint semantics, attempt/reward idempotency, concurrency fencing, offline conflict handling, content-version compatibility and permanent-versus-run progression. Propose DynamoDB access patterns, keys, indexes, transactional boundaries and bounded item/history growth.

G. API contracts
Provide routes, authorisation, request/response fields, error categories, save revisions, idempotency and sync semantics. Do not implement handlers.

H. Infrastructure and delivery
Map Terraform/module changes to the actual existing repository. Explain manual release order, artifact ownership, quality gates, data protection, compatible rollback, monitoring and daily backup/restore.

I. Validation
Map tests and child playtest observations to the supplied acceptance criteria. Address phonics correctness, refresh after wrong answers, duplicate rewards, partial-wave rewind, defeat, stale offline writers, new content versions, expired authentication and API access control.

J. Execution backlog
Return dependency-ordered tasks with scope, affected areas/files, relative effort, risks and concrete completion criteria. Give a small first task that I can implement myself. Document decisions as work is completed.

Then stop before implementation. Do not substitute a list of generic technology suggestions for the complete plan.

BEGIN APPROVED SPECIFICATION

SPACE COLONY DEFENCE
Product, gameplay and architecture specification
Version 1.0 — 14 November 2026

STATUS AND PURPOSE

This document consolidates the user's questionnaire answers and accepted follow-up recommendations. It is the requirements brief for Claude to plan a build in an existing repository. It does not claim that software has been implemented, deployed, tested or balanced.

“Space Colony Defence” is a working title. Product behaviour explicitly selected by the user is fixed. Proposed character names, numerical balance, API route names, physical database layout and milestone sequencing are planning proposals that Claude may improve with reasons. Engineering choices must follow inspection of the existing repository.

The user is an experienced AWS Solutions Architect learning software development. The immediate Claude task is planning and explanation. The user intends to write the code. Do not generate the whole codebase, edit application files, run Terraform apply or start deployment during the planning task.

PRODUCT VISION AND DELIVERY BOUNDARY

Build a colourful, browser-based, single-player educational tower defence game for children initially aged 5, 6 and 7. Stationary astronauts protect a planetary research colony from mischievous cartoon aliens travelling along a fixed, clearly marked route. Children buy and upgrade astronauts using space credits. Between waves they complete age-appropriate maths, phonics and spelling activities to earn additional credits or temporary powers.

The combat, interface, wave schedule and reward opportunities are the same at every supported age. Only the educational content differs. Players return to unfinished runs over multiple visits; a run is not constrained to one short sitting.

The application is publicly reachable and permits self-signup. It is free and intended initially for the user's family, with an architecture that can accommodate more users. Public availability does not introduce leaderboards, chat, multiplayer or commercial features.

Confirmed domains:

Player application: aliens.jackgl.com.

Content administration: admin.aliens.jackgl.com.

API hostname: follow the existing repository pattern; a new custom API hostname is not a product requirement.

Full initial product scope:

Laptop browsers, with keyboard and mouse support.

One playable planet and one clearly marked route on its map.

Six astronaut classes; three upgrade levels per class.

Fifty authored campaign waves; bosses on waves 10, 20, 30, 40 and 50.

Optional endless continuation after campaign completion.

Replayable runs and short standalone challenges using the same mechanics.

Maths, phonics and spelling, rotated automatically between waves.

Multiple age-appropriate interaction formats.

Individual child accounts, saved runs, progress summaries and badges.

An operator-only content administration interface.

A dedicated serverless text-to-speech microservice for phonics.

Multiple saved runs, one accepted active play session per account.

Finite-campaign offline continuation after the run's content has been prepared.

Manual, coordinated production deployment through the existing GitHub Actions setup.

Later scope:

Additional planets and environments.

Tablet-specific optimisation.

Any parent/teacher account model, classroom features or commercial product changes.

An installable PWA or native application.

Expanded content-authoring automation.

Explicit exclusions:

Multiplayer, public rankings, chat, social sharing features and sibling comparison.

Advertising, paid credits, payments and monetisation.

A sandbox mode.

A gameplay tutorial.

Parent accounts, parent dashboards, parent assignments and parental difficulty overrides.

Performance-adaptive question difficulty or automatic remedial paths.

Penalties to colony health or credits for wrong educational answers.

Music and character voice acting.

Browser speech synthesis as a replacement for the requested TTS service.

Live, unreviewed AI-generated questions delivered to children.

A small first playable milestone may implement a subset of the full scope. It must be labelled a milestone, not silently redefine the agreed product.

TERMINOLOGY AND STATE CONCEPTS

Planet: a world with a map, route, build pads, visual theme and versioned wave definitions.

Run: one attempt on a planet, possibly continued over several visits. “Mission” in the original discussion means this run unless describing a short standalone challenge.

Wave: one combat round.

Preparation phase: the pause between waves for learning, purchases, upgrades and choosing Ready.

Campaign completion: clearing wave 50.

Endless continuation: the optional continuation of that successful run beyond wave 50.

Saved run: a nonterminal run the player can resume.

Active play session: the current device's permission to update one run. This is distinct from a Cognito authentication session.

Permanent progression: highest completed wave, earned badges, unlocked planets and learning summaries.

Run resources: credits, deployed astronauts, upgrades, unlocked classes and temporary powers. These do not form a persistent cross-run wallet.

Best wave means highest COMPLETED wave. If a player loses during wave 17 after clearing wave 16, their best completed wave for that run is 16.

PLAYER ACCOUNTS AND ADMINISTRATION

Players register and sign in using a unique username and password through Amazon Cognito. A display nickname is separate from the stable account identity. No parent-account hierarchy is present.

Profile fields:

Cognito subject as the stable owner identifier.

Nickname.

Avatar selection.

Private date of birth.

Derived current age.

Permanent game progression and learning summaries.

DOB is used to derive an age-appropriate bank. It must not appear in public screens, speech requests, generated audio keys or general logs. The initial content covers ages 5, 6 and 7. Public registration can exist independently of content coverage; starting a run requires an eligible published content pack. If no eligible bank exists, show an honest content-unavailable message rather than silently serving a different age or inventing questions.

Pin a run's age band and selected content versions when creating it. A birthday affects new runs, not a run already in progress. DOB correction, if exposed, must follow the same rule.

The registration plan must specify how a username/password account becomes confirmed when email is not required. Do not leave accounts stuck in an unconfirmed state. Use an appropriate Cognito-supported flow and trusted server-side configuration; do not grant users administrative API permissions.

Password recovery is administrator-managed initially. It is an operational Cognito administration task; the first content dashboard does not need a full user-management console. Cognito documents administrator-managed and verified-contact recovery options [R7].

Sign-out and subsequent sign-in switch between children on a shared laptop. One child's cached progress, queued requests, credentials or private profile must not appear to another. Local data must be account-scoped. Warn clearly about locally pending progress before an operation would discard it.

The content operator uses a separately authorised admin role/group. Assign that privilege through trusted administration. A normal signup must never be able to request or grant admin membership. The admin hostname is an interface location, not the mechanism enforcing authorisation.

The player can reset the current run, campaign progression or learning history through distinct operations with clear consequences and confirmation. A whole-profile reset is distinct again. Implementations must not make one reset accidentally erase unrelated categories.

SCREENS AND KEY JOURNEYS

Player screens:

Landing, signup and sign-in.

Profile setup: nickname, avatar and DOB.

Home with a prominent Continue action for the most recently played resumable run.

Saved runs list, because several unfinished runs can exist.

Galaxy map with the initial playable planet and space for later released worlds.

Run setup and an explicit preparation/offline-readiness state.

Battlefield and preparation/activity panel.

Pause, Save and exit, and abandon/restart controls.

Defeat, campaign completion and optional endless continuation.

Progress view: explored planets, best completed waves, badges and simple learning summaries.

Profile and separate reset actions.

Operator screens:

Admin sign-in.

Question/activity list with search/filter by subject, age, type and publication status.

Add/edit draft content, preview an activity and preview its audio.

Publish a valid version or retire content from future runs.

No parent dashboards, class management or general CMS in the initial scope.

The child-facing UI must provide keyboard equivalents for essential mouse interactions. Click an astronaut then a pad as the primary placement interaction. Dragging can be supported but cannot be required. Inputs need clear focus, readable labels and consistent click targets. Pictures and short text communicate gameplay. Phonics gets a visible Play control. Same interface across ages.

When a page is hidden or an interruption opens, pause combat. Returning must leave it paused until the player resumes. Buying and upgrading are allowed during combat; keyboard shortcuts must not interfere with typing a learning answer.

No gameplay tutorial. Labels, cost/range previews and brief explanations on character cards can make controls understandable without adding a forced tutorial. A short educational demonstration before a new concept is allowed: the user asked for teaching as well as practice. Such content is not an adaptive hint sequence triggered by failure.

BATTLEFIELD AND COMBAT RULES

Use an angled 2D presentation. The first planet is a research colony on a colourful lunar environment. Its exact name, artwork and geometry are design proposals.

Aliens follow one visible, authored route to the colony. Astronauts occupy predefined pads beside the route. They cannot be placed on the route or moved through movement commands. Selling and redeploying is permitted through separate transactions.

Astronauts attack automatically according to their role. The player can:

Deploy, upgrade and sell.

Change supported targeting priorities.

Use temporary abilities.

Pause/resume.

Change battle speed through an optional control.

View cost, upgrade benefits and range.

The colony has health or a clearly understandable equivalent. Aliens that reach it deal defined leak damage. Reaching zero ends the run. No alien damages, disables or blocks an astronaut or build pad. Shields and repairs therefore protect the colony; enemy healers and shields help other aliens.

An alien defeat produces a playful burst of stars. No graphic injury. Aliens are funny and mischievous, with silhouette, equipment, movement and icons indicating their behaviour. Colour is supplementary.

Counters are advantages. Do not require a single exact class to beat an enemy, especially a class not yet unlocked. Flying aliens follow the same route in version one; flight is a visual/combat trait, not permission to add a different path or bypass the map.

Targeting and combat must remain readable at higher speed. Simulation time, pause and speed controls must have explicit semantics; browser frame rate must not change damage, movement or reward outcomes.

ASTRONAUT ROSTER

The six class roles are part of the agreed design. Personal names and personalities below are initial creative proposals.

A. NOVA — LASER SCOUT
Role: dependable single-target damage and the first available class.
Identity: enthusiastic explorer; bright visor and a compact laser instrument.
Level 1: basic automatic attacks.
Level 2: improved firing speed.
Level 3: improved range and damage.
Visual progression: larger lens, clearer beam and additional suit insignia.

B. PIP — FROST EXPLORER
Role: low damage plus slowing.
Identity: playful ice researcher; snowflake equipment and rounded cooling canisters.
Level 1: brief single-target slow.
Level 2: stronger or longer slow.
Level 3: small-area slowing.
Rules: define a slow cap and stacking policy; repeated slow effects must not accidentally immobilise an enemy forever.

C. JUNO — COMET ENGINEER
Role: area damage against groups.
Identity: inventive engineer; chunky, toy-like comet launcher.
Level 1: small blast radius.
Level 2: increased area.
Level 3: increased area damage and a clearer impact effect.
Rules: use a defined splash falloff or full-radius rule; avoid unexplained damage outside the preview.

D. MIRA — SHIELD SPECIALIST
Role: protect or repair the research colony.
Identity: calm colony technician; an obvious shield emblem.
Level 1: periodically supplies capped colony protection.
Level 2: stronger protection.
Level 3: faster recharge and/or a modest capped repair.
Rules: cannot heal astronauts because astronauts have no damage mechanic. Prevent unlimited stacking or invulnerability.

E. ORION — ORBIT RANGER
Role: long-range, slower powerful attacks.
Identity: observant navigator; telescope-like targeting equipment.
Level 1: long reach with a slower shot.
Level 2: more range.
Level 3: stronger attacks and a useful target-priority option.
Rules: provides an advantage against durable or distant targets without making other damage classes irrelevant.

F. SOL — BEACON COMMANDER
Role: improve nearby astronauts.
Identity: encouraging communications specialist; a distinct antenna/beacon.
Level 1: modest nearby attack support.
Level 2: improved support effect.
Level 3: greater support radius.
Rules: equivalent buffs use the strongest effect rather than multiplying indefinitely; no recursive self-buff loops. A support-only class need not receive invented damage upgrades.

Classes unlock within each run. A proposed pacing is availability at the start and after completing waves 5, 10, 15, 20 and 25. Claude must choose a coherent order that supports early bosses and explain it. “After wave 5” means available in preparation for wave 6.

Each class has three total levels. Upgrades are linear, class-specific and visibly change equipment or effects. Claude must propose purchase prices, upgrade costs, range, attack speed, damage/support effects, targeting, limits and refund rules. These are starting values for playtests, not validated balance.

ALIENS, CARRIERS AND BOSSES

Catalogue:

Moon Blob: basic slow walker.

Meteor Mite: fast, fragile enemy.

Shellback: durable, protected enemy.

Bubble Swarm: a group of small enemies.

Orbit Flutter: proposed flying alien, following the route.

Bubble Guard: proposed shielded enemy.

Patchling: proposed healer for nearby aliens.

Split Slime: proposed enemy that releases smaller descendants.

Alien Craft: the requested carrier that releases several aliens when destroyed.

A master/mega alien encounter every ten waves.

Introduce a new enemy gently before combining it with others. Names beyond the first four are proposals.

Carrier and splitter rules:

Descendants spawn at the parent's route progress.

Assign unique enemy identities.

A wave completes only after scheduled enemies and all descendants are resolved.

Define carrier and offspring credit rewards separately.

Do not duplicate spawning or rewards on pause, reload or retry.

A carrier reaching the colony applies defined leak damage. Releasing children on escape is not an agreed feature.

Limit total active descendants to maintain performance.

Bosses may differ in health, movement, shields, escorts and support for other aliens. They must obey the no-damage/no-disable rule for astronauts. Define health, leak damage, reward, phase transitions and visual cues. Do not add new routes, base-attacking projectiles or pad-disabling powers without identifying them as a proposed scope change.

The intended later-wave challenge comes primarily from more aliens, faster aliens and stronger existing combinations. Keep the map route predictable. Set explicit limits so endless mode does not imply an unlimited number of rendered objects.

CAMPAIGN, ENDLESS MODE AND METEORS

The first campaign has 50 authored waves. Normal gameplay is predictable between attempts. Educational questions change between fresh runs; battle definitions do not randomly change.

Suggested wave-design blocks:

1–9: core placement, basic enemies and early support choices.

10: first boss.

11–19: introduce additional behaviours and group combinations.

20: second boss; record eligibility for the next planet when it is available.

21–29: combine support enemies, splitters and carriers.

30: third boss.

31–39: denser/faster combinations within performance limits.

40: fourth boss.

41–49: final authored escalation.

50: campaign boss and completion.

Claude must produce the actual wave schedule, with counts, spawn spacing, speeds, special introductions and boss parameters. This block structure is not a substitute for the required wave table.

After wave 50, grant the completion badge before asking whether to continue into endless mode. A later endless defeat must not remove campaign completion.

Future planets may include Mars, an ice world, jungle world, asteroid base and space station. Initially only one is playable. Clearing 20 waves on the preceding planet grants access when the next planet is released; do not display an unavailable placeholder as playable.

Meteor opportunities occur before bosses, provisionally after clearing waves 9, 19, 29, 39 and 49. They are optional extra learning challenges, explicitly additional to the normal between-wave activity. Success gives a temporary weapon or power useful for the boss. Failure or declining cannot make the boss unwinnable.

Possible power proposals: a temporary colony shield, a field-wide slowing pulse, and a targeted comet burst. Claude defines quantities, cooldowns, targeting and caps. They belong to the current run.

Standalone challenges should reuse the same game/activity systems with a short configured wave set. They must not quietly become a sandbox or a separate game engine.

SPACE CREDIT ECONOMY AND PERMANENT PROGRESSION

Each fresh run gets a fixed starting allowance sufficient for a viable basic defence. Credits come from defeated aliens and successful learning activities. There are no purchases of credits and no persistent credit wallet.

Normal activity rewards must provide comparable purchasing power across ages. A successful age-5 activity and a successful age-7 activity at the same stage offer the same reward opportunity.

Wrong answers do not subtract credits or damage the colony. They can cause the activity to finish without a reward after the third incorrect attempt. Combat remains possible using the starting allowance and combat rewards; optional learning/meteor bonuses should make play more rewarding without introducing an unrecoverable question-failure lock.

One normal activity per interval prevents unlimited question farming before a wave. Selling gives a partial refund. Define rounding and whether the refund covers purchase price and paid upgrades. Selling/rebuying must not generate credits.

After defeat or a fresh restart:

Reset credits to the starting allowance.

Reset class availability to starting classes.

Remove deployed astronauts and purchased upgrades.

Reset temporary powers and run cooldowns.

Retain best completed waves, planet eligibility/unlocks, badges and learning summaries.

An unfinished saved run preserves its run resources at the checkpoint. Run resources are never shared across several saved runs.

Record milestones when achieved, including wave-20 eligibility and wave-50 completion. Learning summaries reflect completed activities even if the run is later lost. An interrupted/incomplete activity is not automatically a failed activity.

Claude must produce an initial economy table and at least one worked purchase/upgrade example. It must assess whether a reasonable baseline defence can progress without every bonus and explain where playtesting is required.

LEARNING CONTENT AND ACTIVITY RULES

England's national curriculum is the agreed curriculum reference. Use official maths and English programmes of study as content-authoring references [R9, R10]. The age mapping is a curated product decision, not a claim that birthday age alone identifies a child's school year or attainment.

Initial subject coverage:

Maths: counting, comparing numbers, addition, subtraction, shapes, patterns, number bonds and age-appropriate times tables.

Phonics: age-appropriate grapheme/sound and blending activities.

Spelling: arranging letters, completing or typing age-appropriate words.

Interaction types in the full scope:

Picture selection.

Number selection.

Moving/counting/sorting objects.

Arranging letters or ordered items.

Multiple choice.

Typed numeric or word answers.

Provide keyboard equivalents, including selecting/reordering where drag and drop is shown. Define answer normalisation separately by type: whitespace/case for spelling where appropriate, equivalent numeric representations where intended, and meaningful order for arrangement activities.

Automatic subject rotation provides a mixture of maths, phonics and spelling. Topic and activity choice comes from the run's age bank, with enough variation that fresh runs differ. No performance-based difficulty adjustment, parent-level overrides, revision scheduler or remedial routing.

Normal learning activities and meteor challenges are untimed. Waiting, audio playback or replay, pauses and time spent considering an answer must not consume an attempt or reduce the reward. Each reward-bearing activity permits up to three attempts. Combat starts only when the player selects Ready; no activity timer or automatic next-wave countdown is introduced.

Normal interval:

Resolve the completed combat wave.

Present one selected activity.

Allow up to three answer attempts.

A correct answer on any attempt completes the activity successfully and grants the reward once.

Three incorrect attempts complete it unsuccessfully with no reward.

Return to preparation; the player presses Ready to continue.

Wave 1 starts with funds and preparation; a compulsory pre-wave-1 activity is not required. Before wave 51, provide the normal activity if the player chooses endless continuation. No activity needs to interrupt the wave-50 completion screen.

“Activity” can be a visual task rather than a simple text question. It is one reward-bearing unit. If a template has several substeps, Claude must define how those substeps compose one attempt instead of silently multiplying the reward budget.

Every activity has a stable identifier within the run. Persist attempts independently of final success. Refreshing after two wrong attempts must leave one attempt. Reloading must not select a new question or restart its attempt count. Normal and meteor activities have separate IDs, even before the same boss.

Content may originate from handwritten material, deterministic templates, imports or AI-assisted drafting. Human review is required before it reaches the published bank. This is not authorisation to build a live AI tutor or an integrated generative-content platform. Manual entry and approved templates are sufficient initial authoring routes; import tooling can be phased explicitly.

Learning summaries remain simple: completed activities, successes within three attempts, failures and counts by subject/topic across sessions. They are not an independent/supported/mastered scoring system. Internal attempt records exist for reliable enforcement without adding a new child-facing assessment model.

CONTENT ADMINISTRATION AND PUBLICATION

The version-one admin app focuses on educational content. It needs enough lifecycle support to add questions safely and correct them:

Create and edit drafts.

Set subject, topic, curriculum reference where useful, age range and interaction type.

Enter prompt text, selectable options or activity data, answer specification and reward category.

Enter optional concept demonstration content.

Add approved phonics speech definitions and preview them.

Validate and publish an immutable version.

Retire a question from selection for new runs while preserving versions referenced by existing runs.

Suggested activity fields:
activityId, version, status, subject, topic, minAge, maxAge, curriculumReference, interactionType, prompt, visualAssetReferences, activityPayload, answerSpecification, introductionContent, speechDefinitionReferences, rewardCategory, author/review metadata.

Do not let ordinary players submit arbitrary content for publication, set their own reward values, or send arbitrary text to the speech service.

Published versions are immutable. Editing produces a new version. A run uses its pinned versions so an existing question cannot change its answer midway through the three attempts.

Import and AI-assisted preparation are content sources, not automatically requirements for complex admin integrations. Propose phased support without removing them from the broader content workflow. Do not invent parent reporting or a general user-management console.

When a critical content error is discovered, the admin must be able to prevent future selection. Existing-run handling must be deliberate and preserve progress; do not silently replace a saved activity or charge it as a failed answer. Claude should distinguish ordinary version retirement from exceptional invalid-content recovery.

PHONICS TEXT-TO-SPEECH MICROSERVICE

This is an explicit user requirement:
A visible Play button calls a microservice/API endpoint, which invokes a dedicated Python text-to-speech Lambda and delivers audio to the browser.

Use Amazon Polly as the proposed synthesiser. AWS documents British English neural voices and London regional support [R1]. Select the exact en-GB voice through a listening check, not by assuming one voice is automatically suitable for isolated phonics.

Proposed online flow:

The child selects Play.

The frontend sends an authenticated request identifying the run, activity, published content version and audio variant.

API Gateway invokes the dedicated TTS Lambda.

Lambda verifies ownership/access and resolves the approved speech definition.

Lambda checks a versioned private audio cache.

On a cache miss, Lambda calls Polly SynthesizeSpeech and stores the generated MP3 in private S3.

Lambda returns audio metadata and a short-lived signed download URL.

The browser downloads the audio bytes and plays them, retaining a local copy for appropriate replay/offline use.

SynthesizeSpeech accepts text or SSML and produces audio bytes [R2]. S3 presigned URLs provide time-limited download access; their usable lifetime is also bounded by the signing credentials [R5]. The returned URL is a temporary delivery mechanism, not the persistent offline cache.

The API route and dedicated Lambda constitute the microservice. Do not introduce a forwarding Lambda that merely calls another Lambda, Kubernetes, containers or a message broker without a demonstrated need.

Normal online Play requests reach the service even when generated audio already exists; the Lambda may reuse its cache rather than regenerate speech. Debounce overlapping clicks and expose Play, Loading, Stop/Replay and Retry states. A repeated audio play is not an answer attempt and grants no reward.

API input must identify approved content. The player endpoint is not an unrestricted text/SSML synthesiser. The operator's Preview audio route is separately authorised and validates text length, supported tags and allowed voice/engine settings. Lambda uses its execution role; never provide AWS service credentials to the browser.

Audio cache identity must include canonical approved text/SSML, locale, voice, engine, output settings and content/generation version. Store immutable objects and retain the versions required by active runs. Account names and DOB are never part of the audio text or cache key.

Phonics quality:

A letter name and a phoneme are different intended outputs.

Whole-word instructions can use reviewed text; sound examples may require reviewed SSML pronunciation.

Polly supports explicit phoneme pronunciation using IPA or X-SAMPA; support varies by engine [R3, R4].

Neural is the initial engine proposal for this feature.

Require an admin Preview audio control through the same service.

Listen to representative isolated sounds, digraphs, blends and words before publication.

Avoid an unintended extra vowel or misleading letter-name pronunciation.

A syntactically valid synthesis is not proof of a correct educational sound.

If a sound cannot be rendered adequately, keep that activity unpublished until corrected. Do not silently switch to browser speech synthesis or substitute a different sound.

Browser failure handling:

A playback/synthesis/network failure must not consume an answer attempt.

Do not reveal an audio-dependent question as ready when the necessary clip is unavailable.

Stop overlapping playback; focus and keyboard activation must work.

Configure audio download CORS for the approved player/admin origins when fetching bytes into the local cache.

Keep signed URLs and sensitive request data out of logs.

Prototype time-to-audio and cached replay latency; label targets as measured engineering goals rather than service guarantees.

SAVES, CHECKPOINTS AND TERMINAL OUTCOMES

Store authentication state, player profile, saved run, active session and learning attempts as separate concepts.

At a minimum, a run checkpoint captures:

Owner, run ID and planet.

Run status and current/next wave.

Highest completed wave in this run.

Rules, wave, map, activity-pack and asset versions.

Selected age band and controlled random seeds where used.

Colony health/shield.

Credits.

Available astronaut classes.

Placements, upgrade levels and target priorities.

Temporary powers and relevant cooldown state.

Current activity identifiers, attempts and resolution/reward state.

Save revision and active-session generation.

Checkpoint completed waves and preparation state. Persist question attempts as they happen. Capture an internally consistent wave-start snapshot when Ready is pressed.

Save and exit:

In preparation: retain the current preparation/activity state.

During combat: end the local attempt and resume later from that wave's starting checkpoint.

Clearly communicate that the current wave will restart.

Roll back partial-wave kills, credit earnings, purchases, sales, damage and ability use together.

Do not preserve earnings from the abandoned partial wave while respawning its aliens.

Preserve already-completed preparation activities and their rewards once.

A client-side crash can lose the current wave, as agreed. Locally checkpointed progress remains pending until synchronised. Cloud saves are available on another device only after confirmation by the backend.

A recorded defeat is terminal. It closes the run and records permanent progress. It must not be treated as an interruption that the Continue button revives. A fresh run has fresh starting funds and unlocks.

Campaign completion, optional endless continuation, save/suspend, abandon and defeat require distinct states or equivalent explicit transitions. Record wave-50 completion before entering endless mode.

Suggested state concepts for Claude to refine:
PREPARING, ACTIVITY_PENDING, READY, IN_WAVE, PAUSED, SUSPENDED, DEFEATED, CAMPAIGN_COMPLETE, ENDLESS and ABANDONED.
It may use a simpler representation if the same transitions remain unambiguous.

Idempotency:

Every answer submission has a stable request/attempt identity.

Every activity reward, milestone and run-finalisation event has a stable identity.

Duplicate HTTP delivery, double-clicks and reconnect batches produce one logical effect.

Use conditional writes/transactions or an equivalent atomic design for attempt resolution, reward grant and summary updates.

Never rely on DynamoDB TTL deletion timing to enforce a live lock or attempt limit.

OFFLINE CONTINUATION AND CONCURRENT PLAY

Accepted offline scope: continue a previously authenticated, prepared finite campaign through a connection interruption and synchronise later.

A run needs a versioned content pack containing its wave/rules data, selected learning activities, local answer-checking data, game assets and necessary audio. Prepare the finite pack while online. Fetch/generate speech through the same TTS service and cache AUDIO BYTES, not only expiring URLs.

Show an offline-readiness state. A run can be declared ready for whole-campaign offline continuation only when all required content is available locally. If the connection fails before preparation completes, stop at a clear missing-content boundary rather than claiming the promise was met.

While offline:

Existing prepared gameplay and activities can continue.

Play reuses audio previously retrieved from the service.

Queue attempts, checkpoints and milestones locally with stable IDs.

Display “Saved on this device — waiting to sync” rather than claiming a cloud save.

A missing clip is an availability problem, not a wrong answer.

New sign-ins and creation of a new run may require connectivity.

Never invoke or claim to invoke a remote Lambda without connectivity.

Offline continuation applies to an already-loaded application. An offline cold start or reload of the complete web app is not a promised installable-PWA feature. Browser-local saved progress must remain recoverable when the application can be reopened, subject to browser storage being available. Define a clear response if local persistence is unavailable or full.

Endless mode cannot preload an infinite supply of new content. Use a finite prepared buffer and pause between waves for reconnection when that buffer is exhausted. The 50-wave finite campaign is the initial whole-run offline guarantee. Do not silently repeat activities for extra rewards or invent unlimited offline synthesis.

Authentication may expire while offline. Do not discard local progress. Reauthenticate before uploading and verify the same account owns the pending data.

Several saved runs may exist, but only one active account-wide game is accepted:

Use a lease/exclusivity record or equivalent.

Block another game while the active session is valid.

Renew online and recover deliberately after a crash or stale session.

Use a monotonically changing generation/fencing token plus save revision.

Conditional saves prevent an older browser overwriting newer progress.

After a legitimate takeover, an older device's pending branch cannot be silently merged or committed.

Explain the conflict and retain the local pending branch for inspection/recovery rather than claiming success.

An already-offline browser cannot be forced to stop by a server it cannot reach. The enforceable guarantee is one accepted authoritative writer, with explicit stale-session handling. State this limitation honestly; do not promise strict physical exclusion across disconnected devices.

TRUST MODEL AND SECURITY BOUNDARIES

Use the family-level trust model agreed by the user:

Combat and animations run in the browser.

Offline activities can be checked locally.

The backend owns authenticated access, accepted checkpoints, recorded attempts, reward accounting and permanent progress.

Validate ownership, allowed versions, expected ordering, attempt counts, reward bounds and replay/duplicate submissions.

This is not proof that every browser-reported battle genuinely occurred.

Local answer data is inspectable by a determined browser user. Accept that trade-off for offline family play.

Do not add server-authoritative combat simulation, multiplayer servers or elaborate anti-cheat infrastructure.

Regardless of family use:

Derive ownership from the authenticated Cognito subject.

Authorise access to every requested run/profile; a supplied run ID is not permission.

Enforce admin privilege at the backend.

Validate schemas, numeric ranges, content IDs, request sizes and allowed transitions.

Rate-limit expensive operations such as synthesis and use least-privilege execution roles.

Use HTTPS and private S3 origins/audio storage.

Do not place credentials, private DOB or privileged content-management capabilities in public assets.

Cognito public browser clients should use an appropriate authorisation-code/PKCE flow without an embedded client secret [R6]. API Gateway HTTP JWT authorisers validate JWTs and can require route scopes [R8]. The plan must use intended access tokens, correct issuer/audience settings and backend ownership/role checks. Do not copy an unrelated implicit-flow example simply because it appears in a documentation page.

APPLICATION AND AWS ARCHITECTURE

Confirmed stack:

React and TypeScript for the browser application.

Phaser for the 2D battlefield.

Python for Lambda functions.

DynamoDB for application records, content records and saved state.

Amazon Cognito for authentication.

Terraform for infrastructure.

GitHub Actions for deployment.

Production application resources in the existing London workload account.

Existing bootstrap, state backend, OIDC role and repository/pipeline examples.

Proposed architecture:

Player static build: private S3 origin and CloudFront.

Admin static build: private S3 origin and CloudFront, with proper admin API authorisation.

API Gateway HTTP API for authenticated application endpoints.

A small number of cohesive Python Lambda boundaries for player/run operations, content administration and dedicated speech.

DynamoDB for logical records/access patterns described below.

Polly plus private S3 generated-audio storage.

CloudWatch logs, API/Lambda error metrics and alerts.

Daily DynamoDB backup schedule with seven daily recovery points.

CloudFront OAC uses a regular S3 bucket origin rather than the S3 website endpoint [R11]. CloudFront viewer ACM certificates must be requested/imported in us-east-1, even though application data and Lambda run in London [R12]. Use the existing provider conventions to handle required service regions.

DNS:
The user already has jackgl.com in their DNS account, has used their lookup approach elsewhere and will handle that integration. Reuse the repository's established lookup/provider/DNS pattern. List the required hostnames and certificate validation inputs. Do not rebuild DNS architecture or reopen the resolved account-access discussion. All application resources remain in the stated workload account; the existing DNS account is an integration, not a new application environment.

React owns routing, authentication, dashboards, accessible learning panels and overlays. Phaser owns the game loop, rendering, input mapping and simulation. Define a clear typed bridge/events between them. Do not drive every moving alien or projectile through React component rerenders. Battle operations must not send every frame or projectile event to Lambda/DynamoDB.

Prefer simple serverless boundaries. Do not add a VPC/NAT, containers, Kubernetes, Redis, WebSockets, GraphQL, queue or orchestration engine unless a concrete requirement justifies it.

DYNAMODB LOGICAL RECORDS AND ACCESS PATTERNS

Do not choose single-table or multi-table design before stating access patterns. Claude must propose physical keys, indexes and transactional boundaries with reasons.

Logical record families:

Player profile and permanent progress.

Saved run metadata and versioned checkpoints.

Current active-session lease/generation.

Activity assignments, attempts and reward markers.

Subject/topic learning summaries.

Planet, wave and rules/content versions.

Educational activity definitions and publication metadata.

Idempotency/reconciliation records.

Audio metadata where needed; actual audio belongs in S3.

Core access patterns:

Load the authenticated player's profile and dashboard.

List that player's resumable runs and recent results, with pagination.

Load a run owned by that player.

Claim/renew/release an account-wide active session conditionally.

Save a checkpoint against an expected revision and active generation.

Resolve an activity attempt and grant a reward at most once.

Apply an ordered offline batch without reapplying accepted operations.

Update/read best completed waves, badges and planet eligibility.

Read an immutable content pack and its pinned definitions.

Select eligible published activities by subject, age band and version.

List/filter content for an authorised admin.

Retire a definition from future selection without deleting an old version.

Perform distinct reset/delete operations across relevant owned records.

Use bounded checkpoint records and a separate controlled history if needed. Do not grow one DynamoDB item indefinitely as an endless run accumulates events. Limit or compact operational event retention while preserving summary semantics and required idempotency windows.

Persistent progress, summaries and resumable runs remain until a user reset/deletion or an explicitly specified retention rule. Use expiry for temporary coordination records where useful; validate logical expiry in the application. Ordinary record retention is different from the seven-day backup-retention proposal.

Old rules, question versions and associated assets must remain available for active saves. A changed rules file alone does not maintain compatibility if the new runtime cannot execute it. Claude must specify compatible simulation versions or another concrete strategy, with no silent mid-run rebalance.

API CONTRACTS TO PLAN

Route names below are proposals. Claude should return actual request/response contracts, authorisation rules, errors, pagination and idempotency semantics without implementing handlers.

Player/profile:

Get own profile/dashboard.

Create/complete own profile after Cognito signup.

Update permitted profile preferences.

Perform separate reset operations.

List available planets/modes.

Runs:

List, create and read own runs.

Acquire, renew and release the active play session.

Save/exit a run with expected revision.

Submit activity attempts.

Record wave completion, defeat and campaign completion.

Reconcile queued offline events/checkpoints.

Retrieve a versioned content pack/offline readiness manifest.

Speech:

Request speech for an authorised activity/version/audio variant.

Return audio metadata and signed delivery URL.

Admin-only preview of draft speech definitions.

Administration:

List and read activity definitions.

Create/edit drafts.

Validate, preview, publish and retire versions.

Important error categories:

Unauthenticated / token expired.

Not authorised / wrong owner.

Another active session.

Stale generation or save revision.

Already processed operation, returning its original logical result.

Activity resolved or attempts exhausted.

Unsupported/retired/missing content version.

Offline pack incomplete.

Speech unavailable or synthesis failed.

Request throttled or invalid.

The API must not accept a client-provided final credit balance as unquestionable truth. The plan should identify which validated events/checkpoint checks derive or constrain balances within the chosen family trust model.

TERRAFORM, REPOSITORY AND RELEASE WORKFLOW

The repository already exists. Bootstrap, Terraform backend, GitHub OIDC role, domain-related resources and editable workflow examples are already present according to the user. The author of this brief has not inspected that repository; Claude must verify its actual contents before planning changes.

First planning activity:

Read repository instructions and inspect the current tree.

Locate the bootstrap module, backend configuration, provider aliases and environment conventions.

Inspect existing OIDC role assumptions and workflow examples.

Identify actual build tooling, dependency files, output conventions and deployment inputs.

Return a short evidence table of what exists, what can be reused and what must be added.

Never invent existing paths, account IDs, roles, module names or test results.

Reuse the bootstrap and state backend. Do not create a replacement bootstrap. Deploy production only now while preserving existing support for additional environments.

GitHub OIDC is the established deployment authentication mechanism; it can provide AWS access without long-lived GitHub AWS credentials [R13]. Follow the existing trust/subject configuration and verify it against the real repository rather than pasting an old generic example.

The deployment is one manually triggered, coordinated production release. Plan frontend builds, Lambda packaging, Terraform changes and static artifact publication as a coherent sequence. “Rebuild S3 dist” means build and upload static artifacts, not destroy/recreate the bucket.

Expected release stages:

Check source, type/lint rules and relevant dependencies.

Run meaningful frontend/game/backend tests and Terraform validation.

Build immutable frontend/admin assets and Lambda artifacts.

Create a Terraform plan using the intended versioned artifacts.

Review the plan within the established manual production workflow.

Apply infrastructure/application changes in the correct dependency order.

Publish static assets with a safe entry-point update order.

Run focused smoke checks and record the release manifest.

Claude must decide whether existing Terraform manages Lambda artifacts directly or the workflow updates them, and establish a single source of ownership. Avoid two tools fighting over the same deployed version.

Protect persistent data and identities during routine releases. Terraform must not recreate populated DynamoDB tables, Cognito pools or S3 stores as a normal deployment step. Content seeding must not overwrite operator-authored questions.

Keep prior release artifacts and pinned rules/assets required by active runs. Rollback restores compatible application versions; it must not automatically revert player data to a backup. Describe any data compatibility/migration path before proposing a destructive change.

Tests should protect behaviour, particularly ownership, saving, duplicate rewards and phonics delivery. Do not create a large suite of tests that merely mirror implementation details.

OPERATIONS, BACKUP AND PERFORMANCE

Required operations:

CloudWatch logs with useful request/run correlation and no private profile or credential leakage.

API/Lambda error visibility and API-error alerts.

A configurable notification destination, reusing existing monitoring where present.

Error handling for failed saves, synthesis failures and deployment problems.

One daily backup of each application DynamoDB table.

Seven daily recovery points, as the accepted retention proposal.

A documented restore procedure and a focused restore verification.

An AWS Backup plan is a suitable managed scheduling/lifecycle proposal [R15]. The implementation must verify DynamoDB selection, permissions and supported settings. Operational checkpointing and daily disaster-recovery backups are different: normal interruption may lose the current wave, while recovery from the latest daily backup can lose changes since that backup. Do not describe the daily backup as a guarantee of wave-level disaster recovery.

The user does not want further budget discovery. Keep the architecture proportionate to two initial users and avoid unnecessary always-on infrastructure. If Claude includes costs, identify assumptions and verify current prices; do not promise an exact bill.

Performance proposals to measure:

Aim for smooth 60 fps combat on a representative laptop, with an explicitly measured minimum under the busiest authored wave.

Define an enemy/projectile/particle budget and cap or pool effects.

Ensure combat speed and damage depend on simulation time, not render frame count.

Keep React rerender frequency independent of the per-frame Phaser simulation.

Lazy-load assets by planet or mode where practical.

Avoid unnecessary API calls in the combat loop.

Measure initial load, cached load, time-to-audio, save duration and reconnect behaviour.

Test the actual supported browser matrix; do not claim support for every laptop/browser simply because the application is web-based.

No exact frame rate or latency has been validated. Claude should set realistic measurable targets during the prototype and report limits honestly.

ART AND AUDIO ASSET PLAN

Art direction:

Colourful cartoon space theme, angled 2D.

Friendly astronaut silhouettes and readable class equipment.

Mischievous aliens with distinct shapes and motion.

One coherent lighting/perspective style across characters, pads, route and colony.

Aliens pop into stars.

Simple combat effects and phonics audio; no music or spoken character dialogue.

Assets will be generated when needed, with the assistant helping. Do not block the initial playable slice on finished art. Use clearly labelled placeholders, then replace them through a stable asset manifest.

Claude must produce an asset inventory covering:

Planet backdrop, colony, path segments, pads and decorations.

Six astronaut classes, each with three visually distinct upgrade levels.

Idle/attack/upgrade effects appropriate to each class.

Every alien silhouette, movement state and defeat effect.

Carrier and descendant assets.

Boss appearances and phase indicators.

Projectiles, slow effects, shields, beacon ranges and meteor powers.

Avatar choices, subject icons, activity objects and badges.

Small combat sound set.

Generated phonics clips and the content metadata used to reproduce them.

Specify dimensions, transparent/background requirements, animation frames, pivots and naming conventions before final asset creation. Generated bitmap art must not carry vital readable question text; render educational text as accessible UI.

Suggested character-card text is optional and unvoiced:

Nova: “Ready for launch!”

Pip: “Let's cool things down.”

Juno: “I've got a bright idea.”

Mira: “The colony is in good hands.”

Orion: “I can see them coming.”

Sol: “Better together!”

WORKED GAMEPLAY AND LEARNING EXAMPLES

These examples illustrate required behaviour. They are not validated balance or finished educational content.

Example A: same wave, different age

Both children enter the same planet with the same starting allowance and astronaut availability.

They complete the same wave and face the same next-wave enemies.

Age 5 might count a pictured group of eight stars and select the number.

Age 7 might solve a suitable number-bond or addition activity, such as selecting the missing number in 14 + ? = 20.

A successful activity grants the same configured credit reward for each child.

Both receive at most three attempts, with no credit/colony penalty for failure.

Their summaries record the relevant subject/topic outcome; combat difficulty does not adapt.

Example B: phonics Play

A pinned phonics activity asks the child to identify a sound among several displayed graphemes.

Play sends the activity/audio identifier to the authenticated speech endpoint.

The dedicated Lambda resolves reviewed speech content, synthesises it with Polly if uncached and returns audio delivery metadata.

The browser plays the clip.

A replay does not use an answer attempt.

A network/synthesis failure shows Retry and does not become an incorrect answer.

Offline playback works only from audio bytes prepared earlier through the service.

Example C: wrong answers and refresh

The player submits two different incorrect attempts for one activity.

The page refreshes.

The same activity returns with one attempt remaining.

A third incorrect answer completes it with no reward.

Ready permits the next wave.

Repeating an HTTP request for an already recorded answer does not consume another attempt.

Example D: meteor before the first boss

After wave 9, the normal activity appears.

Once resolved, the optional meteor challenge offers a temporary boss-helping power.

Normal and meteor activities have separate IDs and reward markers.

The player can decline the meteor and still fight the boss.

Wave 10 starts only when Ready is pressed.

Example E: save during combat

At wave start the snapshot contains colony health, 120 credits and two deployed astronauts. The numeric values are illustrative.

During the wave the player earns credits, buys an upgrade and uses a power.

They choose Save and exit halfway through the wave.

On resume, wave-start credits, placements, upgrades, health and power inventory are restored together.

The abandoned partial-wave earnings are absent.

The previously completed learning reward remains included once in the snapshot.

Example F: defeat and another run

The player clears wave 16 and loses during wave 17.

The run becomes terminal with a best completed wave of 16.

Previously earned badges, planet unlocks and learning summaries remain.

A new run starts with starting funds and starting class availability.

Refreshing the defeat page cannot resurrect the old run as a normal saved game.

Example G: campaign completion and endless mode

Wave 50 is cleared and the campaign badge is committed.

The player elects to continue.

Later defeat in endless mode retains that badge and the highest completed wave.

If offline, endless continuation stops at a preparation boundary when the downloaded activity/audio buffer is exhausted.

Claude's plan must add a detailed sample early run, with actual proposed credit arithmetic, purchases and upgrades, plus example age-appropriate activities for both ages. Clearly label proposed balance values.

ACCEPTANCE CRITERIA

Identity and ownership
AC-01: A player can register, reach a confirmed sign-in state, create a profile and start a valid run without a parent account.
AC-02: Password recovery has a documented administrator path that works with the chosen no-required-email model.
AC-03: Another player's profile/run IDs cannot be read or modified by a normal account.
AC-04: A normal account cannot access draft content, publish questions or invoke privileged admin speech preview.
AC-05: Logging out and switching accounts does not display or submit the previous player's local private data.
AC-06: New runs use DOB-derived eligible content; an existing run retains its pinned age/content configuration.

Combat and progression
AC-07: Astronauts can be placed only on valid pads, stay stationary and cannot be damaged.
AC-08: All six class roles and three upgrade levels have observable effects and clear previews.
AC-09: Purchases/upgrades during combat deduct the correct credits and cannot create negative balances through ordinary UI races.
AC-10: Carrier/splitter descendants resolve before a wave is considered complete; offspring and rewards do not duplicate.
AC-11: Fifty authored waves include bosses at 10/20/30/40/50 and maintain the fixed route.
AC-12: Completion offers endless continuation and retains the campaign badge after a later defeat.
AC-13: Combat, starting funds and reward opportunities match across ages.
AC-14: Failure resets run resources while retaining agreed permanent progress.

Learning and speech
AC-15: One untimed normal activity appears per interval, with separate optional untimed meteor activity IDs before bosses; waiting and audio playback do not consume attempts or reduce rewards.
AC-16: A normal activity has three attempts; success grants one reward; three failures grant none and allow play to continue.
AC-17: Refresh after two wrong attempts leaves one attempt and the same question.
AC-18: Duplicate/delayed submissions produce one logical result, reward and summary update.
AC-19: Phonics Play calls the authenticated TTS API and dedicated Lambda while online; browser speech synthesis is not used as a replacement.
AC-20: The TTS service resolves approved content and cannot be used as an arbitrary public text/SSML endpoint.
AC-21: Admin audio preview validates representative UK English sounds before publication; incorrect generated sounds remain unpublished.
AC-22: Speech failure, Replay and Loading do not consume answer attempts or grant credits.
AC-23: Published content edits create versions; active saves retain their original definitions/audio.

Saving and disconnection
AC-24: Save and exit during a wave restores a consistent wave-start state.
AC-25: Partial-wave combat rewards do not survive rewind while its enemies respawn.
AC-26: Already-completed learning rewards survive resume once.
AC-27: Defeat is terminal across refresh and reconnect.
AC-28: Several saved runs exist independently, but a second online active game is blocked while the first session is valid.
AC-29: A stale/offline session cannot overwrite a newer accepted generation.
AC-30: A prepared finite campaign continues offline with cached activities and audio.
AC-31: The UI distinguishes cloud-confirmed saves, local pending saves and failures.
AC-32: Reconnection applies queued operations in a coherent order without duplicate rewards.
AC-33: Expired authentication requires reauthentication before upload without discarding pending progress.
AC-34: Offline endless content exhaustion pauses at a clear boundary rather than inventing unavailable audio.
AC-35: Existing saves resume correctly after a compatible application/content release.

Deployment and usability
AC-36: Manual deployment uses the existing bootstrap, OIDC and state setup; persistent data survives a normal release.
AC-37: Release checks cover frontend/backend behaviour and Terraform validation/plan review.
AC-38: Previous compatible application artifacts can be restored without automatically rolling back player data.
AC-39: Daily DynamoDB backups with the agreed retention exist and a restore procedure is verified.
AC-40: A real API/Lambda failure is visible through the configured operational monitoring.
AC-41: Essential player controls and each learning interaction work with keyboard and mouse.
AC-42: Representative busiest waves meet the documented measured performance target.
AC-43: Children can start a run, deploy/upgrade, complete an activity and return to a save without a forced gameplay tutorial.

These are behaviour-based release criteria. The planning task must propose meaningful test coverage; it must not claim they have already passed.

SUGGESTED IMPLEMENTATION MILESTONES

Claude may change order after inspecting the repository, while preserving dependencies and scope.

Milestone 0 — Repository audit and technical spikes
Inspect existing infrastructure/workflows. Confirm authentication setup, React/Phaser integration and representative phonics generation. Resolve poor pronunciation before scaling the content bank. Produce architecture decisions and a requirement trace.

Milestone 1 — First end-to-end playable slice
Use the existing production deployment pattern to support one account/profile, one map, one astronaut, a small wave set, one activity, one TTS clip and a reliable checkpoint. Use placeholder art. This is a milestone, not the final scope.

Milestone 2 — Complete core game systems
Add six classes, upgrades, selling, targeting, powers, alien catalogue, carrier descendants, bosses and explicit run lifecycle.

Milestone 3 — Educational content and administration
Build the age-banked content model, agreed interaction types, automatic subject rotation, binary summaries, immutable publication and audio review workflow.

Milestone 4 — Full campaign and progression
Author the 50-wave schedule, meteor challenges, badge rules, future-planet eligibility, short challenges and endless continuation. Establish numerical balance through playtests.

Milestone 5 — Robust persistence and offline continuation
Complete local packs/audio caching, attempted-answer persistence, reconnect idempotency, session exclusivity and stale-writer handling. Exercise refresh/defeat and concurrent-device cases.

Milestone 6 — Art, performance and release confidence
Replace placeholders with consistent generated assets, measure frame rate and audio latency, complete keyboard coverage, verify backup/restore and compatible rollback, and document what has actually been built.

Documentation develops alongside implementation: decisions, local/build instructions, API/data contracts, deployment and recovery notes. The plan should not require a large documentation phase before any playable slice.

REQUIRED OUTPUT FROM CLAUDE

The Claude planning response must contain:

Repository findings with real file/path evidence.

A concise confirmed-requirements summary and an explicit assumptions/engineering-decisions table.

Product journeys and screens.

A complete game-design proposal: named roster, three upgrade levels, balance tables, 50-wave schedule, bosses, meteor powers, endless rules and badge criteria.

Learning/content schemas and representative activities for ages 5 and 7, with age-6 coverage included in the bank design.

A dedicated TTS design, phonics quality gate and offline-audio behaviour.

Architecture and trust-boundary diagrams, including the existing DNS integration.

API contracts, DynamoDB access patterns/keys/indexes and atomic update boundaries.

Run/activity/session state machines and recovery behaviour.

Terraform module/environment integration and the existing manual release workflow.

Test plan and acceptance mapping.

A phased backlog with dependencies, concrete completion criteria, affected areas/files based on the real repository and relative effort.

A proposed first task small enough for the user to implement, explained as a colleague/mentor.

Remaining genuine blockers only; make reasonable labelled choices for routine details.

Do not re-ask the original discovery questionnaire. Do not override explicit exclusions. Do not start coding or deploy. Explain trade-offs in plain language, and distinguish verified repository facts from proposed designs.

SOURCE NOTES

The user's answers and subsequent acceptance are the authority for product requirements. The sources below support technical capability claims and curriculum reference choices. Architecture choices and character/gameplay proposals are design recommendations, not claims that these documents prescribe this particular application. Sources were checked on 14 November 2026; Claude should verify versions/support during implementation planning.

[R1] Amazon Polly — Neural voices
https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html

[R2] Amazon Polly — SynthesizeSpeech API
https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html

[R3] Amazon Polly — Using phonetic pronunciation
https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html

[R4] Amazon Polly — Supported SSML tags
https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html

[R5] Amazon S3 — Download and upload objects with presigned URLs
https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html

[R6] Amazon Cognito — Application-specific settings with app clients
https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html

[R7] Amazon Cognito — Passwords, account recovery and password policies
https://docs.aws.amazon.com/cognito/latest/developerguide/managing-users-passwords.html

[R8] API Gateway — Control access to HTTP APIs with JWT authorisers
https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html

[R9] Department for Education — National curriculum in England: mathematics programmes of study
https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study

[R10] Department for Education — National curriculum in England: English programmes of study
https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study/national-curriculum-in-england-english-programmes-of-study

[R11] CloudFront — Restrict access to an Amazon S3 origin
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html

[R12] CloudFront — Requirements for using SSL/TLS certificates
https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html

[R13] GitHub — Configuring OpenID Connect in Amazon Web Services
https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws

[R14] Phaser — Project templates, including React
https://www.phaser.io/oss/docs/phaser/getting-started/project-templates

[R15] AWS Backup — Create a backup plan
https://docs.aws.amazon.com/aws-backup/latest/devguide/creating-a-backup-plan.html

END OF SPECIFICATION



END APPROVED SPECIFICATION

Final instruction: produce the complete planning response described above, grounded in the existing repository where available. Preserve the fixed requirements, explain decisions, and stop before writing or deploying the application.