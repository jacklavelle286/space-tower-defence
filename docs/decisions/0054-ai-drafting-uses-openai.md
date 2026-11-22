# 0054. AI question drafting in the console uses OpenAI, as picture generation does
Status: Proposed · Date: 2026-11-22

Context: the owner's console will draft questions with AI [CONFIRMED by owner 2026-11-22, PD-24; design in
[08 §6](../platform/08-learning-content.md#6-ai-assisted-authoring-console-only)], and AI stays in the owner's backend
(PD-11). The family edition already draws pictures with OpenAI through `picture_gen`: Europe data residency, the owner's
key in a Secrets Manager secret that Terraform creates empty ([0031](0031-gate-p-picture-library-and-generation.md),
[OpenAI key runbook](../runbooks/openai-key.md)). LRN-Q8 asked which provider drafts questions: that integration, or
Claude on Amazon Bedrock. The owner, 2026-11-22, after first naming Bedrock: "we have an openai api key already right?
and this works well for the asset generation so lets just use that?" [CONFIRMED by owner 2026-11-22, LRN-Q8].

Decision:
- Question drafting uses OpenAI, built like `picture_gen`: a queued job, a worker function with its own secret, daily
  and monthly caps, a kill switch and a cost log per job (08 §6). The model is a setting, chosen when PS9 builds it.
- The platform has its own OpenAI project, with Europe data residency and a monthly budget, and its own key in
  sca-prod's secret, stored by the owner (OWN-16). The family edition's key stays in its own account; neither product
  reads the other's.
- The provider receives content only: the topic and its curriculum statement, the activity kind's schema, a style guide
  and a few published examples. Never school or pupil data. Every draft lands as DRAFT and is reviewed before
  publishing (LRN-17, LRN-18). The console never names the vendor or the model.

Alternatives: Claude on Amazon Bedrock (traffic stays inside AWS and no outside key, but a second integration to build
and run, and its model availability in `eu-west-2` or an EU inference profile is unverified); sharing the family
edition's key across accounts (ties the two products' caps and spending together, and needs cross-account secret
access).

Consequences: one AI supplier for the platform's pictures and questions, named once in 11's supplier list and the DPIA;
it receives no school data, so it is a supplier, not a sub-processor. AWS Budgets does not see OpenAI's spend: the
project budget and the caps are the controls. Dev has no key unless the owner adds one, so drafting there would answer
"not set up"; content is authored in prod's console (PQ-5). Open: the model and the caps' values, set in PS9.

Evidence: LRN-Q8 ([08 §11](../platform/08-learning-content.md#11-decisions-for-the-owner),
[register §8](../platform/14-decision-register.md#8-learning-content-08-11)); PD-11, PD-24
([README §3.1](../platform/README.md#31-confirmed-by-the-owner)); ADR-0031; the OpenAI key runbook; OWN-16
([13 §4](../platform/13-delivery-plan.md#4-owner-actions-epic-e12)).
