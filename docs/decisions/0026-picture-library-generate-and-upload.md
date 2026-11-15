# 0026. Picture library: generate with Claude on Bedrock, and upload
Status: Proposed · Date: 2026-11-15

Context: activity pictures came only from the hand-drawn SVGs in `art/svg/`, rendered at build time and shipped by a release
([art/STYLE.md](../../art/STYLE.md)). The owner wants to add pictures from the admin: upload their own, and generate new ones in
the house style **[CONFIRMED by owner, 2026-11-15]**.

Decision: a new **Gate P** (Phases 42a, 42b) between H1 and I:
- **42a, picture library and upload.** Admin uploads PNG or JPEG only (no SVG: it can carry script), size-capped, through a
  presigned PUT to a private `uploads/` prefix. A Lambda checks the type by magic bytes, re-encodes to PNG (strips metadata),
  caps dimensions and stores the result under a content-addressed key. Pictures have a draft → approved lifecycle like speech.
  Only approved pictures appear in the editor's picker and are served to players, as PNG, from the site origin.
- **42b, generate.** "Generate picture" sends the operator's description to **Claude Opus 5.5 on Amazon Bedrock in eu-west-2**
  (`anthropic.claude-opus-5-5`, listed in the region **[VERIFIED 2026-11-15, `aws bedrock list-foundation-models`]**). The Lambda
  calls it with its IAM role, so there is no API key. The system prompt is fixed: STYLE.md plus a few house SVGs, cached.
  Claude returns one SVG, which the server sanitises with an element and attribute allow-list (no script, `foreignObject`,
  external references or event handlers) and renders to PNG. Children never receive SVG. "Try again" and Approve or Discard,
  as for speech takes. A daily generation cap and a budget alarm limit cost.

Alternatives: upload only (the owner wants generation); an image-generation model (does not produce the house style's vector
look, and is a second vendor); the first-party Claude API (needs a stored API key; Bedrock keeps IAM, billing and region in AWS);
pictures drawn by Claude in chat and released (stays available, no admin feature).

Consequences: new IAM `bedrock:InvokeModel` on that one model for one function; the owner enables Anthropic model access in the
Bedrock console once; a new S3 prefix and CSP `img-src` unchanged (same origin). Estimated cost per picture 5–15p **[ASSUMPTION:
about 8k cached input and 5k output tokens at Opus 5.5 list prices]**. Results resemble the style but vary, so approval is
mandatory. Content gates (I) can use library pictures. Supersedes "art only from the repo" for activity pictures only;
game art (towers, aliens, UI) stays repo-only.

Evidence: owner instruction 2026-11-15 (in chat); Bedrock model listing, eu-west-2, 2026-11-15.
