# AI caption highlights

The 2026-11-03 production error `AI highlight selection does not match source words` showed that allowing adjacent model ID drift did not remove the source of recurring failures. Highlights now use this server-only pipeline:

`editor segments as-is → plain TXT → one AI prediction → TXT with *emphasis* → parser → original word highlight flags`.

All credentials, prompts, model calls, markup parsing and index mapping stay in `next-app`. The CEP panel sends its timed transcript plus `displaySegments` (original word indices for the current cards) and `displayTexts` (each card's actual text, including internal line breaks). Manual split/merge boundaries and Words mode's displayed punctuation are preserved. The server joins the actual card texts with an empty line and sends that TXT directly as the user message. No JSON, segment labels, word IDs or timestamps are sent to the highlight model. The panel receives the existing word-level boolean flags. Older callers without display metadata use source sentence segments.

Caption generation with highlights uses **one** `POST /api/generations/captions` multipart request with `highlights=true`:

`audio → one Scribe prediction → complete timestamped transcript → one GPT-5 nano prediction → timestamped words + highlight → UI / Adobe`.

GPT-5 nano selects one local highlight within each TXT segment, without using neighboring segments for meaning. It returns the entire same TXT with `*` around selected words or phrases, preserving all text and segment separators. The parser accepts paired `*` and `**` markers, removes them and sets existing `highlight` booleans on the original words. Literal asterisks and backslashes are escaped for lossless transport. Text, layout and timestamps are retained. The legacy combined translation/highlight request retains its translated-string array contract; translated word timings are rebuilt within the original sentence spans as before.

The panel does not make a follow-up highlight request after transcription. Its progress step covers transcription and highlighting together. Rapid repeated Generate clicks are locked before the first asynchronous preflight.

For Find AI highlights, the system prompt requires exactly one short contiguous highlight in every card with two or more words. Each card is analyzed independently. Whole-card highlights are forbidden, and one-word cards stay plain. The parser validates the complete marker-free TXT against the original editor text, including line breaks and empty-line separators, then maps marked tokens to the supplied original word indices. Missing/extra/rewritten text, changed segment boundaries, malformed/cross-segment markup and missing or invalid multiword-card highlights are rejected before charging. No partial response is applied and there are no automatic paid retries. If the user changes segmentation later, running Find AI highlights again uses the new cards.

For an explicit **Find AI highlights** operation on existing captions, `POST /api/generations/caption-highlights` accepts authenticated Motionflow/CEP users under the existing caption-generation account rules.

Request:

```json
{"words":[{"text":"important","start":0.2,"end":0.6},{"text":"idea","start":0.6,"end":1.0}],"displaySegments":[[0,1]],"displayTexts":["important idea"]}
```

Response:

```json
{"words":[{"text":"important","start":0.2,"end":0.6,"highlight":true},{"text":"idea","start":0.6,"end":1.0,"highlight":false}],"cost":1,"generations":{}}
```

Each operation starts exactly one GPT-5 nano prediction. For example, the input TXT `Bir düşünsenize\n\neditiniz için` can produce `Bir *düşünsenize*\n\n*editiniz* için`. Repeated words resolve by their position inside the existing segment. Source words containing internal whitespace retain their original word identity. LF/CRLF are normalized; internal whitespace and line breaks otherwise remain exact. The client additionally checks word count, text and timestamps before saving flags. Model output cannot replace the transcript or its timings. There are no model batches or automatic billable retries.

A single complete fenced text response is accepted as well as plain text. Empty or unclosed markers, omitted/added/rewritten words, truncated transcripts and explanatory prose are rejected before consuming credits. The Replicate model is `openai/gpt-5-nano`, pinned to version `034fc01c1d162ba028187fc496eb079e6c1329c1c8f686d971eba9d01e7ffb96`, with `reasoning_effort: minimal`, `verbosity: low` and `max_completion_tokens: 64000`. Actual analysis failures are logged on the server.

For compatibility with an older deployed endpoint, the panel includes `segments` alongside `words` when the legacy limits permit. An older server can return `ranges`; the panel validates and maps them back to original word IDs. Compatibility uses the same request. Modern servers validate display metadata before invoking the model: cards are nonempty, indices are in range and strictly increasing without overlaps, and each actual display text matches its source words (including the existing punctuation-hiding presentation). Gaps for invisible punctuation are permitted. Display text is limited to 100000 characters in total.

Limits: 1–10000 timed words, 1000 characters per word, 40000 transcript characters total. Oversized input is rejected rather than split into more predictions. GPT-5 nano uses the existing Replicate credential and pinned model version. The legacy `segments` request / `ranges` response remains supported and also uses a single model prediction.

Cost is **one additional generation** beyond duration-based transcription. The integrated endpoint preflights the combined cost and consumes it once after validated output. If optional highlight analysis fails, it returns the successful transcription with `highlightsApplied: false` and `highlightError`, charging only transcription; the panel shows the error without retrying. Standalone highlights charge one generation only after a validated result. A failed final consumption returns 402 without the result. Request cancellation is forwarded to Replicate and checked before starting another prediction or consuming quota.

For older panels, `{ "segments": [["close-up", "should"]] }` remains supported and returns `{ "ranges": [{"segment":0,"index":0,"length":1}], ... }`. These indices refer to the request's segments, not the current editor's visual cards. This older response can represent only the longest selected run in each segment; the timestamped contract retains every selection.

Limits: 1–10000 timed words, 1000 characters per word, 40000 transcript characters total. The legacy request permits 1–1200 segments with 1–256 words per segment. Each operation uses one GPT-5 nano prediction; there are no model batches or automatic paid retries. Oversized input is rejected before starting a prediction.

Cost is one generation, consumed atomically only after the complete response has been validated. Failed input or model analysis is not charged. Concurrent credit exhaustion returns 402 without the result. Request cancellation is forwarded to Replicate and checked before consuming quota.

The release workflow runs `scripts/test-caption-highlights.mjs` and the required build and release checks before production deployment. Existing model fixtures use the annotated-text contract, including complete-transcript matching, repeated words, malformed markup, translation and generation accounting. These fixtures mock the provider and do not run paid model generations.

The current TXT-contract edits are local: no tests, live generations, builds or deployment were run for this change.
