# 06 — Amazon Polly for UK-English phonics audio, S3 presigned delivery and browser playback

Research date: **2026-11-14**. Author: TTS specialist (source material for the implementation plan; not the plan itself).

## 0. How to read this report

**Web access:** available. Official pages were fetched on 2026-11-14 and are cited by URL. Three limits apply:

- The Amazon S3 *API Reference* pages for SigV4 (`.../AmazonS3/latest/API/sigv4-query-string-auth.html`, `sig-v4-authenticating-requests.html`, `specify-signature-version.html`) returned only a title or a 302 stub, so SigV4 details are cited from the IAM User Guide and S3 User Guide instead.
- Two AWS re:Post pages returned HTTP 403.
- **I could not synthesise any audio.** The hard rules forbid AWS CLI/SDK calls, so every statement about how a Polly voice *sounds* is a prediction to be tested, never a measurement.

**Claim labels**

| Label | Meaning |
|---|---|
| **VERIFIED** | Read today in a fetched page or a local file; source cited. |
| **PROPOSAL** | My design recommendation. |
| **UNVERIFIED** | From memory or inference; could not be confirmed today. |

**Requirement references** are to `/home/jack/Documents/Projects/space-tower-defence/prompt.md` (the approved specification), cited as `prompt.md:<line>`.

**Repository status used here:** `00-verified-repo-facts.md` (as updated at about 14:30 on 2026-11-14, lines 35-50) records that the bootstrap has been applied and that no application resources exist yet — no Lambda, API Gateway, Cognito, DynamoDB or application buckets. Everything in this report is therefore new work; nothing here depends on an existing TTS resource. The reduced-quota caveat for new accounts in section 10.2 may well apply, since no Lambda has ever run in the account (inference; check the quota).

---

## 1. The twelve findings that matter most

1. **VERIFIED** — Four en-GB voices support the neural engine: **Amy (F), Emma (F), Brian (M), Arthur (M)**. Neural is supported in **eu-west-2 (London)**. No region change is needed for the spec's proposal.
2. **VERIFIED** — Generative en-GB exists (**Amy, Brian**) and is available in London, but `<phoneme>` is only "partially" available on generative, `<prosody>` works only around full sentences, and AWS documents a hallucination/cut-off caveat. Long-form has **no en-GB voice** and runs only in us-east-1. Neural remains the right starting engine.
3. **VERIFIED** — On neural, `<phoneme>` (IPA and X-SAMPA) and `<break>` are fully available; `<prosody>` supports `rate` and `volume` but **not `pitch`**; `<emphasis>` is **not available**; `<say-as interpret-as="characters">` is **not supported on neural** — the sentence is silently synthesised with the *standard* voice (and still billed as neural).
4. **VERIFIED** — AWS states that for some voices neural may "automatically switch to the Standard engine ... during letter-by-letter spelling". Letter-name clips therefore need an explicit listening check for a change in voice quality.
5. **VERIFIED** — DfE guidance (The reading framework, Appendix 6) says /b/ /d/ /g/ /j/ "cannot be heard clearly in isolation, unless small schwa is added" and /w/ /y/ cannot be pronounced clearly in isolation at all. So a "perfect pure sound" does not exist for six phonemes even for a human teacher; the review checklist must define "acceptable" accordingly.
6. **UNVERIFIED (prediction)** — Isolated consonants are the high-risk area for any neural TTS: plosives, /h/, /θ/, /ð/, /ŋ/, /ʒ/, /r/, /w/, /j/. Long vowels and diphthongs are low risk because most are also real words ("eye", "oh", "or", "air", "ear"). A Milestone 0 listening spike must happen before content is scaled (the spec already asks for this at `prompt.md:1267-1268`).
7. **PROPOSAL** — The reviewed artefact is the **MP3 bytes in S3**, not "whatever Polly returns next time". Admin Preview should write to the same content-addressed key players read; publishing pins that key plus a SHA-256 of the bytes; the cache prefix must never expire or be overwritten.
8. **VERIFIED** — A presigned URL signed with role credentials stops working when those credentials expire, whatever expiry was requested. **UNVERIFIED** — AWS does not publish the lifetime of Lambda execution-role credentials. **PROPOSAL** — use a **300-second** expiry and have the client re-request once on HTTP 403.
9. **VERIFIED** — IAM cannot restrict Polly by voice, engine, language or text: Polly has no service-specific condition keys and `SynthesizeSpeech` without lexicons requires `Resource: "*"`. The voice/engine allow-list must be enforced in Lambda code.
10. **VERIFIED** — Default `SynthesizeSpeech` quota for neural is **8 TPS (burst 10)**, adjustable. **PROPOSAL** — if publishing pre-warms every clip, players and offline-pack preparation only ever see cache hits, so the Polly quota matters only to the admin tool.
11. **VERIFIED** — SSML tags are not billed; neural costs **$16.00 per 1 million characters**. A whole phonics bank is a few thousand characters, i.e. pennies. Cost is not a design driver; correctness is.
12. **PROPOSAL** — Fetch the bytes with `fetch()` (needs S3 CORS for both site origins), verify a SHA-256, store the bytes, and play through one shared `HTMLAudioElement` from a Blob URL. Keep Web Audio (`decodeAudioData`) as the documented upgrade path if Safari rejects asynchronous `play()` or tighter sequencing is needed.

---

## 2. (a) British English voices and engines

Source: <https://docs.aws.amazon.com/polly/latest/dg/available-voices.html>, <https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html>, <https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html>, <https://docs.aws.amazon.com/polly/latest/dg/long-form-voices.html>, <https://docs.aws.amazon.com/general/latest/gr/pol.html>.

### 2.1 Voice and engine matrix (VERIFIED)

| Language code | Voice ID | Gender | Standard | Neural | Long-form | Generative |
|---|---|---|---|---|---|---|
| en-GB | **Amy** | Female | Yes | Yes | No | Yes |
| en-GB | **Emma** | Female | Yes | Yes | No | No |
| en-GB | **Brian** | Male | Yes | Yes | No | Yes |
| en-GB | **Arthur** | Male | No | Yes | No | No |
| en-GB-WLS (Welsh English) | Geraint | Male | Yes | No | No | No |
| en-IE (Irish English) | Niamh | Female | No | Yes | No | Yes |

- **VERIFIED** — No en-GB child voice exists. The only child voices in the table are en-US (Ivy, Justin, Kevin).
- **VERIFIED** — No Scottish English voice is listed.
- **VERIFIED** — Amy supports the Newscaster style on neural. Not relevant to phonics.

### 2.2 Availability in London (eu-west-2)

| Engine | In eu-west-2? | Evidence |
|---|---|---|
| Standard | Yes | **VERIFIED** — "Europe (London): eu-west-2" is in the standard-voice region list (<https://docs.aws.amazon.com/polly/latest/dg/standard-voices.html>); the endpoint `polly.eu-west-2.amazonaws.com` exists (general reference). |
| Neural | Yes | **VERIFIED** — "Europe (London): eu-west-2" is in the neural region list. |
| Generative | Yes, restricted voice list | **VERIFIED** — London is in the generative region list, and the page's note names **Amy (en-GB)** and **Brian (en-GB)** among the generative voices supported in London. |
| Long-form | No | **VERIFIED** — "US East (N. Virginia): us-east-1; Other regions not available". No en-GB long-form voice exists anyway (en-US and es-ES only). |

- **UNVERIFIED** — The neural page does not publish a per-region voice list, so "all four en-GB neural voices are present in eu-west-2" is an inference. **PROPOSAL** — the first spike step is a `DescribeVoices` call filtered to engine `neural`, language `en-GB`, in eu-west-2, run by the owner.
- Nothing the spec asks for requires leaving London. If long-form were ever wanted it would mean us-east-1 and a US accent, which conflicts with both the London requirement and the UK-English requirement.

### 2.3 Caveats AWS documents about the newer engines (VERIFIED)

- Generative and long-form pages both state that model updates "could result in slight variations to the way the voices sound".
- Generative page: an "emergency stop mechanism" may cut a word, and "Do not assume complete protection against hallucinated speech output."
- Generative page: "Support for generating speech marks is currently not available."

These matter for phonics: a one-word or one-sound clip leaves no room for a clipped or invented syllable.

---

## 3. (b) SSML and lexicon support per engine

Source: <https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html> plus the individual tag pages cited in each row.

### 3.1 Tag availability (VERIFIED)

"All tags except for `<amazon:domain name="news">` are supported for Standard voices."

| Tag | Neural | Long-form | Generative | Notes (verified unless marked) |
|---|---|---|---|---|
| `<speak>` | Full | Full | Full | Required wrapper for SSML. |
| `<break>` | Full | Full | Full | `strength` none/x-weak/weak/medium/strong/x-strong, or `time` up to **10s / 10000ms**. [break-tag](https://docs.aws.amazon.com/polly/latest/dg/break-tag.html) |
| `<phoneme>` | Full | Full | **Partial** | `alphabet="ipa"` or `"x-sampa"` plus `ph`. The phoneme page itself says "supported by long-form, neural, and standard" and does not mention generative — the two pages disagree, and "partial" is not defined. [phoneme-tag](https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html) |
| `<prosody>` | Partial | Partial | Partial | Neural, long-form, generative support **`volume` and `rate` only, not `pitch`**. "For Generative voices, the prosody tag can be used only around full sentences." [prosody-tag](https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html) |
| `<prosody amazon:max-duration>` | No | No | No | Standard only. |
| `<say-as>` | **Partial** | Full | Full | See 3.3. [say-as-tag](https://docs.aws.amazon.com/polly/latest/dg/say-as-tag.html) |
| `<emphasis>` | **No** | No | No | Standard only. |
| `<lang>` | Full | Full | Full | Generative: only around full sentences. [lang-tag](https://docs.aws.amazon.com/polly/latest/dg/lang-tag.html) |
| `<sub alias>` | Full | Full | Full | [sub-tag](https://docs.aws.amazon.com/polly/latest/dg/sub-tag.html) |
| `<w role>` | Full | Full | Full | Roles `amazon:VB`, `VBD`, `DT`, `IN`, `JJ`, `NN`, `DEFAULT`, `SENSE_1`. [w-tag](https://docs.aws.amazon.com/polly/latest/dg/w-tag.html) |
| `<p>`, `<s>` | Full | Full | Full | |
| `<mark>` | Full | Full | Partial | |
| `<amazon:effect name="drc">` | Full | Full | No | Dynamic range compression. [drc-tag](https://docs.aws.amazon.com/polly/latest/dg/drc-tag.html) |
| `<amazon:domain name="news">` | Select voices | No | No | Amy only for en-GB. |
| `<amazon:auto-breaths>` | No | No | No | Standard only. |
| `<amazon:effect phonation="soft">` | No | No | No | Standard only. |
| `<amazon:effect vocal-tract-length>` | No | No | No | Standard only. |
| `<amazon:effect name="whispered">` | No | No | No | Standard only. |

- **VERIFIED** — "If you use unsupported SSML tags in standard, neural, or long-form format, you will get an error." The page is silent about generative.
- **VERIFIED** — `<audio>`, `<lexicon>`, `<lookup>` and `<voice>` are not supported at all ([limits](https://docs.aws.amazon.com/polly/latest/dg/limits.html)).

### 3.2 Prosody limits (VERIFIED)

- `rate`: `x-slow`, `slow`, `medium`, `fast`, `x-fast`, or a percentage; "This value has a range of 20-200%" (100% = unchanged). The limits page words the floor as "doesn't support values for the rate attribute lower than -80%".
- `volume`: `default`, `silent`, `x-soft`, `soft`, `medium`, `loud`, `x-loud`, or `+ndB` / `-ndB`.
- `pitch`: standard engine only.
- Nesting inside `<prosody>` is allowed ("can also be combined with nested tags").

### 3.3 `say-as` values, and the neural trap (VERIFIED)

Values: `characters` / `spell-out`, `cardinal` / `number`, `ordinal`, `digits`, `fraction`, `unit`, `date` (with `format`), `time`, `address`, `expletive`, `telephone`.

> "`characters` or `spell-out` ... is not currently supported for neural voices. If you're using a neural voice and this SSML code is encountered by Amazon Polly at run-time, the affected sentence will be synthesized using the related standard voice. ... this sentence will still be billed as if it uses a neural voice."

Consequences for this product:

- Using `say-as characters` for **letter names** on neural produces a *standard-engine* clip, which will sound different from every neighbouring neural clip.
- **Arthur has no standard voice**, so what happens for Arthur is undocumented (**UNVERIFIED**).
- Independently of `say-as`, the neural page warns that Polly "might automatically switch to the Standard engine when accuracy is critical ... during letter-by-letter spelling".
- **PROPOSAL** — do not allow `say-as characters` in approved speech definitions on neural. Produce letter names with `<phoneme>` or plain reviewed text (section 5.6).

### 3.4 Phonetic alphabets (VERIFIED)

- `alphabet="ipa"` and `alphabet="x-sampa"` are the two alphabets for English.
- The en-GB symbol inventory is published at <https://docs.aws.amazon.com/polly/latest/dg/ph-table-english-uk.html> (27 consonant rows including three syllabic consonants, 20 vowels, plus primary stress, secondary stress and syllable boundary). Section 5.5 uses exactly those symbols.
- Two oddities in AWS's own table to be aware of: /r/ is written **ɹ** (X-SAMPA `r\`), and FLEECE is listed as IPA `i:` with X-SAMPA **`i`** (no length mark), whereas GOOSE is `u:` / `u:`.

### 3.5 Reserved characters (VERIFIED)

`"` `&` `'` `<` `>` must be escaped as `&quot;` `&amp;` `&apos;` `&lt;` `&gt;` where XML requires it (<https://docs.aws.amazon.com/polly/latest/dg/escapees.html>). This bites with X-SAMPA, whose primary-stress mark is `"`.

### 3.6 Lexicons (VERIFIED unless marked)

- PLS (W3C Pronunciation Lexicon Specification) documents stored per region; up to **5** per request; applied "only if the language of the lexicon is the same as the language of the voice" (<https://docs.aws.amazon.com/polly/latest/dg/managing-lexicons.html>, [API reference](https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html)).
- Quotas: 100 lexicons per region, 40,000 characters each, 100 characters per `<phoneme>`/`<alias>` replacement; "the size of the lexicon affects the latency of the SynthesizeSpeech operation".
- Per-engine support is not stated on the lexicon pages. The Service Quotas table describes "SynthesizeSpeech lexicon count ... Applies to all engines", which implies all engines accept lexicons (**inference, UNVERIFIED** as a behavioural claim).
- **PROPOSAL — do not use lexicons.** An inline `<phoneme>` makes each speech definition self-contained, so the cache key covers everything that shapes the audio. A lexicon is a mutable, regional, out-of-band dependency that would also have to be hashed, and it adds an IAM resource and a Terraform resource for no benefit at this scale.

---

## 4. (c) `SynthesizeSpeech` limits, billing, quotas and price

### 4.1 Request and response (VERIFIED — [API reference](https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html))

| Item | Value |
|---|---|
| Operation | `POST /v1/speech`, synchronous, returns `AudioStream` |
| `Engine` | `standard` \| `neural` \| `long-form` \| `generative`. **Default is `standard`** if omitted — always send it explicitly. |
| `TextType` | `text` (default) or `ssml` |
| `OutputFormat` | `mp3`, `ogg_vorbis`, `ogg_opus`, `pcm`, `mulaw`, `alaw`, `json` (speech marks) |
| `SampleRate` for mp3 / ogg_vorbis | "8000", "16000", "22050", "24000", "44100", "48000". Default 22050 for standard; **24000 for neural, long-form and generative**. |
| `SampleRate` for pcm | "8000", "16000" (default 16000) |
| `SampleRate` for ogg_opus | "48000" |
| `LanguageCode` | Optional; only needed for bilingual voices. |
| `LexiconNames` | Up to 5. |
| Response headers | `Content-Type` (**`audio/mpeg`** for mp3) and **`x-amzn-RequestCharacters`** (characters synthesised). |
| Errors | `EngineNotSupportedException`, `InvalidSampleRateException`, `InvalidSsmlException`, `LanguageNotSupportedException`, `LexiconNotFoundException`, `MarksNotSupportedForFormatException`, `SsmlMarksNotSupportedForTextTypeException`, `TextLengthExceededException` (all 400 except Lexicon 404), `ServiceFailureException` (500). |

Documentation inconsistency (**VERIFIED** that both statements exist): the neural and generative pages say valid rates are "8 kHz, 16 kHz, 22 kHz, or 24 kHz", while the API reference lists 44100 and 48000 for mp3 as well. **PROPOSAL** — treat 24000 as the safe default and test 48000 in the spike; an unsupported combination returns `InvalidSampleRateException`.

### 4.2 Size limits (VERIFIED — [limits](https://docs.aws.amazon.com/polly/latest/dg/limits.html), [quotas](https://docs.aws.amazon.com/general/latest/gr/pol.html))

- Input up to **3,000 billed characters, 6,000 total characters** (total includes SSML tags and whitespace). Both are adjustable quotas.
- Output audio stream is limited to **10 minutes**; the rest is cut off.
- Phonics clips are 1 to roughly 60 billed characters, so these limits are irrelevant except as an upper bound for the admin validator.

### 4.3 Billing (VERIFIED unless marked)

- "SSML tags are not counted as billed characters" (limits page, API reference error text, Service Quotas descriptions, and the CloudWatch `RequestCharacters` metric: "billable characters only and does not include SSML tags").
- You are charged per character sent for speech or speech marks ([pricing](https://aws.amazon.com/polly/pricing/)).
- "You can cache and replay Amazon Polly's generated speech at no additional cost"; "As between you and AWS, your Polly output belongs to you" ([FAQ](https://aws.amazon.com/polly/faqs/)).
- A `say-as characters` sentence on neural is billed at the neural rate even though the standard voice speaks it.
- **UNVERIFIED** — whether spaces and punctuation count as billed characters, and whether the *text content* of a `<phoneme>` element counts. **PROPOSAL** — record the `x-amzn-RequestCharacters` value in the clip metadata; it is the authoritative number.

### 4.4 Throttling quotas (VERIFIED)

| Operation | Default | Adjustable |
|---|---|---|
| `SynthesizeSpeech` — standard | 80 TPS, burst 100; up to 80 concurrent | Yes |
| `SynthesizeSpeech` — **neural** | **8 TPS, burst 10; up to 18 concurrent** | Yes (quota code L-0FE2012E) |
| `SynthesizeSpeech` — generative | 8 TPS; up to 26 concurrent | Yes |
| `SynthesizeSpeech` — long-form | 8 TPS, burst 10; up to 26 concurrent | Yes |
| `DescribeVoices` | 80 TPS, burst 100 | (shares the standard quota per the quota description) |
| Lexicon operations combined | 5 TPS, burst 10 | Yes |

- Quotas are per account, per region.
- **VERIFIED** — throttled requests "return a response with HTTP status 400, and a response header indicating `ThrottlingException`". Note it is a **400, not a 429** — the Lambda must translate it.
- **VERIFIED** — AWS's advice: "Retry throttles with backoff and jitter" and watch the Polly CloudWatch metrics.
- CloudWatch namespace `AWS/Polly`, dimension `Operation`: `RequestCharacters`, `ResponseLatency` (microseconds, request to start of streaming response), `2XXCount`, `4XXCount`, `5XXCount` (<https://docs.aws.amazon.com/polly/latest/dg/cloud-watch.html>).

### 4.5 Price per 1 million characters (VERIFIED on 2026-11-14 — [pricing page](https://aws.amazon.com/polly/pricing/))

| Engine | Price | Free tier wording on the page |
|---|---|---|
| Standard | $4.00 | 5 million characters per month |
| **Neural** | **$16.00** | 1 million characters per month "for the first 12 months" |
| Long-form | $100.00 | 500 thousand per month for the first 12 months |
| Generative | $30.00 | 100 thousand per month for the first 12 months |

- **VERIFIED** — the page also says "Starting July 15, 2025, new AWS customers will receive up to $200 in AWS Free Tier credits" which "must be used within 12 months of your account creation date". Which scheme applies depends on when the workload account was created. **PROPOSAL** — assume no free tier.
- The page gives no regional price differences except GovCloud.
- Worked illustration (my arithmetic): 500 distinct clips averaging 20 billed characters is 10,000 characters, about **$0.16** on neural, paid once because clips are cached. A generous listening spike (section 5.8) is roughly 15,000 characters, about $0.25-$0.50 across engines.

### 4.6 Privacy note (VERIFIED — FAQ)

"Amazon Polly may store and use text inputs processed by the service solely to provide and maintain the service"; an opt-out from service-improvement use exists; content is "encrypted and stored at rest in the AWS region where you are using Amazon Polly". The FAQ permits use in child-directed applications subject to the service terms and applicable law. Because the spec forbids names, DOB or any player data in speech text (`prompt.md:219`, `prompt.md:591`), only approved curriculum text ever reaches Polly.

---

## 5. (d) Phonics quality

### 5.1 What "correct" means — the DfE position (VERIFIED)

- The national curriculum spelling appendix uses a 44-symbol IPA table — 24 consonants and 20 vowels — "based on Received Pronunciation" which "could be significantly different in other accents". Source: English Appendix 1: Spelling, <https://assets.publishing.service.gov.uk/media/5a7ccc06ed915d63cc65ce61/English_Appendix_1_-_Spelling.pdf>, p. 25.
- The reading framework (DfE, July 2023), Appendix 6 "Pronouncing phonemes": "Teachers should enunciate phonemes clearly, and avoid adding schwa ... it is easier to blend the sounds /s/ /p/ /or/ /t/ than /suh/ /puh/ /or/ /tuh/". Source: <https://assets.publishing.service.gov.uk/media/664f600c05e5fe28788fc437/The_reading_framework_.pdf>, pp. 142-143.
- The same appendix groups the consonants:
  - Unvoiced: /p/ /t/ /k/ /ch/ /f/ /th/ (thin) /s/ /sh/ /h/.
  - Voiced: /r/ /l/.
  - "cannot be heard clearly in isolation, unless small schwa is added": **/b/ /d/ /g/ /j/**.
  - "have a buzzing sound": /v/ /th/ (that) /z/ /zh/ (vision).
  - Nasal: /m/ /n/ /ng/.
  - "cannot be pronounced clearly in isolation, unless they are pronounced as vowel sounds (/oo/ and /ee/) or a small schwa is added": **/w/ /y/**.
- "Vowel phonemes are easier to pronounce than consonant phonemes, when they are isolated from words."
- Letters and Sounds (DfES 2007): "Do not add an 'uh' to the end of sounds: 'ssss' not 'suh', 'mmm' not 'muh', 't' not 'tuh', 'sh' not 'shuh'." Source: <https://assets.publishing.service.gov.uk/media/5a7aa7b6e5274a34770e630c/Letters_and_Sounds_-_DFES-00281-2007.pdf>, Phase One notes and Phase Two oral-blending notes.
- Letters and Sounds grapheme order (VERIFIED from the same PDF):
  - Phase Two sets 1-5: `s a t p` / `i n m d` / `g o c k` / `ck e u r` / `h b f,ff l,ll ss`.
  - Phase Three sets 6-7: `j v w x` / `y z,zz qu`, then `ch sh th ng ai ee igh oa oo ar or ur ow oi ear air ure er`.
  - Phase Three note: "/ks/ and /kw/ are both two phonemes".
  - Phase Five adds /zh/ and the split digraphs `a-e e-e i-e o-e u-e` plus alternative spellings.
- The reading framework notes accent variation explicitly (for example 'u' in "but", and "fast"), and deliberately avoids IPA in its own chart for that reason.

### 5.2 Why TTS struggles with isolated phonemes

Everything in this subsection is **UNVERIFIED engineering expectation** unless a source is given. It explains *why* each row in section 5.5 has its risk rating. Polly's neural engine is described by AWS as a sequence-to-sequence model that "converts a sequence of phonemes ... into a sequence of spectrograms" (**VERIFIED**, neural page). Such a model learns from connected speech, so a lone consonant is outside what it was trained on.

| Problem | Mechanism | Typical symptom |
|---|---|---|
| Plosive gains a vowel | /p t k b d g/ are a closure plus a release; the model has rarely seen a release that is not followed by a vowel. | "puh", "buh"; or the opposite, a click or near-silence. |
| Continuant is clipped | /s f m n l z v ʃ/ are 80-150 ms inside words; a teacher holds them for about a second. | A blip instead of "ssss". |
| Letter-name substitution | Plain text `s`, `m`, `a` is read as a letter name or as the article "a". | "ess", "em", "ay" or "uh". |
| Short vowel distorts | English lax vowels /æ ɛ ɪ ɒ ʌ ʊ/ never end a word, so an isolated one is not a legal English utterance. | Lengthened, glottal-stopped, or shifted to a tense vowel (/ɪ/ to /iː/, /ʊ/ to /uː/). |
| Phonotactically impossible | /ŋ/ and /ʒ/ never start an English word; /h/ /w/ /j/ never occur without a following vowel. | Dropped, or a different sound substituted. |
| Weak fricatives | /f/ and /θ/ are quiet, broadband noise; at a 24 kHz sample rate nothing above 12 kHz survives. | /f/ and /θ/ indistinguishable. |
| Sentence prosody | Any utterance gets an intonation contour; `?` rises, `,` signals continuation. | A sound that seems to ask a question. |
| Engine switch | **VERIFIED** — neural may hand letter-by-letter spelling to the standard engine. | Audible change of voice between clips. |
| Accent mismatch | Voices are southern British; a child may say /ʊ/ in "up" or /a/ in "bath". | Technically correct, locally "wrong". |
| Unstable /ʊə/ | "sure", "pure" are widely merged with /ɔː/ in current southern speech. | The `ure` clip sounds like `or`. |
| Clip edges | MP3 encoders add padding; laptop audio hardware can take a moment to wake. | First 50-100 ms of a very short clip lost. |
| Model drift | **VERIFIED** for generative and long-form: updates may change how voices sound. Not stated for neural. | A regenerated clip differs from the reviewed one. |

### 5.3 Options that stay inside the requirement

All use Polly through the dedicated Lambda with reviewed SSML. Ordered by how early I would try them.

| # | Option | What it is | Strength | Weakness |
|---|---|---|---|---|
| 1 | **Homophone text inside a phoneme tag** | Long vowels and diphthongs that are also words: `eye`, `oh`, `or`, `are`, `air`, `ear`, `ow`, `oi`. Wrap the word in `<phoneme>` so both the fallback text and the forced pronunciation agree. | In-distribution for the model; likely the most natural output. | Only covers about 12 of 44 phonemes. |
| 2 | **Explicit `<phoneme>`** | `<phoneme alphabet="x-sampa" ph="...">grapheme</phoneme>` | Removes letter-name substitution; exact and reviewable. | Does not fix duration or the schwa problem by itself; behaviour for a single consonant is untested. |
| 3 | **`<prosody rate>`** | Wrap a continuant at 50-70% to lengthen it; wrap a "small schwa" plosive at 120-150% to shorten the vowel. Neural range is 20-200%. | Simple, documented lever. | Slowing can sound unnatural; unknown effect on a one-phoneme utterance. |
| 4 | **Punctuation and breaks** | End with a full stop for a falling contour; avoid commas and question marks; add `<break time="150ms"/>` before and `<break time="250ms"/>` after. | Protects clip edges; stabilises intonation. | Whether leading/trailing breaks render as silence is untested. |
| 5 | **Deliberate small schwa** | For /b d g dʒ w j/, where DfE itself accepts a small schwa: `ph="b@"` at a fast rate. | Honest about what is physically possible; matches official guidance. | Must stay *small*; needs careful listening. |
| 6 | **Audition several voices** | Same matrix through Amy, Emma, Brian, Arthur (neural). | Voices differ; one may be clearly better on consonants. | One voice must win overall — mixing voices between clips will sound inconsistent to a child. |
| 7 | **Sound plus anchor word** | "`<phoneme ...>s</phoneme>` `<break time="400ms"/>` sun." | The word disambiguates a weak consonant. | Gives the answer away in "which sound?" activities; use only in demonstrations. |
| 8 | **Word-level activity design** | Ask "which grapheme starts *sun*?" and play the whole word. | Whole words are what TTS does best; lowest risk. | Changes the activity, not the audio; some curriculum goals need the isolated sound. |
| 9 | **Client-side sequencing of approved clips** | Sound-talk "s - a - t ... sat" is played by the browser as three approved phoneme clips plus one word clip. | Each sound is identical every time; maximum cache reuse; fewer clips per offline pack. | Timing between clips is the browser's job. |
| 10 | **Per-clip engine override** | Allow an approved definition to name `standard` (Amy, Emma, Brian) or `generative` (Amy, Brian) from a server-side allow-list. Standard supports every SSML tag including `pitch` and `emphasis`. | Concatenative synthesis may render a lone phoneme more literally (**UNVERIFIED**). | Departs from "neural is the initial proposal" for those clips; different timbre. Label it as a deviation if used. |
| 11 | **Speech-mark trimming** | Synthesise a carrier word as PCM, request viseme speech marks (neural supports "All speech marks" — **VERIFIED**), cut out the phoneme, re-encode to MP3 in Lambda. | Natural coarticulated sound. | Real audio processing in Lambda (an MP3 encoder is not in the Python runtime); cut points are approximate. **Not recommended** initially. |

Things that do **not** work on neural and should be rejected by the admin validator: `<emphasis>`, `pitch`, whisper/soft phonation, vocal-tract length, `amazon:max-duration` (all **VERIFIED** unavailable), and `say-as characters` (**VERIFIED** engine switch).

### 5.4 The option outside the stated requirement — owner decision only

> **OUTSIDE THE REQUIREMENT.** The specification says Polly is "the proposed synthesiser" (`prompt.md:563`) and that an inadequately rendered sound means the activity stays unpublished (`prompt.md:611`). The following is therefore **not** part of the recommended design. Only the owner can choose it.

**Human-recorded clips for the hard phonemes.** An adult records the 16 or so high-risk sounds once, following the DfE guidance. The files are placed in the same private S3 store under a distinct namespace (for example `provider=recorded`) and delivered by the same authenticated Lambda with the same presigned-URL flow, so the Play button, API, caching and offline behaviour are unchanged.

- For: it is how commercial phonics programmes solve this; guaranteed-correct pure sounds; one-off effort of perhaps an hour.
- Against: those clips are no longer synthesised, which weakens the literal reading of AC-19/AC-21 for them; voice mismatch with Polly clips; needs an upload path and a recording-quality check.
- If the spike shows more than a handful of phonemes are unusable in every voice, this is the question to put to the owner. Until then the plan should assume option 8 (word-level activity design) as the in-scope fallback.

### 5.5 The 44 phonemes — table

**Status of this table.** IPA and X-SAMPA symbols are **VERIFIED** against Polly's en-GB table (<https://docs.aws.amazon.com/polly/latest/dg/ph-table-english-uk.html>). Grapheme-to-phase mapping is **VERIFIED** against Letters and Sounds. The DfE grouping notes are **VERIFIED** (section 5.1). The SSML fragments are **PROPOSALS that have never been synthesised**. The risk ratings are **UNVERIFIED predictions** to be replaced by listening results.

**Reading the SSML column.** Each fragment goes inside one fixed wrapper:

```xml
<speak><break time="150ms"/> FRAGMENT <break time="250ms"/></speak>
```

`PH(x)` abbreviates `<phoneme alphabet="x-sampa" ph="x">GRAPHEME</phoneme>` where GRAPHEME is the first grapheme in the row, or the quoted homophone if one is given. Example: row 1 `SLOW70(PH(s))` expands to `<prosody rate="70%"><phoneme alphabet="x-sampa" ph="s">s</phoneme></prosody>.` — note the closing full stop for falling intonation. `SLOW70(...)` is `<prosody rate="70%">...</prosody>`; `FAST130(...)` is `<prosody rate="130%">...</prosody>`.

#### Consonants (24)

| # | Graphemes (L&S phase) | Example | IPA (Polly) | X-SAMPA | Suggested fragment | Risk | Reason |
|---|---|---|---|---|---|---|---|
| 1 | s, ss (Ph2) | **s**un, mi**ss** | s | `s` | `SLOW70(PH(s))` | Medium | Continuant likely too short; plain text would say "ess". |
| 2 | t (Ph2) | **t**ap | t | `t` | `PH(t)` | High | Unvoiced plosive: release with no vowel is out of distribution — "tuh", "tee" or a click. |
| 3 | p (Ph2) | **p**in | p | `p` | `PH(p)` | High | As /t/; "puh" is the classic fault. |
| 4 | n (Ph2) | **n**et | n | `n` | `SLOW70(PH(n))` | Medium | Nasal continuant; may come out "nuh" or "en". |
| 5 | m (Ph2) | **m**an | m | `m` | `SLOW70(PH(m))`; alternative text `mmm` | Medium | As /n/. "Mmm" exists as an interjection and may render well. |
| 6 | d (Ph2) | **d**og | d | `d` | `PH(d)`; fallback `FAST130(PH(d@))` | High | DfE: not clear in isolation without a small schwa. Goal is a *small* one. |
| 7 | g (Ph2) | **g**ot | g | `g` | `PH(g)`; fallback `FAST130(PH(g@))` | High | As /d/. Plain text risks letter name "jee". |
| 8 | c, k, ck (Ph2) | **c**at, **k**it, du**ck** | k | `k` | `PH(k)` | High | Unvoiced plosive. One clip serves all three graphemes. |
| 9 | r (Ph2) | **r**ed | ɹ | `r\` | `SLOW70(PH(r\))` | High | Approximant; tends to "ruh" or "er". The voices are non-rhotic, so /r/ never occurs without a following vowel in their speech. |
| 10 | h (Ph2) | **h**at | h | `h` | `PH(h)` | High | Voiceless breath with no vowel; may be inaudible or dropped. |
| 11 | b (Ph2) | **b**ed | b | `b` | `PH(b)`; fallback `FAST130(PH(b@))` | High | DfE small-schwa group. |
| 12 | f, ff (Ph2) | **f**an, o**ff** | f | `f` | `SLOW70(PH(f))` | Medium | Quiet fricative; easily confused with /θ/; may be clipped. |
| 13 | l, ll (Ph2) | **l**eg, be**ll** | l | `l` | `SLOW70(PH(l))` | Medium | May become "ul" or "luh". |
| 14 | j (Ph3) | **j**am | d͡ʒ | `dZ` | `PH(dZ)`; fallback `FAST130(PH(dZ@))` | High | Affricate; DfE small-schwa group. Plain text gives letter name "jay". |
| 15 | v (Ph3) | **v**an | v | `v` | `SLOW70(PH(v))` | Medium | Voiced fricative; may add "uh". |
| 16 | w (Ph3) | **w**in | w | `w` | `FAST130(PH(w@))` | High | DfE: cannot be pronounced clearly in isolation. Accept a short "wuh" or redesign as a word. |
| 17 | y (Ph3) | **y**es | j | `j` | `FAST130(PH(j@))` | High | As /w/. Note the X-SAMPA symbol is `j` — easy to confuse with the letter j (row 14). |
| 18 | z, zz (Ph3) | **z**ip, bu**zz** | z | `z` | `SLOW70(PH(z))` | Medium | Buzzing continuant; may be short or gain a vowel. |
| 19 | ch (Ph3) | **ch**ip | t͡ʃ | `tS` | `PH(tS)` | Medium | Unvoiced affricate has an audible release of its own; risk of "chuh". |
| 20 | sh (Ph3) | **sh**op | ʃ | `S` | `SLOW70(PH(S))`; alternative text `shh` | Medium | Probably the easiest consonant: "shh" is a real interjection. Still needs listening. |
| 21 | th — unvoiced (Ph3) | **th**in | θ | `T` | `SLOW70(PH(T))` | High | Very low energy; commonly heard as /f/ or lost. |
| 22 | th — voiced (Ph3) | **th**en | ð | `D` | `SLOW70(PH(D))` | High | Drifts to "the"/"thuh", /d/ or /v/ in isolation. |
| 23 | ng (Ph3) | ri**ng** | ŋ | `N` | `SLOW70(PH(N))` | High | Never word-initial in English; may become "ing", "nuh" or two letter names. |
| 24 | (no L&S grapheme; taught Ph5 as "zh") | vi**s**ion, trea**s**ure | ʒ | `Z` | `SLOW70(PH(Z))` | High | Rare, never initial in native words. Best taught inside a word. |

#### Vowels (20)

| # | Graphemes (L&S phase) | Example | IPA (Polly) | X-SAMPA | Suggested fragment | Risk | Reason |
|---|---|---|---|---|---|---|---|
| 25 | a (Ph2) | **a**nt | æ | `{` | `PH({)` | Medium | Lax vowel; plain `a` is read as the article or the letter name. May lengthen or gain a glottal stop. |
| 26 | e (Ph2) | **e**gg | ɛ | `E` | `PH(E)` | Medium | Lax vowel in isolation. |
| 27 | i (Ph2) | **i**n | ɪ | `I` | `PH(I)` | Medium | May drift towards /iː/. |
| 28 | o (Ph2) | **o**n | ɒ | `Q` | `PH(Q)` | Medium | Lax vowel; plain `o` gives "oh". |
| 29 | u (Ph2) | **u**p | ʌ | `V` | `PH(V)` | Medium | Easily mistaken for schwa in isolation; also the accent-sensitive one (northern /ʊ/). |
| 30 | oo — short (Ph3) | l**oo**k | ʊ | `U` | `PH(U)` | Medium | May drift to /uː/, which is a *different* taught sound (row 35). Must be compared side by side. |
| 31 | ai (Ph3); ay, a-e (Ph5) | r**ai**n | eɪ | `eI` | `PH(eI)` | Low | Identical to the letter name A; a natural utterance. |
| 32 | ee (Ph3); ea, e-e (Ph5) | f**ee**t | iː (table shows `i:`) | `i` | `PH(i)` | Low | Identical to the letter name E. Note Polly's X-SAMPA is `i` with no length mark. |
| 33 | igh (Ph3); ie, i-e (Ph5) | n**igh**t | aɪ | `aI` | `PH(aI)` on text "eye" | Low | Homophone of a word. |
| 34 | oa (Ph3); ow, o-e (Ph5) | b**oa**t | əʊ | `@U` | `PH(@U)` on text "oh" | Low | Homophone of a word. |
| 35 | oo — long (Ph3); ue, ew, u-e (Ph5) | b**oo**t | uː (table shows `u:`) | `u:` | `PH(u:)` on text "ooh" | Low | Natural interjection. |
| 36 | ar (Ph3) | f**ar**m | ɑː | `A:` | `PH(A:)` on text "are" | Low | Homophone; non-rhotic, as intended for the RP-based table. |
| 37 | or (Ph3); aw, au (Ph5) | f**or** | ɔː | `O:` | `PH(O:)` on text "or" | Low | Homophone. |
| 38 | ur (Ph3); ir (Ph5); stressed er | h**ur**t | ɜː | `3:` | `PH(3:)` on text "err" | Low | Close to a hesitation sound; likely fine. |
| 39 | ow (Ph3); ou (Ph5) | c**ow** | aʊ | `aU` | `PH(aU)` on text "ow" | Low | Natural interjection. Distinct from the "snow" pronunciation of `ow` (row 34). |
| 40 | oi (Ph3); oy (Ph5) | c**oi**n | ɔɪ | `OI` | `PH(OI)` on text "oi" | Low | Natural interjection. |
| 41 | ear (Ph3) | d**ear** | ɪə | `I@` | `PH(I@)` on text "ear" | Low | Homophone. |
| 42 | air (Ph3); are (Ph5) | f**air** | ɛə | `E@` | `PH(E@)` on text "air" | Low | Homophone. A long monophthong is an acceptable modern realisation. |
| 43 | ure (Ph3) | s**ure**, p**ure** | ʊə | `U@` | `PH(U@)` | High | Unstable in current southern British speech; may sound like row 37. Letters and Sounds' own example "sure" is often said "shaw". "pure" is /pjʊə/, i.e. with a /j/. |
| 44 | er — unstressed (Ph3) | corn**er** | ə | `@` | `PH(@)` | Medium | Schwa is by definition unstressed; isolated, it tends to sound like row 38 or row 29. Better demonstrated inside "corner". |

#### Combined sounds and split digraphs (not additional phonemes)

| Grapheme (phase) | Example | IPA | X-SAMPA | Suggested fragment | Risk | Reason |
|---|---|---|---|---|---|---|
| x (Ph3) | bo**x** | ks | `ks` | `PH(ks)` | Medium | Two phonemes (**VERIFIED**, L&S). Pronounceable without a vowel; plain text says "eks". |
| qu (Ph3) | **qu**iz | kw | `kw` | `FAST130(PH(kw@))` | High | Two phonemes ending in /w/, so cannot be said without a vowel. Prefer a word. |
| a-e (Ph5) | m**a**k**e** | eɪ | `eI` | reuse row 31 | Low | Same phoneme, same clip. |
| e-e (Ph5) | th**e**s**e** | iː | `i` | reuse row 32 | Low | Same clip. |
| i-e (Ph5) | l**i**k**e** | aɪ | `aI` | reuse row 33 | Low | Same clip. |
| o-e (Ph5) | h**o**m**e** | əʊ | `@U` | reuse row 34 | Low | Same clip. |
| u-e (Ph5) — "rule" | r**u**l**e** | uː | `u:` | reuse row 35 | Low | Same clip. |
| u-e (Ph5) — "cube" | c**u**b**e** | juː | `ju:` | `PH(ju:)` on text "you" | Low | Two phonemes; identical to the letter name U and the word "you". |

**Clip reuse.** `c`/`k`/`ck`, `f`/`ff`, `l`/`ll`, `s`/`ss`, `z`/`zz` and every split digraph share a clip with an existing row. A content-addressed cache key (section 9) deduplicates them automatically if the SSML is byte-identical, which is an argument for generating fragments from a template rather than typing them by hand.

**Totals.** 44 phonemes plus /ks/, /kw/ and /juː/ gives 47 sound clips. My predicted risk split for the 44 is **16 high** (15 consonants plus /ʊə/), **16 medium** (9 consonants, 7 vowels) and **12 low** (all long vowels and diphthongs), with /kw/ high, /ks/ medium and /juː/ low.

### 5.6 Letter names

A letter name and a phoneme are different intended outputs (`prompt.md:595`). They must be different speech definitions with different IDs, and the admin UI should label which is which.

- **PROPOSAL** — produce each name with `<phoneme>` around the capital letter, *not* `say-as characters`. X-SAMPA for the British names (my transcription, **UNVERIFIED** until heard): A `eI`, B `bi`, C `si`, D `di`, E `i`, F `Ef`, G `dZi`, H `eItS`, I `aI`, J `dZeI`, K `keI`, L `El`, M `Em`, N `En`, O `@U`, P `pi`, Q `kju:`, R `A:`, S `Es`, T `ti`, U `ju:`, V `vi`, W `dVb@lju:`, X `Eks`, Y `waI`, Z `zEd`.
- Risk: **low** for pronunciation (these are ordinary syllables), **medium** for consistency because of the documented neural-to-standard switch during spelling.
- Check **Z is "zed"**, not "zee", and that H is "aitch".
- A, E, I, O, U names are the same audio as rows 31, 32, 33, 34 and /juː/. Whether to share clips or keep separate definitions is a content decision; separate definitions with identical SSML still share one S3 object.

### 5.7 Digraphs, blends and whole words

- **Digraphs** (`ch sh th ng ai ee ...`) are single phonemes and are covered by the table.
- **Blends / adjacent consonants** (`st`, `tr`, `fl`, Letters and Sounds Phase Four) are *not* phonemes. Letters and Sounds advises avoiding adjacent consonants in early oral blending (**VERIFIED**). An isolated "st" clip is high risk and pedagogically doubtful. **PROPOSAL** — teach blends through whole words ("stop") or through client-side sequencing of the single-phoneme clips (option 9).
- **Whole words** are plain reviewed text and are low risk. Remaining hazards: homographs ("read", "wind", "bow") — use `<w role>` or `<phoneme>`; and a one-word sentence sounding abrupt — end with a full stop.
- **Sound-talk** for blending activities ("c - a - t ... cat") is best assembled from approved clips so that /k/ is the identical /k/ the child heard before.

### 5.8 Milestone 0 listening spike (PROPOSAL)

The spec requires resolving poor pronunciation "before scaling the content bank" (`prompt.md:1268`).

1. Confirm the voice list with `DescribeVoices` (engine neural, en-GB, eu-west-2).
2. Fixed test set: the 47 sounds above, 26 letter names, about 10 words, about 3 sound-talk sequences.
3. Run it through Amy, Emma, Brian and Arthur on neural with the suggested fragment for each row.
4. For every medium/high row, also try: bare `PH(x)` with no prosody; the small-schwa fallback; the anchor-word form.
5. Optional comparison passes: Amy and Brian on generative; Amy, Emma, Brian on standard. Record them as engine deviations, not as the default.
6. Also answer the open mechanical questions: does a single-consonant `ph` render at all; are invalid symbols rejected or ignored; do leading/trailing `<break>` tags produce silence; are IPA and X-SAMPA outputs identical; does 48000 Hz work on neural and does it help /f/ versus /θ/; what is the MP3 bitrate and clip size.
7. Score each clip on the checklist in section 14, on laptop speakers *and* headphones, ideally with a second adult and, for the shortlist, one of the children.
8. Output: one chosen voice, a per-phoneme verdict (publishable / publishable with small schwa / word-only), and a frozen SSML template set.

Estimated spend: well under $1 (section 4.5 arithmetic). Estimated effort: half a day including listening.

---

## 6. (e) Presigned URLs generated inside Lambda

### 6.1 Lifetime is bounded by the signing credentials

- **VERIFIED** — "If you created a presigned URL using a temporary credential, the URL expires when the credential expires ... This is true even if the URL was created with a later expiration time." For IAM role credentials: "The presigned URL expires when the role session expires, even if you specify a longer expiration time." Source: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html>.
- **VERIFIED** — "A presigned URL expires at either its configured expiration time or when its associated credentials expire, whichever occurs first" (same page, FAQ). The failure appears as `ExpiredToken`.
- **VERIFIED** — S3 checks expiry "at the time of the HTTP request"; a download in progress continues past the expiry, but a restarted one fails.
- **VERIFIED** — the SigV4 maximum is 604,800 seconds (7 days), minimum 1 second (<https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-authentication-methods.html>). Irrelevant here because role credentials are far shorter.
- **VERIFIED** — "Lambda automatically assumes your execution role when you invoke your function" (<https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html>). The page says nothing about how long those credentials last.
- **UNVERIFIED** — the actual lifetime of Lambda execution-role credentials. I found no official figure; community posts quote anything from 1 to 12 hours. Treat it as unknown and design so it does not matter.
- The precise statement for the plan: *effective lifetime = min(requested `ExpiresIn`, time remaining on the execution-role session credentials held by that Lambda execution environment at signing time)*. A warm environment may sign with credentials that are close to expiry, so an occasional early failure is possible in principle.

### 6.2 Recommended expiry (PROPOSAL)

- **`ExpiresIn = 300` seconds.** The browser uses the URL within a second or two; five minutes covers a slow connection and one retry; it is short enough that a leaked URL is nearly worthless; and it is far below any plausible credential lifetime. AWS's own guidance notes that 60 seconds "is practical given the right conditions" (<https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/overview.html>), so anything in the 60-300 range is defensible.
- **Client rule:** on HTTP 403 from the S3 fetch, call the speech API again once for a fresh URL, then surface Retry. Never count it as an answer attempt (`prompt.md:615`).
- **Never persist the URL.** The spec is explicit that the URL "is a temporary delivery mechanism, not the persistent offline cache" (`prompt.md:583`). Persist the bytes.
- **Offline-pack rule:** fetch each clip's bytes immediately after obtaining its URL. Do not collect 80 URLs first and download later.
- **Optional guard:** a bucket-policy `Deny` when `s3:signatureAge` exceeds 600000 ms (10 minutes). The S3 page gives exactly this example (**VERIFIED**). It caps the damage if code ever requests a long expiry by mistake.

### 6.3 SigV4 and the regional endpoint

- **VERIFIED** — boto3's guide: "It is recommended to configure the S3 client with Signature Version 4 (`s3v4`), the AWS region of the bucket and to use virtual-hosted style addressing `s3={'addressing_style': 'virtual'}` when generating presigned URLs." Source: <https://docs.aws.amazon.com/boto3/latest/guide/s3-presigned-urls.html>.
- **VERIFIED** — a SigV4 signature is scoped to a region: the credential string is `<key>/<date>/<aws-region>/s3/aws4_request`. URLs signed with STS credentials carry an `X-Amz-Security-Token` parameter.
- **VERIFIED (search-result level only; page body would not load)** — "Any new regions after January 30, 2014 will support only Signature Version 4" (S3 API reference, "Specifying the Signature Version in request authentication").
- **UNVERIFIED (memory)** — London launched after that date, so SigV2 is not an option there; and a URL built on the global `s3.amazonaws.com` host for a bucket in another region can be answered with a redirect, which breaks a cross-origin `fetch`.
- **PROPOSAL** — create the S3 client once at module scope with explicit `region_name="eu-west-2"`, `signature_version="s3v4"`, virtual addressing, and (belt and braces) `endpoint_url="https://s3.eu-west-2.amazonaws.com"`. Add a unit test asserting that a generated URL's host ends with `.s3.eu-west-2.amazonaws.com` and that the query string contains `X-Amz-Algorithm=AWS4-HMAC-SHA256`. That test needs no AWS access because signing is a local calculation (**UNVERIFIED** but long-standing SDK behaviour) — which also means a URL can be generated for a key that does not exist, so the Lambda must confirm existence first.
- **VERIFIED** — the signer needs permission for the operation: "the presigned URL must be created by someone who has permission to perform the operation". The Lambda role therefore needs `s3:GetObject` on the audio prefix.
- **PROPOSAL** — use SSE-S3 (AES256), matching the bootstrap module's bucket convention recorded in `00-verified-repo-facts.md` (lines 83-84). SSE-KMS would add `kms:Decrypt` to the role and a KMS call per download for no benefit here.

### 6.4 S3 CORS for a browser `fetch()` from two origins

- **VERIFIED** — S3 uses "the first `CORSRule` rule that matches"; the request `Origin` must match `AllowedOrigins`, the method must be in `AllowedMethods`, and preflight `Access-Control-Request-Headers` must match `AllowedHeaders`. Up to 100 rules. `AllowedMethods` can only be GET, PUT, POST, DELETE, HEAD. An origin string may contain at most one `*`. "The ACLs and policies continue to apply when you enable CORS." Sources: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html>, <https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html>.
- **VERIFIED** — failures show as `403 Forbidden ... CORS is not enabled for this bucket` or `This CORS request is not allowed` (<https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors-troubleshooting.html>).
- **UNVERIFIED (standard web behaviour, not re-read today)** — a plain `fetch(url)` GET with no custom request headers is a "simple" CORS request: the browser sends `Origin` and does not preflight. So `AllowedHeaders` and `MaxAgeSeconds` are not exercised in the normal path.
- Why CORS is needed at all: an `<audio src="...">` element can *play* a cross-origin URL without CORS, but script cannot read the bytes. The requirement is to keep the bytes (`prompt.md:581`, `prompt.md:699`), so the fetch must be CORS-readable. The spec states this at `prompt.md:621`.

**Recommended configuration (PROPOSAL)** — origins from the confirmed product domains (`prompt.md:103-107`); supply them through a Terraform variable rather than hard-coding:

```json
[
  {
    "AllowedOrigins": [
      "https://aliens.jackgl.com",
      "https://admin.aliens.jackgl.com"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": [],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

| Element | Value | Why |
|---|---|---|
| `AllowedOrigins` | The two exact HTTPS origins. No `*`, no wildcard subdomain. | Least privilege. `https://*.aliens.jackgl.com` would *not* match the apex player origin anyway. |
| `AllowedMethods` | `GET`, `HEAD` | Download only. Never `PUT`: browsers must not upload. |
| `AllowedHeaders` | empty | No custom request headers are sent. If a future client adds one (for example `Range`), add exactly that header then. |
| `ExposeHeaders` | `ETag` (optional) | Only needed if script reads `ETag`. `Content-Type` and `Content-Length` are readable without exposure (**UNVERIFIED**, standard safelist). If integrity is checked with a SHA-256 from the API response instead (recommended), this can be empty. |
| `MaxAgeSeconds` | 3000 | Only affects preflight caching; harmless. 3000 is the value in AWS's own example. |

Local development against the production bucket would need a `http://localhost:<port>` origin. **PROPOSAL** — keep it out of the default production variable and add it deliberately, if at all.

### 6.5 Content type and caching headers

- **VERIFIED** — Polly returns `Content-Type: audio/mpeg` for mp3. **PROPOSAL** — set `ContentType="audio/mpeg"` on `PutObject` so S3 serves it; do not rely on defaults.
- **VERIFIED** — `GetObject` accepts `response-content-type`, `response-cache-control` and similar overrides, and "you must sign the request" to use them (<https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html>). So they can be baked into the presigned URL if ever needed. Not needed if the object metadata is right.
- Caching reasoning (**PROPOSAL**): every presigned URL is unique (timestamp and signature), so the browser's HTTP cache can never produce a hit across two Play presses. The app's own byte store is the real cache. Therefore:
  - call `fetch(url, { cache: "no-store" })` to avoid storing the bytes twice and to keep signed URLs out of the browser's disk cache;
  - store the object with `Cache-Control: private, no-store`. Revisit only if audio is later fronted by CloudFront, where long immutable caching would make sense.
- **PROPOSAL** — return `sha256` (hex of the MP3 bytes), `contentType`, `byteLength`, `cacheKey` and `expiresAt` in the API response alongside the URL. The client verifies the hash with `crypto.subtle.digest` before storing. This catches truncated downloads and corrupted local storage, and lets the client skip the S3 download entirely when it already holds bytes with that hash.

### 6.6 Why the URL must not be logged

- **VERIFIED** — "presigned URLs are bearer tokens that grant access to those who possess them" (S3 user guide). "It should be treated as a temporary access credential" (<https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/logging-interactions.html>).
- **VERIFIED** — AWS recommends that "URI logging redact the `X-Amz-Signature` query string parameter, redact the entire query string, or treat the information as highly confidential". S3 server access logs and CloudTrail data events already redact the signature. CloudWatch Logs can mask with a custom data identifier; AWS's suggested pattern is `X-Amz-Signature=[a-f0-9]{64}`.
- Where it could leak in *this* design (my analysis):
  - Lambda logs — never log the response body or the URL; log the cache key and a request ID instead.
  - Any "log the whole event/response" debugging helper.
  - Browser `console.log`, error-reporting payloads, and thrown `Error` messages that embed the URL.
  - React state or local storage — keep the URL in a local variable only.
- The spec requires this at `prompt.md:623`.

### 6.7 The alternative the spec did not choose — returning bytes through the API (flag only)

| | Presigned URL (spec's proposal) | Bytes inline in the API response |
|---|---|---|
| Round trips to first sound | Two (API, then S3) | One |
| S3 CORS, signing, expiry handling | Required | Not needed |
| Leak surface | A short-lived bearer URL | None beyond the normal API response |
| Size limits | None that matter | **VERIFIED**: Lambda synchronous response 6 MB; HTTP API payload 10 MB. Binary must be base64 with `isBase64Encoded` (payload format 2.0), about one-third larger. Phonics clips are a few KB (**UNVERIFIED** size), so the limits are not close. |
| Lambda work per request | Metadata lookup plus local signing | Must read the object from S3 every time |
| Fit with the spec | Exactly as written (`prompt.md:579`) | A deviation |

**Recommendation:** keep presigned URLs as specified. Record the inline alternative as the fallback if the spike shows the second round trip dominates time-to-audio or if S3 CORS proves troublesome in a target browser.

---

## 7. (f) Browser playback of cached bytes

### 7.1 Two ways to play bytes

| | Blob + object URL + `HTMLAudioElement` | Web Audio `decodeAudioData` + `AudioBufferSourceNode` |
|---|---|---|
| Code size | Smallest | A little more |
| Start latency for a stored clip | Tens of milliseconds (**UNVERIFIED**) | Lowest once decoded |
| Sequencing several clips | Chain on `ended`; timing loose by tens of ms | Sample-accurate scheduling |
| Autoplay unlock | Per element; see 7.2 | Resume one `AudioContext` in a gesture, then start any time |
| Memory | Compressed bytes only | Decoded PCM, resampled to the context rate (**VERIFIED** resampling). Roughly 190 KB per second of mono audio at 48 kHz (my arithmetic) — decode lazily. |
| Lifecycle chore | Revoke object URLs | Keep a copy of the bytes: decoding consumes the buffer (**UNVERIFIED** today; long-standing behaviour) |
| Relationship to Phaser | Independent | Phaser defaults to Web Audio and exposes `this.sound.context` and `this.sound.decodeAudio(key, arrayBuffer)` (**VERIFIED**, <https://docs.phaser.io/phaser/concepts/audio>) |

- **VERIFIED** — `decodeAudioData` "only works on complete file data, not fragments"; it is "Baseline Widely available ... since April 2021" (<https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData>).
- **VERIFIED** — MDN: buffer nodes are the common choice for "shorter, more sample-like tracks"; media elements for full-length tracks (<https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices>).

**Recommendation (PROPOSAL).** Start with **one shared `HTMLAudioElement`** behind a tiny interface (`play(bytes)`, `stop()`, an ended/error callback). It is the least code for someone learning, it does not depend on Phaser (the admin app has no Phaser), and it meets every stated requirement. Switch the implementation behind the same interface to Web Audio only if the spike shows (a) Safari rejecting `play()` after the asynchronous fetch, or (b) audible gaps when sequencing sound-talk clips.

### 7.2 Autoplay policy and user gestures

- **VERIFIED** — MDN: autoplay is allowed if the audio is muted, **or "the user has interacted with the site (by clicking, tapping, pressing keys, etc.)"**, or the site is allow-listed. "web browsers' autoplay policies also apply to any script-initiated playback of media, including calls to `play()`."
- **VERIFIED** — a blocked `play()` rejects its promise with `NotAllowedError`; an unsupported source rejects with `NotSupportedError` (<https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play>).
- **VERIFIED** — Chrome: autoplay with sound is allowed when "The user has interacted with the domain (click, tap, etc.)". An `AudioContext` created before a gesture starts "suspended" and needs `resume()` after one (<https://developer.chrome.com/blog/autoplay>).
- **VERIFIED** — autoplay of media and Web Audio is gated by **sticky** activation, which "is not reset after it has been set initially" (<https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation>). Activation-triggering events include `keydown` (not Esc), `mousedown`, `pointerdown`.
- **VERIFIED** — WebKit: on macOS, developers should "assume any use of `<video>` or `<audio>` requires a user gesture click to play", and "Auto-play restrictions are granted on a per-element basis" — reuse one element and change its source rather than creating new ones (<https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/>).

What this means for the Play button:

- The Play press is a real gesture, and by then the child has already signed in and clicked many times, so sticky activation exists. In Chrome, Edge and Firefox the later `play()` call — after the API and S3 round trips — should be allowed.
- **Safari is the one to test.** The WebKit post does not say whether a `play()` that runs *after an awaited network call* still counts as gesture-initiated (**UNVERIFIED**). Mitigations, all cheap:
  1. Reuse a single audio element for the whole session.
  2. In the click or keydown handler, *synchronously* prime that element (or `resume()` the `AudioContext`) before the first `await`.
  3. If `play()` still rejects with `NotAllowedError`, the bytes are already downloaded — show Play again; the second press plays instantly from memory. This must not count as an attempt.
- Keyboard activation: Enter and Space fire `keydown`, which is an activation event, so keyboard users are covered (`prompt.md:619`).
- Never call `play()` on page load, on activity display, or on tab return. The spec has no auto-played audio, and it would be blocked anyway.

### 7.3 MP3 support on laptop browsers

- **VERIFIED** — MDN's audio codec guide lists MP3 as supported in Chrome, Edge, Firefox, Opera and Safari (Safari since 3.1), and states "MP3 ... is supported by all major browsers". Patents have expired. Firefox has decoded MP3 natively since version 71 (<https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs>).
- **VERIFIED** — the MP3 standard's sample rates are 32000/44100/48000 Hz (MPEG-1) and **16000/22050/24000 Hz (MPEG-2)**. Polly's neural default of 24000 Hz is therefore a standard MP3 rate.
- **PROPOSAL** — do not use 8000 Hz: it is not in MDN's list of MP3 sample rates and is telephone quality anyway.
- **UNVERIFIED** — current-version behaviour on the owner's actual laptops. The spec requires testing "the actual supported browser matrix" (`prompt.md:1046`). Add a one-clip smoke test per browser to the spike.
- `ogg_vorbis` and `ogg_opus` are also offered by Polly but have weaker Safari history; MP3 is the right single format, and it is what the spec names (`prompt.md:577`).

### 7.4 Stopping overlapping playback

**PROPOSAL** — one module owns all phonics playback:

- A single element means starting a new clip implicitly ends the old one. Before changing source: `pause()`, reset `currentTime` to 0, revoke the previous object URL.
- A monotonically increasing "play token": when an asynchronous load finishes, play only if its token is still the latest. This prevents a slow first request from talking over a later one.
- An `AbortController` per in-flight API/S3 request, aborted on Stop, on navigating away from the activity, and on sign-out.
- Stop phonics audio when the page becomes hidden (the spec already pauses combat then, `prompt.md:273`).
- Button states from the spec: Play, Loading, Stop/Replay, Retry (`prompt.md:587`). Loading disables re-press; that is the debounce.
- With Web Audio instead: keep a reference to the current source node and call `stop()` on it; its `onended` drives the button state.

### 7.5 Object URLs

- **VERIFIED** — `URL.createObjectURL()` returns a string URL referencing the Blob; "To release an object URL, call `revokeObjectURL()`"; revoking an already-revoked or invalid URL "does nothing"; neither method is available in service workers (<https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static>, <https://developer.mozilla.org/en-US/docs/Web/API/URL/revokeObjectURL_static>).
- **PROPOSAL** — create the Blob with `type: "audio/mpeg"`. Create one object URL per playback and revoke it on `ended`, on `error`, on Stop, and when replaced. Revoke everything on sign-out and on unmount. Do not revoke immediately after setting `src` — the element may not have loaded it yet.
- An object URL is not persistent across reloads. What is persisted is the bytes.

### 7.6 Persisting bytes (brief — another specialist owns offline storage)

- **PROPOSAL** — store `{cacheKey, sha256, contentType, byteLength, bytes}` keyed by `cacheKey`. Clips contain no personal data, so the audio store can be shared between accounts on one laptop while progress data stays account-scoped (`prompt.md:227`). The lead should confirm that reading of the account-scoping rule.
- "Offline-ready" for a run means every clip the pack references is present *and* its hash verifies (`prompt.md:701`).
- A missing clip offline is an availability problem, not a wrong answer (`prompt.md:713`).

---

## 8. (g) IAM least privilege

### 8.1 Polly

- **VERIFIED** — Polly "Policy condition keys (service-specific): **No**"; resource-based policies: No (<https://docs.aws.amazon.com/polly/latest/dg/security_iam_service-with-iam.html>).
- **VERIFIED** — the only resource type is `lexicon` (`arn:${Partition}:polly:${Region}:${Account}:lexicon/${LexiconName}`); the only condition keys are the tag keys `aws:RequestTag/*`, `aws:ResourceTag/*`, `aws:TagKeys` (IAM service reference data for Polly, <https://servicereference.us-east-1.amazonaws.com/v1/polly/polly.json>, fetched today).
- **VERIFIED** — "A request without lexicons isn't associated with a lexicon resource, so a statement that allows `polly:SynthesizeSpeech` only on lexicon ARNs denies it" (<https://docs.aws.amazon.com/polly/latest/dg/security_iam_id-based-policy-examples.html>).

Consequences:

- The statement has to be `Action: polly:SynthesizeSpeech`, `Resource: "*"`.
- **IAM cannot limit voice, engine, language, sample rate or text length.** Those limits live in Lambda code as a server-side allow-list, which the spec already requires for the preview route (`prompt.md:589`).
- **PROPOSAL** — add the global condition `aws:RequestedRegion = eu-west-2` to keep synthesis in London (**UNVERIFIED** that I re-read the global-key page today; it is a standard global key).
- Do **not** grant: `polly:StartSpeechSynthesisTask` (asynchronous, writes to S3 itself), `polly:StartSpeechSynthesisStream`, any lexicon action, or `polly:*`. `polly:DescribeVoices` is not needed at runtime; the allow-list is configuration.

### 8.2 S3

**PROPOSAL** for the TTS Lambda's execution role:

| Permission | Resource | Why |
|---|---|---|
| `s3:GetObject` | `arn:aws:s3:::<audio-bucket>/tts/v1/*` | Lets its presigned GET URLs work; also covers `HeadObject`. |
| `s3:PutObject` | same prefix | Store newly synthesised clips. |
| `s3:ListBucket` | the bucket, with condition `s3:prefix` like `tts/v1/*` | Only if the Lambda uses `HeadObject` as its existence check: without list permission a missing key returns 403 rather than 404 (**UNVERIFIED**, long-standing S3 behaviour), which would hide real permission faults. Not needed if existence is tracked in DynamoDB (section 9.5). |
| *(none)* | — | No `s3:DeleteObject`, no ACL or policy actions, no access to other prefixes or buckets. |

Bucket settings (**PROPOSAL**, mirroring the conventions the bootstrap module applies to its state bucket — `00-verified-repo-facts.md` lines 83-84): Block Public Access on, `BucketOwnerEnforced`, TLS-only bucket policy, SSE-S3, versioning on, `force_destroy = false`, and **no lifecycle expiry on the published-audio prefix**.

Immutability (**VERIFIED** mechanism): `PutObject` with `If-None-Match: *` fails with `412 Precondition Failed` if the key exists; it needs only `s3:PutObject`; concurrent writers resolve to "first write wins"; a bucket policy can require the header using the `s3:if-none-match` condition key (<https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html>, <https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html>). **PROPOSAL** — always write with `If-None-Match: *` and treat 412 as "someone else stored it; use theirs".

### 8.3 No credentials in the browser

- The browser holds only Cognito user-pool tokens and, transiently, a presigned URL. No Cognito *identity pool*, no AWS SDK for Polly or S3 in the front end, no access keys in any bundle. This is the spec's rule (`prompt.md:589`, `prompt.md:775`).
- A simple release check (**PROPOSAL**): search the built front-end assets for `polly`, `AKIA`, `ASIA` and `aws-sdk`; expect no matches.

### 8.4 Player route versus admin preview route

Because IAM cannot tell the two uses apart, the separation is enforced by the API route's JWT authorisation plus code paths:

- Player route: accepts identifiers only (run, activity, content version, audio variant); resolves an **approved** speech definition; verifies the caller owns the run. It never receives text or SSML (`prompt.md:589`, AC-20).
- Admin preview route: requires the admin group/scope checked in the backend (AC-04); validates SSML against a tag allow-list, a symbol allow-list for `ph`, a length cap and the voice/engine allow-list.
- **PROPOSAL** — one dedicated TTS Lambda serving both routes (the spec warns against a forwarding Lambda, `prompt.md:585`). If stricter isolation is wanted later, deploy the same package as two functions with two roles.
- SSML validation must use an XML parser with DTDs and entity declarations rejected outright, to avoid entity-expansion attacks from pasted input (**PROPOSAL**).

---

## 9. (h) Cache-key recipe

The spec's rule: identity "must include canonical approved text/SSML, locale, voice, engine, output settings and content/generation version"; objects are immutable; "Account names and DOB are never part of the audio text or cache key" (`prompt.md:591`).

### 9.1 Inputs to hash (PROPOSAL)

Hash exactly the parameters that can change the bytes Polly returns, plus two salts:

| Field | Example | Why it must be in the hash |
|---|---|---|
| `keySchema` | `1` | Lets the recipe itself change without colliding with old keys. |
| `provider` | `polly` | Leaves room for another namespace without ambiguity. |
| `engine` | `neural` | Different engine, different audio. Never rely on Polly's default (which is `standard`). |
| `voiceId` | `Amy` | |
| `languageCode` | `en-GB` | The spec lists locale explicitly. |
| `textType` | `ssml` | Same characters as text and as SSML give different audio. |
| `text` | the canonical SSML string | The exact bytes sent to Polly. |
| `outputFormat` | `mp3` | |
| `sampleRate` | `24000` | Send it explicitly; never rely on the default. |
| `lexicons` | `[]` | Empty now. If lexicons were ever used, include each lexicon's name **and a hash of its content**. |
| `generation` | `1` | An integer bumped deliberately to force new audio — for example after rejecting a clip, or if AWS changes a voice. |

Not in the hash: user, run, activity ID, content version, timestamps, requester role. Those belong to the *mapping* from an activity's audio variant to a cache key, which lives in the immutable speech-definition record.

### 9.2 Canonicalisation (PROPOSAL)

1. Normalise the SSML to Unicode NFC. IPA symbols have look-alike code points (length mark versus colon, script g versus ASCII g), so normalisation alone is not enough — which is why the next point matters.
2. Prefer **X-SAMPA** in stored definitions: it is plain ASCII, so there is no code-point ambiguity. Because its stress mark is `"`, delimit the `ph` attribute with single quotes or escape as `&quot;`.
3. Trim leading and trailing whitespace; replace line breaks with a single space; collapse runs of spaces. Do this **once, when the definition is saved**, and store the result.
4. The rule that keeps everything honest: **hash exactly the string you send to Polly.** No normalisation happens between hashing and sending.
5. Serialise the fields as JSON with sorted keys, no insignificant whitespace, UTF-8. SHA-256 the bytes. Use lower-case hex.

### 9.3 Naming scheme (PROPOSAL)

```
tts/v1/polly/<engine>/<languageCode>/<voiceId>/<format>-<sampleRate>/<first 2 hex>/<sha256 hex>.mp3
tts/v1/polly/<engine>/<languageCode>/<voiceId>/<format>-<sampleRate>/<first 2 hex>/<sha256 hex>.json
```

- The readable segments are redundant with the hash; they exist so a human or a lifecycle rule can reason about the bucket.
- The `.json` sidecar stores the canonical input document, the SHA-256 of the MP3 bytes, `byteLength`, Polly's `RequestCharacters`, and the creation time. This is the "content metadata used to reproduce them" the spec's asset inventory asks for (`prompt.md:1088`).
- Nothing in the path or the sidecar identifies a person. Do not record *who* triggered synthesis in S3; put that in ordinary request logs if needed.

### 9.4 Review binds to bytes, not to parameters (PROPOSAL — important)

A cache key guarantees "same request parameters". It does not guarantee "same audio" if AWS updates a voice model. AWS says so explicitly for generative and long-form voices (**VERIFIED**); it does not say either way for neural (**UNVERIFIED**).

- Admin **Preview** synthesises into the *final* content-addressed key. What the operator hears is the object players will get.
- **Publish** records, in the immutable speech definition, the cache key **and the SHA-256 of the reviewed bytes**.
- The published prefix has no lifecycle expiry, no delete permission, and conditional writes. A reviewed clip is never regenerated by accident.
- A player-route **cache miss for a published definition** should therefore not happen. The Lambda still synthesises on a miss, as the spec's flow describes (`prompt.md:577`), but should emit a metric and a log line ("unreviewed regeneration") so the operator re-listens. A stricter alternative — refuse and return `SPEECH_UNAVAILABLE` — is the lead's call.
- To change a clip, bump `generation` (or edit the SSML). That yields a new key; old runs keep the old object (`prompt.md:591`, AC-23).

### 9.5 Where existence is tracked (PROPOSAL)

The spec lists "Audio metadata where needed" as a DynamoDB record family (`prompt.md:850`). One small item per cache key (`sha256`, `byteLength`, `durationMs` if measured, `requestCharacters`, status) lets the Lambda answer a cache hit with **one `GetItem` and a local signing step — no S3 call at all**. Write order on a miss: conditional `PutObject`, then the metadata item. If the item is missing but the object exists, the conditional put returns 412 and the Lambda repairs the item.

---

## 10. (i) Throttling and abuse

### 10.1 What can actually be abused

- **Player route.** It resolves approved definitions only, so the set of possible syntheses is finite: published clips times allowed voice settings. Each can cost Polly money at most once. The remaining exposure is ordinary request volume (API Gateway, Lambda, DynamoDB, S3).
- **Admin preview route.** This is the only path that can cause unbounded novel synthesis. It is admin-only, but it deserves its own length cap and a daily character budget.

### 10.2 Server-side controls

| Control | Verified facts | Proposal |
|---|---|---|
| **HTTP API route throttling** | Route-level settings `ThrottlingRateLimit` and `ThrottlingBurstLimit` override account limits for a stage or route; token bucket; excess gets `429 Too Many Requests`; "applied on a best-effort basis ... targets rather than guaranteed request ceilings"; account default 10,000 RPS with 5,000 burst (<https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html>, <https://docs.aws.amazon.com/apigateway/latest/developerguide/limits.html>). | Player speech route: start around **20 RPS, burst 40**. Admin preview route: **2 RPS, burst 5**. Starting values to tune. |
| | The limit is per route, shared by every caller — not per user (**UNVERIFIED** that HTTP APIs have no per-client usage plans; that is my recollection). | One noisy client can starve another. Acceptable for a family; note it as a scaling item. |
| **Lambda reserved concurrency** | It is both a floor and a ceiling, costs nothing extra, and can be set to 0 to stop a function. "You can reserve up to the Unreserved account concurrency value minus 100." "New AWS accounts have reduced concurrency ... quotas" (<https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html>, <https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html>). | Reserve about **4** for the TTS function: it caps simultaneous Polly calls under the 8 TPS neural quota and caps cost. **Check the account's concurrency quota first** — in a new account with a low quota, the "minus 100" rule can make any reservation impossible. If so, rely on route throttling and client concurrency, and request a quota increase. |
| **Cache-first** | — | Check the cache before anything expensive. Pre-warm at publish so players only hit the cache. |
| **Per-user miss limit** | — | Count cache *misses* per Cognito subject in DynamoDB (for example a per-minute and per-day counter). Hits are cheap and need no limit. |
| **Preview validation** | Polly's hard cap is 3,000 billed / 6,000 total characters. | Cap preview input far lower (for example 300 total characters), allow-list tags and `ph` symbols, allow-list voice/engine/sample rate, add a daily character budget. |
| **Timeouts and retries** | HTTP API maximum integration timeout is **30 seconds**, not adjustable (<https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html>). | Lambda timeout about 10 s; short SDK connect/read timeouts; at most 2-3 SDK attempts with backoff and jitter so the whole thing fits well inside 30 s. |
| **Error translation** | Polly throttling arrives as HTTP 400 `ThrottlingException`; service faults as 500 `ServiceFailureException`. | Map throttling to API `429` with `Retry-After`; service faults to `503` with a `SPEECH_UNAVAILABLE` category (`prompt.md:952-954`). An `InvalidSsmlException` on the *player* route means a published definition is broken — raise an alarm. |
| **Monitoring** | Polly publishes `ResponseLatency`, `RequestCharacters`, `4XXCount`, `5XXCount` per operation. | Alarm on Polly 4XX/5XX, on Lambda throttles, and on the "unreviewed regeneration" metric. A `RequestCharacters` alarm is a cheap cost tripwire. |

Duplicate synthesis race: two requests for the same uncached clip may both call Polly. With `If-None-Match: *` the second store gets 412 and both callers are given the first object. The waste is a few characters.

### 10.3 What the client should do (PROPOSAL)

- **Debounce by state**, not by timer: once Loading, the button does not issue another request.
- **One in-flight request per clip**: keep a map from clip ID to the pending promise; a second caller awaits the same promise.
- **Latest wins**: use the play token from section 7.4.
- **Abort** on Stop, on leaving the activity, on sign-out.
- **Retry** 429 and 5xx at most twice with exponential backoff plus jitter, honouring `Retry-After`; then show Retry. On 403 from S3, fetch a new URL once.
- **Never** turn a failure into an answer attempt, a reward, or a revealed-as-ready question (`prompt.md:615-617`, AC-22).
- An expired sign-in (401) is a re-authentication prompt, not a speech failure.

### 10.4 One requirement the lead must interpret

The spec says: "Normal online Play requests reach the service even when generated audio already exists; the Lambda may reuse its cache" (`prompt.md:587`), and AC-19 says Play "calls the authenticated TTS API and dedicated Lambda while online". It also says the browser retains "a local copy for appropriate replay/offline use" (`prompt.md:581`).

**PROPOSAL** for reconciling them:

- **Online, first Play of a presentation:** always call the API. If the returned `sha256` matches bytes already held locally (for example from the offline pack), skip the S3 download and play the local bytes. The service was reached; no data was wasted.
- **Replay** within the same presentation: play local bytes with no API call.
- **Offline:** local bytes only; never pretend to call the service (`prompt.md:717`).

This choice sets the request volume the throttles must allow, so it should be stated as an explicit decision in the plan.

---

## 11. (j) Preparing an offline pack (30-80 clips in a burst)

### 11.1 Implications

- **If publishing pre-warms the cache**, every pack request is a cache hit: one API call (DynamoDB read plus local signing) and one small S3 GET. Polly is not involved, so its 8 TPS quota is irrelevant to players.
- **If some clips are cold**, each miss is one `SynthesizeSpeech`. With reserved concurrency of 4 and synthesis taking perhaps half a second (**UNVERIFIED**), the function can approach the 8 TPS quota; SDK backoff absorbs the occasional throttle. Eighty cold clips would still finish in well under a minute (**estimate**).
- **API Gateway:** 80 requests at client concurrency 4 with fast responses can momentarily reach 15-20 RPS. That is why the route limit in 10.2 is 20/40 rather than something tighter. A 429 here is expected behaviour, not an error to show the child.
- **Presigned URLs:** download each clip straight after getting its URL (section 6.2).
- **Sibling starts a pack at the same time:** the shared route limit and the reserved concurrency are split between them. Both complete, a little slower.
- **Honesty requirement:** the run is "offline-ready" only when every referenced clip is stored and verified; otherwise show progress and a clear missing-content state (`prompt.md:701`).

### 11.2 Recommended client behaviour (PROPOSAL)

- **Concurrency: 3 clip pipelines in parallel** (4 at most). Each pipeline is "request URL, download bytes, verify hash, store".
- Skip clips whose hash is already stored.
- On 429 or 503: back off with jitter and **halve the concurrency** for the rest of the pack.
- Give interactive Play presses priority over background pack work (a small queue with two priorities).
- Make it resumable: a reload or a dropped connection continues from what is already stored.
- Order the work so the first few waves' clips arrive first; the child can start playing while the rest downloads.
- Three is chosen because it keeps the pack comfortably under the route limit even alongside a second user, stays far below the browser's per-host connection limits, and still finishes quickly. It is a starting value to measure.

### 11.3 A batch route — later, only if measured need (PROPOSAL)

A single call returning URLs for up to roughly 20 clips would cut 80 API calls to four. It is still the same service and the same Lambda. Costs: partial-success semantics, a 30-second ceiling if any clips are cold, and a second contract to test. Do not build it for Milestone 1; revisit if measured pack-preparation time is poor.

---

## 12. Recommended initial TTS parameters

All **PROPOSALS**, to be confirmed or changed by the Milestone 0 spike.

| Parameter | Initial value | Notes |
|---|---|---|
| Region | `eu-west-2` | Neural and the en-GB voices are documented there. |
| Engine | `neural` | The spec's proposal (`prompt.md:601`). Always sent explicitly. |
| Voices to audition | **Amy, Emma, Brian, Arthur** (neural) | Pick one for all clips. Optional comparison only: Amy and Brian on `generative`; Amy, Emma, Brian on `standard`. |
| Language code | `en-GB` | Sent explicitly and hashed. |
| Text type | `ssml` | Always, even for plain words, so every definition has one shape. |
| Output format | `mp3` | Universal browser support; named in the spec. |
| Sample rate | `24000` | Neural default; a standard MP3 rate. Test `48000` in the spike for /f/ versus /θ/. |
| SSML allow-list | `speak`, `phoneme` (x-sampa or ipa), `break` (time up to 2 s), `prosody` (`rate` 50-150%, `volume`), `s`, `p`, `sub`, `w` | Reject `emphasis`, `pitch`, `say-as characters`, every `amazon:*` tag, `lang`, `mark`. |
| Canonical phonetic alphabet | X-SAMPA | ASCII, unambiguous. |
| Lexicons | none | |
| Presigned URL expiry | **300 seconds** | Client re-requests once on 403. |
| Signing | SigV4, regional virtual-hosted endpoint | Unit-test the URL shape. |
| Object metadata | `Content-Type: audio/mpeg`, `Cache-Control: private, no-store`, SSE-S3 | |
| Cache key | SHA-256 of canonical JSON `{keySchema, provider, engine, voiceId, languageCode, textType, text, outputFormat, sampleRate, lexicons, generation}` | Path as in 9.3; written with `If-None-Match: *`. |
| Reserved concurrency | about 4 | Subject to the account quota check. |
| Route throttle | player 20 RPS / burst 40; preview 2 RPS / burst 5 | Starting values. |
| Client pack concurrency | 3 | |
| Browser playback | one shared `HTMLAudioElement` from a Blob URL | Web Audio as the upgrade path. |

---

## 13. Suggested TTS sequence (for the plan's diagram)

1. Child presses Play (click, Enter or Space). The handler synchronously primes the shared audio element, then sets state to Loading.
2. Browser sends the authenticated request: run ID, activity ID, content version, audio variant. No text.
3. API Gateway validates the JWT and applies the route throttle, then invokes the dedicated TTS Lambda.
4. Lambda checks the caller owns the run and that the activity/version is pinned to that run; resolves the approved speech definition to its cache key and reviewed SHA-256.
5. Lambda reads the audio metadata item. **Hit:** go to step 8.
6. **Miss:** call `SynthesizeSpeech` with the stored parameters; read the stream; compute SHA-256.
7. Store the MP3 with `If-None-Match: *` (a 412 means another request won — use that object); write the sidecar and the metadata item; emit the "unreviewed regeneration" metric if the definition was already published.
8. Lambda signs a 300-second SigV4 GET URL and returns `{cacheKey, sha256, contentType, byteLength, url, expiresAt}`. The URL is not logged.
9. Browser: if it already holds bytes with that SHA-256, skip to step 11. Otherwise `fetch(url, {cache: "no-store"})`.
10. Browser verifies the SHA-256 and stores the bytes.
11. Browser plays from a Blob URL, sets state to Stop/Replay, and revokes the URL when playback ends.
12. Any failure in steps 2-11 leads to Retry. No attempt is consumed and no reward changes.

---

## 14. Phonics audio review checklist (operator, in the admin preview, before publishing)

Use the same route players use, on laptop speakers and on headphones. A clip is published only if every applicable line passes. If any line fails, change the SSML and preview again, or leave the activity unpublished (`prompt.md:611`).

**A. Identity of the sound**

1. The label says clearly whether this is a **letter name**, a **phoneme**, a **word** or a **sound-talk sequence**, and the audio matches the label.
2. It is the *intended* phoneme, checked against the example word in section 5.5 — not a neighbour. Listen in pairs for the known confusions: /f/ and /θ/; /ð/ and /v/ or /d/; /ɪ/ and /iː/; /ʊ/ and /uː/; /ʌ/ and /ə/; /ʊə/ and /ɔː/; /m/ and /n/.
3. No letter name has been substituted for a sound ("ess" for /s/, "ay" for /æ/), and no sound for a letter name.

**B. Purity**

4. Unvoiced sounds /p t k f θ s ʃ h tʃ/ have **no added vowel**.
5. /b d g dʒ/ have at most a *small* schwa — DfE accepts that these cannot be clear without one. /w/ and /j/ have a small schwa or are taught through a word instead.
6. Continuants /s f m n l r z v ʃ θ ð ŋ ʒ/ are held long enough to be recognised (aim for roughly half a second or more) and are not a blip.
7. Short vowels are short and steady: no glide into another vowel, no glottal "catch" that sounds like a consonant.

**C. Accent and consistency**

8. The accent is British throughout: non-rhotic `ar`, `or`, `ur`, `er`, `ear`, `air`; "zed" for Z.
9. The voice sounds like the same speaker at the same quality as neighbouring clips — listen specifically for a switch to a flatter, more robotic voice on single letters.
10. Loudness is similar to neighbouring clips; nothing startling, nothing inaudible at normal volume.

**D. Clip mechanics**

11. The start is not clipped: the first sound is complete on first play after silence.
12. The end is not cut off and does not have a long dead tail.
13. Intonation is neutral or falling — it does not sound like a question.
14. No stray sounds: breaths, clicks, a second syllable, repeated or invented speech.
15. Replay sounds identical.

**E. Teaching fit**

16. Played beside the activity, the clip does not give the answer away unintentionally (for example an anchor word in a "which sound?" question).
17. For a blending activity, the separate sounds followed by the word actually sound like they blend into that word.
18. A second adult — and ideally one of the children — identifies the sound unprompted.

**F. Record-keeping**

19. The definition contains only curriculum content: no names, no ages, nothing about a player.
20. Voice, engine and sample rate are the approved defaults, or the deviation is recorded with a reason.
21. The reviewer, date, cache key and SHA-256 of the approved bytes are recorded with the published version.
22. Every audio variant the activity references has passed — one unreviewed clip blocks publication.

"The service returned audio without an error" is not on this list, deliberately: "A syntactically valid synthesis is not proof of a correct educational sound" (`prompt.md:609`).

---

## 15. Time-to-audio — goals to measure, not guarantees

The spec asks for measured engineering goals (`prompt.md:625`, `prompt.md:1044-1048`). None of the following has been measured. They are **PROPOSED targets** for the prototype to confirm or revise, on a representative laptop and home broadband.

| Scenario | What is timed | Proposed goal (median) | Proposed goal (95th percentile) |
|---|---|---|---|
| Replay from bytes already in memory | Press to first sound | 50 ms | 150 ms |
| Play from bytes in local storage (offline or pack) | Press to first sound | 100 ms | 250 ms |
| Online Play, server cache hit, warm Lambda | Press to first sound | 400 ms | 1.0 s |
| Online Play, server cache miss (Polly synthesis) | Press to first sound | 1.2 s | 2.5 s |
| Online Play, Lambda cold start | Press to first sound | 1.5 s | 3.0 s |
| Offline pack, 60 clips, all server cache hits, concurrency 3 | Start to "ready" | 15 s | 30 s |

How to measure:

- In the browser, mark the press, the API response, the S3 response and the audio element's `playing` event with `performance.now()`; report the four segments separately.
- On the server, Lambda duration and Polly's `ResponseLatency` metric (CloudWatch, microseconds).
- A `<link rel="preconnect">` to the bucket's regional host removes one connection set-up from the first Play of a session; measure with and without.
- A visible Loading state should appear within about 100 ms of the press regardless, so the child knows the press registered.
- If the online-hit figure cannot get near the goal, the two-round-trip design is the first suspect — see the inline-bytes alternative in section 6.7.

---

## 16. Open risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | Several isolated consonants are unusable in every en-GB neural voice. | Likely for some of the 16 high-risk rows / high — it limits which phonics activities can be published. | Milestone 0 spike; SSML strategies in 5.3; word-level activity design; the owner-only decision in 5.4. |
| 2 | Neural switches to the standard engine for single letters, giving an inconsistent voice. | Documented by AWS / medium. | Avoid `say-as characters`; checklist item 9; phoneme-tag letter names. |
| 3 | A voice model update changes regenerated audio. | Documented for generative and long-form, unknown for neural / medium. | Approve bytes, pin SHA-256, never expire or overwrite, alarm on regeneration. |
| 4 | Southern-British voice does not match the children's accent or their school's phonics programme. | Depends on the family / medium. | Listen with the children; note that DfE acknowledges accent variation. |
| 5 | Safari rejects `play()` after the asynchronous fetch. | Unknown / medium for Safari users. | Prime the element in the gesture; reuse one element; second-press fallback; Web Audio upgrade path. |
| 6 | Lambda credential lifetime is undocumented; a URL could fail early. | Low / low. | 300-second expiry; one automatic re-request on 403. |
| 7 | S3 CORS misconfiguration blocks byte download while `<audio>` playback would have worked, masking the problem in casual testing. | Medium / high for offline. | Test the `fetch` path specifically from both origins; include in smoke checks. |
| 8 | Reserved concurrency cannot be set in a new account with a low Lambda quota. | Plausible / low. | Check the quota early; fall back to route throttling; request an increase. |
| 9 | Route throttling is shared and best-effort, so it is not a per-user limit. | Certain / low at family scale. | Per-user miss counter in DynamoDB; revisit if the user base grows. |
| 10 | The player route's Polly permission cannot be narrowed in IAM. | Certain / medium. | Identifier-only API contract; code allow-list; tests proving text and SSML are not accepted (AC-20). |
| 11 | "Partial" `<phoneme>` support on generative is undefined. | Certain / low while neural is the default. | Treat generative as comparison-only. |
| 12 | The spec's "Play always reaches the service" versus local replay is ambiguous. | Certain / medium for testing AC-19. | Decide explicitly (section 10.4). |
| 13 | Very short clips lose their first milliseconds on some laptop audio hardware. | Plausible / medium. | Leading `<break>`; checklist item 11; test on the real laptops. |
| 14 | Documentation inconsistencies (sample rates; phoneme support on generative). | Certain / low. | Verify by calling the API in the spike. |
| 15 | X-SAMPA or IPA symbol not accepted, or silently ignored, for a single-phoneme utterance. | Unknown / high for affected rows. | Spike step 6; validator restricted to the documented en-GB symbol set. |

---

## 17. Things I could not verify today

1. **Any audio quality claim.** No synthesis was possible; every risk rating and SSML fragment is untested.
2. Lifetime of Lambda execution-role credentials (not published by AWS as far as I could find).
3. Which en-GB neural voices are actually returned by `DescribeVoices` in eu-west-2 (the documentation implies all four).
4. Whether Polly honours a `ph` attribute containing a single consonant, how it treats invalid symbols, and whether leading/trailing `<break>` yields silence.
5. Whether 44100/48000 Hz MP3 output is accepted on the neural engine (two AWS pages disagree).
6. Polly's MP3 bitrate, and therefore clip sizes.
7. Whether whitespace, punctuation and `<phoneme>` element text count as billed characters.
8. Whether lexicons work on every engine (only implied by a quota description).
9. What "partial availability" of `<phoneme>` and `<mark>` means on generative.
10. Whether neural voice models change over time.
11. Safari's treatment of `play()` invoked after an awaited network request.
12. The S3 API Reference SigV4 pages (would not load); the "regions after 30 January 2014 are SigV4-only" sentence was seen only in a search-result excerpt.
13. That HTTP APIs offer no per-client usage plans (recollection; the throttling page simply does not mention them).
14. S3's 403-instead-of-404 behaviour for a missing key without list permission; that presigning is purely local; that `decodeAudioData` detaches its input buffer. All long-standing behaviours, none re-read today.
15. Which Polly free-tier scheme applies to this account (depends on its creation date).
16. The account's current Lambda concurrency quota, which decides whether reserved concurrency can be set at all (needs a Service Quotas look-up by the owner).

---

## 18. Sources fetched on 2026-11-14

**Amazon Polly**
- Available voices — <https://docs.aws.amazon.com/polly/latest/dg/available-voices.html>
- Neural voices — <https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html>
- Standard voices — <https://docs.aws.amazon.com/polly/latest/dg/standard-voices.html>
- Generative voices — <https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html>
- Long-form voices — <https://docs.aws.amazon.com/polly/latest/dg/long-form-voices.html>
- Supported SSML tags — <https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html>
- Phoneme tag — <https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html>
- Prosody tag — <https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html>
- Say-as tag — <https://docs.aws.amazon.com/polly/latest/dg/say-as-tag.html>
- Break, lang, sub, w, drc tags — `break-tag.html`, `lang-tag.html`, `sub-tag.html`, `w-tag.html`, `drc-tag.html` under <https://docs.aws.amazon.com/polly/latest/dg/>
- SSML overview and reserved characters — <https://docs.aws.amazon.com/polly/latest/dg/ssml.html>, <https://docs.aws.amazon.com/polly/latest/dg/escapees.html>
- en-GB phoneme table — <https://docs.aws.amazon.com/polly/latest/dg/ph-table-english-uk.html>
- Lexicons — <https://docs.aws.amazon.com/polly/latest/dg/managing-lexicons.html>, <https://docs.aws.amazon.com/polly/latest/dg/lexicons-applying.html>
- SynthesizeSpeech API — <https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html>
- Quotas — <https://docs.aws.amazon.com/polly/latest/dg/limits.html>, <https://docs.aws.amazon.com/general/latest/gr/pol.html>
- CloudWatch metrics — <https://docs.aws.amazon.com/polly/latest/dg/cloud-watch.html>
- IAM — <https://docs.aws.amazon.com/polly/latest/dg/security_iam_service-with-iam.html>, <https://docs.aws.amazon.com/polly/latest/dg/security_iam_id-based-policy-examples.html>, <https://servicereference.us-east-1.amazonaws.com/v1/polly/polly.json>
- Pricing and FAQ — <https://aws.amazon.com/polly/pricing/>, <https://aws.amazon.com/polly/faqs/>

**Amazon S3, IAM, Lambda, API Gateway**
- Presigned URLs — <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html>
- Presigned URL best practices — <https://docs.aws.amazon.com/prescriptive-guidance/latest/presigned-url-best-practices/overview.html>, `.../logging-interactions.html`, `.../appendix-a.html`
- SigV4 authentication methods — <https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-authentication-methods.html>
- boto3 presigned URLs — <https://docs.aws.amazon.com/boto3/latest/guide/s3-presigned-urls.html>
- CORS — <https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html>, `ManageCorsUsing.html`, `cors-troubleshooting.html`
- GetObject — <https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html>
- Conditional writes — <https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html>, `conditional-writes-enforce.html`
- Lambda execution role, quotas, reserved concurrency — <https://docs.aws.amazon.com/lambda/latest/dg/lambda-intro-execution-role.html>, `gettingstarted-limits.html`, `configuration-concurrency.html`
- HTTP API throttling, quotas, Lambda integration — <https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-throttling.html>, `http-api-quotas.html`, `limits.html`, `http-api-develop-integrations-lambda.html`

**Browser**
- Autoplay guide — <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay>
- `HTMLMediaElement.play()` — <https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play>
- User activation — <https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/User_activation>
- `decodeAudioData` — <https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData>
- Web Audio best practices — <https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices>
- Object URLs — <https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static>, `revokeObjectURL_static`
- Audio codecs — <https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs>
- Chrome autoplay policy — <https://developer.chrome.com/blog/autoplay>
- WebKit autoplay policy (macOS) — <https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/>
- Phaser audio — <https://docs.phaser.io/phaser/concepts/audio>

**Department for Education / GOV.UK**
- The reading framework (July 2023), Appendices 5 and 6 — <https://assets.publishing.service.gov.uk/media/664f600c05e5fe28788fc437/The_reading_framework_.pdf>
- National curriculum English Appendix 1: Spelling (IPA table) — <https://assets.publishing.service.gov.uk/media/5a7ccc06ed915d63cc65ce61/English_Appendix_1_-_Spelling.pdf>
- Letters and Sounds: Principles and Practice of High Quality Phonics (2007) — <https://assets.publishing.service.gov.uk/media/5a7aa7b6e5274a34770e630c/Letters_and_Sounds_-_DFES-00281-2007.pdf>

**Local files**
- `/home/jack/Documents/Projects/space-tower-defence/prompt.md` (specification)
- `/tmp/claude-1000/-home-jack-Documents-Projects-space-tower-defence/21e4d7b3-740a-407a-9ce4-b4a3156f1b6c/scratchpad/research/00-verified-repo-facts.md`
