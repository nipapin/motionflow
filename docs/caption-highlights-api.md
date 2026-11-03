# AI caption highlights

The 2026-11-03 production error `AI highlight selection does not match source words` showed that allowing adjacent model ID drift did not remove the source of recurring failures. Highlights now use this server-only pipeline:

`original text + current display segments → one AI prediction → complete text with **emphasis** → deterministic parser → original word indices`.

All credentials, prompts, model calls, markup parsing and index mapping stay in `next-app`. The CEP panel sends its timed transcript plus `displaySegments`, arrays of original word indices for the current editor cards, including manual split/merge boundaries. It receives the existing word-level boolean flags. This segmentation-aware behavior requires the updated panel; older callers without `displaySegments` use sentence segments derived from source punctuation.

Caption generation with highlights uses **one** `POST /api/generations/captions` multipart request with `highlights=true`:

`audio → one Scribe prediction → complete timestamped transcript → one GPT-5 nano prediction → timestamped words + highlight → UI / Adobe`.

GPT-5 nano selects one local highlight within each segment, without using the meaning of preceding/following segments or the full transcript. The transcript field is an exact copying reference only. It copies the entire text and wraps selected words or phrases in `**`; it never supplies word IDs, ranges or timestamps. The server adds boolean `highlight` fields to Scribe words while preserving their text, timestamps and metadata. The response includes `highlightsApplied: true`. Translation and highlights, when both requested, share the same GPT-5 nano prediction: the model returns an array of translated strings containing `**emphasis**`, and the server derives each string's word ranges locally. Translated word timings are rebuilt within the original sentence spans as in the existing translation flow.

The panel does not make a follow-up highlight request after transcription. Its progress step covers transcription and highlighting together. Rapid repeated Generate clicks are locked before the first asynchronous preflight.

For Find AI highlights, the system prompt requires exactly one short contiguous highlight in every card with two or more words. Each card is analyzed independently; there is no sentence-level or transcript-level highlight limit. Whole-card highlights are forbidden, and one-word cards stay plain. The server enforces the whole-card restriction after parsing: if every visible word in a card was selected, it clears that card's selection rather than inventing a shorter phrase or retrying a paid request. Hidden punctuation outside the supplied cards remains unselected. If the user changes segmentation later, running Find AI highlights again uses the new card boundaries.

For an explicit **Find AI highlights** operation on existing captions, `POST /api/generations/caption-highlights` accepts authenticated Motionflow/CEP users under the existing caption-generation account rules.

Request:

```json
{"words":[{"text":"important","start":0.2,"end":0.6},{"text":"idea","start":0.6,"end":1.0}],"displaySegments":[[0,1]]}
```

Response:

```json
{"words":[{"text":"important","start":0.2,"end":0.6,"highlight":true},{"text":"idea","start":0.6,"end":1.0,"highlight":false}],"cost":1,"generations":{}}
```

Each operation starts exactly one GPT-5 nano prediction. For example, segments `A close-up should` and `emphasize a meaningful idea.` can produce `A **close-up** should emphasize a **meaningful idea.**`. The server removes paired markers, decodes escaped literal asterisks/backslashes and matches every returned token to the complete original transcript in order. Whitespace wrapping may vary; spelling, case, punctuation, token count and order must match exactly. Repeated words resolve by position, without searching or correcting model IDs. A selected span maps to the original word(s) it overlaps, including punctuation outside markers. Source words containing internal whitespace keep their original word identity. No markers can represent an empty selection, including all-single-word cards. The client additionally checks word count, text and timestamps before saving flags. Model output cannot replace the transcript or its timings. There are no model batches or automatic billable retries.

A single complete fenced text response is accepted as well as plain text. Empty or unclosed markers, omitted/added/rewritten words, truncated transcripts and explanatory prose are rejected before consuming credits. The Replicate model is `openai/gpt-5-nano`, pinned to version `034fc01c1d162ba028187fc496eb079e6c1329c1c8f686d971eba9d01e7ffb96`, with `reasoning_effort: minimal`, `verbosity: low` and `max_completion_tokens: 64000`. Actual analysis failures are logged on the server.

For compatibility with an older deployed endpoint, the panel includes `segments` alongside `words` when the legacy limits permit. These use the supplied editor cards, or complete transcript sentences for callers that do not supply cards. An older server can return `ranges`; the panel validates and maps them back to the original word IDs. Compatibility uses the same request and never retries a paid operation. Modern servers validate `displaySegments` before invoking the model: each card is nonempty and indices are in range and strictly increasing without overlaps; gaps for invisible punctuation are permitted.

Limits: 1–10000 timed words, 1000 characters per word, 40000 transcript characters total. Oversized input is rejected rather than split into more predictions. GPT-5 nano uses the existing Replicate credential and pinned model version. The legacy `segments` request / `ranges` response remains supported and also uses a single model prediction.

Cost is **one additional generation** beyond duration-based transcription. The integrated endpoint preflights the combined cost and consumes it once after validated output. If optional highlight analysis fails, it returns the successful transcription with `highlightsApplied: false` and `highlightError`, charging only transcription; the panel shows the error without retrying. Standalone highlights charge one generation only after a validated result. A failed final consumption returns 402 without the result. Request cancellation is forwarded to Replicate and checked before starting another prediction or consuming quota.

For older panels, `{ "segments": [["close-up", "should"]] }` remains supported and returns `{ "ranges": [{"segment":0,"index":0,"length":1}], ... }`. These indices refer to the request's segments, not the current editor's visual cards. This older response can represent only the longest selected run in each segment; the timestamped contract retains every selection.

Limits: 1–10000 timed words, 1000 characters per word, 40000 transcript characters total. The legacy request permits 1–1200 segments with 1–256 words per segment. Each operation uses one GPT-5 nano prediction; there are no model batches or automatic paid retries. Oversized input is rejected before starting a prediction.

Cost is one generation, consumed atomically only after the complete response has been validated. Failed input or model analysis is not charged. Concurrent credit exhaustion returns 402 without the result. Request cancellation is forwarded to Replicate and checked before consuming quota.

The release workflow runs `scripts/test-caption-highlights.mjs` and the required build and release checks before production deployment. Existing model fixtures use the annotated-text contract, including complete-transcript matching, repeated words, malformed markup, translation and generation accounting. These fixtures mock the provider and do not run paid model generations.
