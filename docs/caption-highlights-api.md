# AI caption highlights

Caption generation with highlights uses **one** `POST /api/generations/captions` multipart request with `highlights=true`:

`audio → one Scribe prediction → complete timestamped transcript → one Haiku prediction → timestamped words + highlight → UI / Adobe`.

Haiku reads the complete transcript and selects meaningful words or phrases within each sentence, independently of UI cards, line wrapping, or template segmentation. The prompt includes sentence boundaries derived from punctuation and asks the model to infer boundaries from meaning where punctuation is missing. The server adds boolean `highlight` fields to Scribe words while preserving their text, timestamps and metadata. The response includes `highlightsApplied: true`. Translation and highlights, when both requested, share the same Haiku prediction; translated word timings are rebuilt within the original sentence spans as in the existing translation flow.

The panel does not make a follow-up highlight request after transcription. Its progress step covers transcription and highlighting together. Rapid repeated Generate clicks are locked before the first asynchronous preflight.

The panel preserves every selected word in its transcript and Adobe payload. Changing caption grouping, card boundaries or line wrapping does not trim the AI selections.

For an explicit **Find AI highlights** operation on existing captions, `POST /api/generations/caption-highlights` accepts authenticated Motionflow/CEP users under the existing caption-generation account rules.

Request:

```json
{"words":[{"text":"important","start":0.2,"end":0.6},{"text":"idea","start":0.6,"end":1.0}]}
```

Response:

```json
{"words":[{"text":"important","start":0.2,"end":0.6,"highlight":true},{"text":"idea","start":0.6,"end":1.0,"highlight":true}],"cost":1,"generations":{}}
```

Each operation starts exactly one Haiku prediction. The model returns sparse, sorted `[globalWordId,"exact source token"]` pairs. The server checks every ID and exact token string before applying flags; the model never supplies a segment number or phrase length. Adjacent selected tokens form phrases in the source transcript. The prompt selects the shortest core concepts or outcomes and skips filler, modal verbs and generic instructional framing. Empty selection is valid. The client additionally checks word count, text and timestamps before saving flags. Model output cannot replace the transcript or its timings. There are no model batches or automatic billable retries.

One complete JSON array is extracted from plain or fenced output; explanatory prose outside it does not invalidate good data. Truncated JSON, multiple competing payloads, mismatched tokens and invalid IDs are rejected. Actual analysis failures are logged on the server. A manual live-model check of the reported example selected `close-up` and `meaningful idea.` without `should` or `emphasize`.

For compatibility with an older deployed endpoint, the panel includes `segments` alongside `words` when the legacy limits permit. Those segments are complete sentences built from the transcript words and punctuation, never visual caption cards. An older server can return `ranges`; the panel validates and maps them back to the original word IDs. Compatibility uses the same request and never retries a paid operation.

Limits: 1–10000 timed words, 1000 characters per word, 40000 transcript characters total. Oversized input is rejected rather than split into more predictions. Claude Haiku uses the existing Replicate credential and pinned model version. The legacy `segments` request / `ranges` response remains supported and also uses a single model prediction.

Cost is **one additional generation** beyond duration-based transcription. The integrated endpoint preflights the combined cost and consumes it once after validated output. If optional highlight analysis fails, it returns the successful transcription with `highlightsApplied: false` and `highlightError`, charging only transcription; the panel shows the error without retrying. Standalone highlights charge one generation only after a validated result. A failed final consumption returns 402 without the result. Request cancellation is forwarded to Replicate and checked before starting another prediction or consuming quota.

For older panels, `{ "segments": [["close-up", "should"]] }` remains supported and returns `{ "ranges": [{"segment":0,"index":0,"length":1}], ... }`. These indices refer to the request's segments, not the current editor's visual cards. This older response can represent only the longest selected run in each segment; the timestamped contract retains every selection.

Limits: 1–10000 timed words, 1000 characters per word, 40000 transcript characters total. The legacy request permits 1–1200 segments with 1–256 words per segment. Each operation uses one Haiku prediction; there are no model batches or automatic paid retries. Oversized input is rejected before starting a prediction.

Cost is one generation, consumed atomically only after the complete response has been validated. Failed input or model analysis is not charged. Concurrent credit exhaustion returns 402 without the result. Request cancellation is forwarded to Replicate and checked before consuming quota.

Regression validation: `node --test scripts/test-caption-highlights.mjs`, TypeScript, and production build. Tests include the actual 2026-10-26 failed provider response, exact word selections for the screenshot transcript, repeated tokens, malformed responses and accounting. Automated tests mock the model and do not spend credits. A manual live-model check confirmed selections `close-up` and `meaningful idea.` while preserving all timestamps.
