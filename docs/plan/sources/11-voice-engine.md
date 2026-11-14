# 11 — Voice engine: can Amazon Nova 2 Sonic replace Polly for phonics clips?

Date: 2026-11-14. This is a synthesis of four researcher reports. I re-fetched the decisive official pages myself.

Labels:
- **VERIFIED**: I re-read it today in an official AWS source, which is quoted.
- **VERIFIED (researcher)**: an official source quoted by a researcher that I did not re-fetch.
- **UNVERIFIED**: inference or a secondary source.
- **PROPOSAL**: a design suggestion.

Context: a `tts` Lambda (Python 3.14, eu-west-2) renders a clip only when an operator previews it. The operator approves it, and the exact bytes are frozen in S3 under a content-addressed key and replayed forever. No live synthesis ever happens for children. Prior Polly notes: `06-polly-tts.md` (same folder).

---

## 1. Answer in one paragraph

**No, Nova 2 Sonic (or Nova 2.5 Sonic) should not replace Polly here.**
- It is a conversational speech-to-speech model that *answers* text rather than reading it.
- It has no SSML or `<phoneme>`, and AWS says rate and accent cannot be controlled.
- It is not offered on Bedrock in London, and it has one British voice (`amy`, female).
- From Python it needs an SDK that AWS labels experimental and "Do not use it for production workloads".

The "really good voice" the owner is after exists **inside Polly, in London**. The **Generative engine** has en-GB **Amy** and **Brian**, and its model was upgraded on 20 Oct 2026. It is the same boto3 `SynthesizeSpeech` call with `Engine="generative"`.

Generative's `<phoneme>` support is only "Partial", so **isolated phonemes stay on Polly Neural + `<phoneme>`**, with human recordings as the fallback. A Milestone-0 listening bake-off decides the final per-kind choice.

---

## 2. Cross-check of the four reports (where they disagreed, and the verdict)

| Point | Reports said | Verdict after re-fetching |
|---|---|---|
| Is Sonic a TTS engine? | All four: no | **VERIFIED.** Service card: the core works by "using these transcriptions to reason and generate a text response that answers the user query, and then synthesize speech with that content". Runtime step 3: "the input is processed and a text response is generated". https://docs.aws.amazon.com/ai/responsible-ai/nova-2-sonic/overview.html |
| Text input semantics | User turn the model responds to | **VERIFIED.** Cross-modal page: text is sent with `"role": "USER"`. The listed uses are typed chat, DTMF digits, and "'Model-start-first' use case: A text message can be sent immediately after the session starts to prompt the model to begin speaking." It also states "Continuous streaming required … otherwise standard session timeouts will be applied and the connection will be terminated." No read-aloud mode is documented. https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-cross-modal.html |
| Pronunciation control | None | **VERIFIED.** "Currently, Amazon Nova 2 Sonic does not allow developers to modify the pitch, tenor, accent, and speaking rate of the generated speech responses." No SSML or phoneme input is documented anywhere I looked. (The absence is VERIFIED only as "not found in the docs".) |
| Region / eu-west-2 | Not in London; nearest is Stockholm | **VERIFIED.** Model card regional table for `amazon.nova-2-sonic-v1:0`: In-Region only in us-east-1, us-west-2, **eu-north-1**, ap-northeast-1. Geo and Global are "Not supported". The Nova 2.5 Sonic card has the identical table. https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.html , https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-5-sonic.html |
| "Available in London" | One report: via Amazon Connect only | **VERIFIED.** Release notes, May 2026: "generally available in the US East (N. Virginia), US West (Oregon), Asia Pacific (Tokyo), and Europe (Stockholm) Regions. In addition, it is available through Amazon Connect in … Europe (London)". The London availability does not apply to the Bedrock API. https://docs.aws.amazon.com/nova/latest/nova2-userguide/release-notes.html |
| British voices | `amy` only, no male | **VERIFIED** from the voice table: "English (UK) \| en-GB \| amy \| -". **Conflict:** the service card claims "twenty-two expressive voices, including masculine-sounding and feminine-sounding voices in English (US, British, …)". The same card also says "eighteen expressive voices", and the table lists 16 IDs. Treat the table as authoritative and the card as inconsistent. https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html |
| Lifecycle | Nova 2 Sonic EOL soon | **VERIFIED.** "EOL no sooner than: Dec 2, 2026", "Legacy period: at least 6 months", Lifecycle "Active". Successor `amazon.nova-2-5-sonic` launched "Oct 5, 2026", "EOL no sooner than: Oct 5, 2027". |
| Python SDK | boto3 cannot; v4 SDK is experimental | **VERIFIED.** "Experimental: This documentation covers the AWS SDK for Python v4, which is experimental, non-GA software intended for evaluation and testing only. Do not use it for production workloads." Install with `pip install "aws-sdk-bedrock-runtime[awscrt]"`. "Bidirectional streaming requires the AWS Common Runtime (CRT) HTTP client". The client is async (`AsyncBedrockRuntimeClient`). https://docs.aws.amazon.com/sdk-for-python/v1/guide/bedrock-bidirectional-streaming.html . boto3 has no bidirectional method: VERIFIED (researcher), https://docs.aws.amazon.com/boto3/latest/reference/services/bedrock-runtime.html. Python >=3.12 and 3.14 classifier: VERIFIED (researcher, PyPI metadata). **Note:** the model card's sample says `pip install boto3`. That is generic boilerplate and contradicts the SDK pages. |
| IAM action | One report: `bedrock:InvokeModel`. Another: `bedrock:InvokeModelWithBidirectionalStream` | **VERIFIED: `bedrock:InvokeModel`.** The AWS service-reference JSON for Bedrock (https://servicereference.us-east-1.amazonaws.com/v1/bedrock/bedrock.json, fetched today) lists only `InvokeModel` and `InvokeModelWithResponseStream`. It has **no** `InvokeModelWithBidirectionalStream` action. The API reference agrees that it "requires permission for the `bedrock:InvokeModel` action" (VERIFIED, researcher). The fourth report's IAM line is wrong. |
| Output format | Raw LPCM | **VERIFIED.** `audioOutputConfiguration` uses `"mediaType": "audio/lpcm"`, 16-bit mono, base64, 8/16/24 kHz. There is no MP3. |
| "Polly-compatible voices" | Mentioned by one report | **VERIFIED.** March 2026 release note: "Amazon Polly-compatible voices for consistent voice experiences across Amazon Nova 2 Sonic and Polly text-to-speech (TTS)." The Sonic voice IDs (amy, tiffany, matthew, olivia, kiara, arjun, ambre, florian, …) all appear in Polly's generative voice list. **UNVERIFIED:** that Sonic `amy` sounds the same as Polly generative Amy. If it does, Sonic gives no voice-quality advantage over Polly generative for British English. |
| Verbatim fidelity | Improving, but not guaranteed | **VERIFIED.** May 2026: "Reduced speech generation hallucinations by 88% … improving verbatim fidelity in alphanumeric codes, currency values, addresses …". That is a reduction, not elimination, and it targets conversational replies. The refresh "was deployed automatically as an in-place update", so the voice can change under you. |
| Safety / determinism | Probabilistic, filters fixed | **VERIFIED.** "Because its output is probabilistic, Amazon Nova 2 Sonic may produce inaccurate or inappropriate content." "The safety filters for Amazon Nova 2 Sonic cannot be configured or disabled." If a filter triggers, "a canned message is generated or an error is returned". There is an "inaudible watermark". |
| Quota | 20 concurrent sessions | **VERIFIED.** "20 concurrent `InvokeModelWithBidirectionalStream` sessions per AWS account in each supported Region. This quota is not adjustable." (2.5: "Contact your AWS account team".) Irrelevant at this scale. |
| Nova 2.5 Sonic claims | "Improved instruction following" | **VERIFIED.** "More reliable adherence to system prompts, persona instructions". That makes a "repeat exactly" prompt somewhat more plausible, but it remains **UNVERIFIED** for verbatim reading and impossible for phonemes. |
| Sonic pricing | Token-based, rates not readable | **UNVERIFIED.** The pricing pages did not render rates. One secondary source gives about $0.003/1K speech-input tokens and $0.012/1K speech-output tokens. At family scale the cost is negligible either way. |
| Polly generative en-GB in London | Amy and Brian | **VERIFIED.** The en-GB generative voices are "Amy, Brian". The regions list includes "Europe (London): eu-west-2". The London note says "Currently Europe (London) … only support the following Generative voices: … Amy (en-GB), Brian (en-GB) …". https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html |
| Oct 2026 Polly upgrade | Drop-in new model | **VERIFIED.** "Posted on: Oct 20, 2026": "a new model behind the Amazon Polly Generative engine that delivers more natural-sounding, accurate speech output". It adds "14 new voices", none of them en-GB. SSML: users "continue to use … SSML tags". London is listed. https://aws.amazon.com/about-aws/whats-new/2026/10/polly-generative/ |
| Polly SSML by engine | phoneme Full on neural, Partial on generative | **VERIFIED.** Table: `<phoneme>` is Neural "Full availability" and Generative "Partial availability". `<say-as>` is Neural "Partial" and Generative "Full". `<prosody>` is Partial on both. `<break>`, `<sub>`, `<w>`, `<s>`, `<p>` and `<lang>` are Full on both. `drc` is not available on generative. "If you use unsupported SSML tags in standard, neural, or long-form format, you will get an error." Generative is omitted from that sentence. https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html. **Docs conflict:** the phoneme page says "This tag is supported by long-form, neural, and standard TTS formats", which leaves out generative. https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html |
| Polly generative caveats | Drift, hallucination, no marks | **VERIFIED.** "any updates to the training data and the model could result in slight variations to the way the voices sound". An emergency stop "might end up cutting a word … rendering half the word". "Do not assume complete protection against hallucinated speech output." "Support for generating speech marks is currently not available." Output is MP3, OGG or PCM, with a 24 kHz default. |
| Polly price | Gen $30, neural $16 per 1M chars | **VERIFIED.** Standard $4.00, Neural $16.00, Long-Form $100.00, Generative $30.00 ("speech requests only"). Free tier: generative 100,000 characters per month and neural 1M per month, each for the first 12 months. https://aws.amazon.com/polly/pricing/ |

Smaller points from the reports that I did not re-fetch, but which are plausible and do not change the decision:
- Generative prosody works "only around full sentences" and supports rate and volume, not pitch.
- The generative SynthesizeSpeech quota is 8 TPS.
- Long-form is us-east-1 only, with no en-GB voice.

All are VERIFIED (researcher), mostly from `06-polly-tts.md`.

---

## 3. Recommendation for this product (for an AWS Solutions Architect)

### (a) Can Nova 2 Sonic replace Polly? No.

| Requirement | Nova 2 / 2.5 Sonic | Consequence |
|---|---|---|
| Say exactly the approved text | Generates its own reply to a USER turn. A "repeat exactly" system prompt is undocumented and probabilistic. | Every render can add "Sure!" or paraphrase. The operator approval gate catches it, but the rejection rate is unknown. |
| Isolated phonemes (/s/, /sh/, /b/ + small schwa) | No phoneme or IPA input. Rate and accent are not controllable. | Effectively impossible to specify. It would most likely say a letter name ("ess") or a word. |
| British voice choice | `amy` only | No male option, and probably the same persona as Polly Amy. |
| Region | eu-north-1 (Stockholm) in-Region only, with no inference profile | A permanent cross-region dependency (EU, not UK) for curriculum text. |
| Lambda / SDK | Experimental async v4 SDK + awscrt + HTTP/2 stream with silence keep-alive. boto3 is still needed for S3. | Production code would depend on software AWS says not to use in production. |
| Output | Raw base64 LPCM | Must be wrapped as WAV or encoded to MP3 (lameenc or an ffmpeg layer). |
| Lifecycle | Nova 2 Sonic: EOL no sooner than 2 Dec 2026. 2.5: no sooner than 5 Oct 2027. In-place refreshes change the voice. | New clips will drift from older approved clips sooner. |

What Sonic *could* do at most: speak instruction-type sentences, behind a transcript-match guard. Even for that it offers no documented advantage over Polly generative Amy. It is the wrong product category: a voice agent, not a narrator.

### (b) Recommended engine strategy (PROPOSAL)

1. **Words, blending target words, dictation words and instructions: Polly Generative, en-GB Amy or Brian, eu-west-2.** This is the "really good voice". Use plain text inside `<speak>` with `<break>`, `<sub>`, `<w>` and `<s>`, all of which have Full support. Avoid relying on `<phoneme>` or `<prosody>` here.
2. **Isolated phonemes and letter names: Polly Neural + `<phoneme>` (X-SAMPA), the same voice name (Amy or Brian).** `<phoneme>` is Full on neural. Do not use `say-as characters` on neural, because it falls back to the standard voice.
3. **Human recordings (`provider: recorded`)** for any phoneme that fails the listening test on both engines. Commercial phonics schemes do the same.
4. **Voice-consistency rule:** keep one voice *name* across engines (Amy/Amy or Brian/Brian). Neural Emma and Arthur exist only on neural, so choosing them rules out generative. If phonemes end up human-recorded, give them a distinct "character" rather than a near-match.
5. **Sonic:** do not build on it. If the owner still wants to hear it, run one offline trial in the Bedrock console playground in eu-north-1 (Nova 2.5 Sonic, `amy`) on about 10 instruction sentences, outside the product.

**Milestone-0 bake-off** (extends `06-polly-tts.md` section 5.8; about half a day, under $2):
- Columns:
  - Neural Amy, Emma, Brian and Arthur, with `<phoneme>`.
  - Generative Amy and Brian, as plain text. Also try `<phoneme>` on generative to find out what "Partial" means in practice.
  - Optionally Sonic 2.5 `amy` from the console, 3 repeats per item.
  - Optionally 10 human-recorded sounds as a reference.
- Rows:
  - The 44 phonemes plus letter names.
  - About 12 minimal pairs.
  - About 10 dictation words.
  - About 8 instructions.
  - 3 client-side sound-talk sequences.
- Scoring per item:
  - Correct sound or word, with no letter-name substitution.
  - Schwa size.
  - Continuant held at least about 0.5 s.
  - No added or cut words (check the clip's ending for the generative emergency stop).
  - Southern British accent.
  - Warmth.
  - Clean edges.
  - Render-to-render repeatability.
- Decision: choose the engine per `kind`, not globally. Any added-word failure disqualifies that engine for that kind.

### (c) Design changes

**1. Speech definition (immutable record).** Add or require these fields:

| Field | Values | Notes |
|---|---|---|
| `kind` | `phoneme \| letter_name \| word \| dictation_word \| instruction \| phrase` | Drives the server-side allow-list. |
| `provider` | `polly \| recorded` (`bedrock_sonic` reserved, not enabled) | |
| `engine` | `neural \| generative \| standard` (Polly) / `human` | Always sent explicitly, because Polly's default is `standard`. |
| `voiceId` | `Amy \| Brian \| Emma \| Arthur` | Allow-list per engine: generative is Amy or Brian only. |
| `languageCode` | `en-GB` | |
| `textType`, `text` | canonical SSML | Hash exactly what is sent. |
| `outputFormat`, `sampleRate` | `mp3`, `24000` | Generative default is 24 kHz. |
| `generation` | int | Bump to force a re-render. |
| `approved` | `{cacheKey, bytesSha256, approvedAt, engineObservedAt}` | `engineObservedAt` is the render date. It lets you correlate with AWS in-place model upgrades such as Oct 2026. |
| `recorded.sourceSha256` | for human clips | |

**2. Allow-list by kind (in Lambda code, because IAM cannot restrict Polly engine or voice):**

| kind | allowed |
|---|---|
| phoneme | polly/neural (SSML `phoneme`, `prosody rate`, `break`), recorded |
| letter_name | polly/neural (`phoneme`), polly/generative (plain text) if the bake-off passes, recorded |
| word, dictation_word | polly/generative (default), polly/neural (fallback, e.g. when a pronunciation fix needs `phoneme`) |
| instruction, phrase | polly/generative (default), polly/neural |

SSML allow-list for generative: `speak`, `break`, `s`, `p`, `sub`, `w`. Reject `phoneme` on generative in production until the bake-off proves it works. Reject `prosody` except around whole sentences. Do not assume generative errors on an unsupported tag, because AWS documents that error only for standard, neural and long-form. Validate in code.

**3. Cache identity.** The recipe in `06-polly-tts.md` section 9.1 already hashes `provider` and `engine`; keep it. Changes:
- `keySchema` stays `1` if the layout below is adopted before any clip is published. Otherwise bump to `2`.
- Path: `tts/v1/<provider>/<engine>/<languageCode>/<voiceId>/<format>-<rate>/<hh>/<sha256>.<ext>`. Recorded clips use `tts/v1/recorded/human/en-GB/<speaker>/…`, keyed by the source file's SHA-256.
- The `.json` sidecar adds `renderedAt` and the Polly `x-amzn-RequestId`.
- **Approval binds to `bytesSha256`, not to parameters.** This matters more for generative: AWS says model updates "could result in slight variations", and the Oct 2026 upgrade was in-place with no version pinning. The same key must never be re-rendered after approval. Use `If-None-Match: *` conditional writes, no delete permission, and no lifecycle expiry. All of this is already in 06.

**4. IAM.** No change for the recommended path:
- `polly:SynthesizeSpeech` on `Resource: "*"`, optionally with `aws:RequestedRegion = eu-west-2`. Polly has no engine or voice condition keys (VERIFIED in 06).
- Do not grant `polly:StartSpeechSynthesisStream` or any `bedrock:*` action.
- If Sonic were ever adopted, the statement would be `bedrock:InvokeModel` on `arn:aws:bedrock:eu-north-1::foundation-model/amazon.nova-2-5-sonic` (VERIFIED action name, see section 2). You would also need CloudTrail advanced event selectors for `AWS::Bedrock::Model` data events (VERIFIED, researcher).

**5. Region.**
- Everything stays in **eu-west-2**. Polly generative Amy and Brian are explicitly listed for London, so there is no cross-region call.
- Sonic would be a cross-region call to **eu-north-1 (Stockholm)**. That is EU, not UK, and has no Geo or Global profile. It is rejected for this design.

**6. Lambda packaging.**
- Unchanged: Python 3.14, boto3 from the runtime (or pinned in the zip if you want a known Polly API surface), one synchronous `synthesize_speech(Engine=…, VoiceId=…, LanguageCode="en-GB", OutputFormat="mp3", SampleRate="24000", TextType="ssml", Text=…)`. MP3 comes back directly, with no encoder or native wheels.
- For comparison, Sonic would require:
  - `aws-sdk-bedrock-runtime[awscrt]`, which is pre-alpha and depends on awscrt native wheels of about 4 MB that must be built for Linux.
  - An asyncio handler with a keep-alive silence stream and 20 s internal timeouts.
  - A WAV wrapper or MP3 encoder.
  - Ideally a separate Lambda, so experimental dependencies stay out of the main function.

**7. Cost at family scale** (my arithmetic, from VERIFIED list prices). Assume 400 clips averaging about 40 billed characters (SSML tags are not billed), plus about 3 previews per approved clip:

| Engine | Billed chars | List cost |
|---|---|---|
| All generative | 400 × 40 × 3 = 48,000 | about $1.44 |
| All neural | 48,000 | about $0.77 |
| Realistic mix (≈150 phoneme/letter clips on neural at ~15 chars, ≈250 word/instruction clips on generative at ~50 chars, ×3 previews) | ≈6.8k neural + ≈37.5k generative | about $0.11 + $1.13 ≈ **$1.24 once** |
| Bake-off | ≈20–30k chars | under $1 |

Both totals are inside the 12-month free tier (generative 100k characters per month, neural 1M per month). Approved clips are never re-synthesised, so ongoing synthesis cost is zero. S3 storage of about 400 × 15 KB MP3s is negligible. Cost is not a decision factor. Sonic token costs are UNVERIFIED but would also be pennies.

### (d) What remains UNVERIFIED, and how to check it

| Item | How to check |
|---|---|
| What generative "Partial" `<phoneme>` means for a single-phoneme utterance. The two doc pages conflict. | Bake-off: render /s/, /sh/, /b@/ on generative Amy. Note whether it errors, ignores the tag, or approximates it. |
| Whether generative silently accepts unsupported tags or attributes | Send `<prosody rate="70%">` around a single word, and a `<phoneme>` with an invalid symbol. Observe whether it errors or ignores them. |
| Whether generative Amy and Brian sound better than neural to these listeners and children | Bake-off scoring, with headphones and laptop speakers. |
| Whether Sonic `amy` is the same voice as Polly Amy ("Polly-compatible voices") | Optional console A/B. |
| Whether Sonic 2.5 can be made reliably verbatim | Optional console test: 10 sentences × 3 repeats at temperature 0. Any added word means no. |
| Whether Nova 2.5 Sonic's voice list matches Nova 2 (a researcher quoted the service card: "same … voices") | Re-read the 2.5 language-support page if Sonic is ever reconsidered. |
| Sonic per-token prices | The Bedrock pricing page (it did not render for any researcher). Immaterial. |
| Whether Polly *neural* voices are ever updated in place. AWS states drift only for generative and long-form. | Not checkable in advance. Mitigated by approving bytes. |
| How often the generative emergency stop clips the ending of a short (1–3 word) input | Bake-off: listen to the ending of every generative clip. Add an automated duration sanity check (clip length versus expected) in the preview UI. |

---

## 4. Sources (fetched or confirmed 2026-11-14)

- Nova 2 Sonic model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.html
- Nova 2.5 Sonic model card: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-5-sonic.html
- Nova 2 Sonic AI service card: https://docs.aws.amazon.com/ai/responsible-ai/nova-2-sonic/overview.html
- Nova 2 Sonic voices: https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html
- Cross-modal input: https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-cross-modal.html
- Nova 2 release notes: https://docs.aws.amazon.com/nova/latest/nova2-userguide/release-notes.html
- SDK for Python v4 bidirectional streaming: https://docs.aws.amazon.com/sdk-for-python/v1/guide/bedrock-bidirectional-streaming.html
- Bedrock IAM service reference: https://servicereference.us-east-1.amazonaws.com/v1/bedrock/bedrock.json
- Polly generative voices: https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html
- Polly SSML support: https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html
- Polly phoneme tag: https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html
- Polly Oct 2026 What's New: https://aws.amazon.com/about-aws/whats-new/2026/10/polly-generative/
- Polly pricing: https://aws.amazon.com/polly/pricing/
- Researcher-cited, not re-fetched:
  - boto3 bedrock-runtime reference: https://docs.aws.amazon.com/boto3/latest/reference/services/bedrock-runtime.html
  - InvokeModelWithBidirectionalStream API: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModelWithBidirectionalStream.html
  - Polly prosody tag: https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html
  - Polly March 2026 What's New: https://aws.amazon.com/about-aws/whats-new/2026/03/amazon-polly-expands-TTS-new-voices-and-bidirectional-streaming/
