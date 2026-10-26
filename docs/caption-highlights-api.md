# AI caption highlights

`POST /api/generations/caption-highlights` accepts authenticated Motionflow/CEP users under the existing caption-generation account rules.

Request:

```json
{"words":[{"text":"close-up","start":1,"end":1.5},{"text":"should","start":1.5,"end":2}]}
```

Response:

```json
{"words":[{"text":"close-up","start":1,"end":1.5,"highlight":true},{"text":"should","start":1.5,"end":2,"highlight":false}],"cost":1,"generations":{}}
```

The editor sends the complete timestamped transcript once, independently of visual caption cards, line breaks or grouping. The response preserves source words and exact timings and adds boolean flags.

Haiku reads the full transcript and sentence context. The prompt asks for the shortest complete core concepts or outcomes, avoiding modal verbs, filler and generic instructional framing. It returns selected tokens as `[globalWordId,"exact source token"]` pairs, never segment numbers or lengths. Every ID, token string, ordering and duplicate is validated before applying flags. Phrase boundaries and lengths follow adjacent selected source tokens: `close-up` is one word. Repeated words are distinguished by global ID. Empty selection is valid.

One complete JSON array is extracted from plain or fenced output; explanatory prose outside it does not invalidate good data. Truncated JSON, multiple competing payloads, invented or mismatched tokens, and invalid IDs fail without modifying the transcript. The failure is logged on the server.

For older panels, `{ "segments": [["close-up", "should"]] }` remains supported and returns `{ "ranges": [{"segment":0,"index":0,"length":1}], ... }`. These indices refer to the request's segments, not the current editor's visual cards. This older response can represent only the longest selected run in each segment; the timestamped contract retains every selection.

Limits: 1–10000 timed words, 1000 characters per word, 40000 transcript characters total. The legacy request permits 1–1200 segments with 1–256 words per segment. Each operation uses one Haiku prediction; there are no model batches or automatic paid retries. Oversized input is rejected before starting a prediction.

Cost is one generation, consumed atomically only after the complete response has been validated. Failed input or model analysis is not charged. Concurrent credit exhaustion returns 402 without the result. Request cancellation is forwarded to Replicate and checked before consuming quota.

Regression validation: `node --test scripts/test-caption-highlights.mjs`, TypeScript, and production build. Tests include the actual 2026-10-26 failed provider response, exact word selections for the screenshot transcript, repeated tokens, malformed responses and accounting. Automated tests mock the model and do not spend credits. A manual live-model check confirmed selections `close-up` and `meaningful idea.` while preserving all timestamps.
