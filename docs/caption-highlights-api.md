# AI caption highlights

`POST /api/generations/caption-highlights` accepts authenticated Motionflow/CEP users under the existing caption-generation account rules.

Request:

```json
{"segments":[["this","word","stays","highlighted"],["next","segment"]]}
```

Response:

```json
{"ranges":[{"segment":0,"index":2,"length":2},{"segment":1,"index":0,"length":0}],"cost":1,"generations":{}}
```

`segment` and `index` are zero-based. `length` counts consecutive words. Each segment has exactly one response row; length 0 means no emphasis. The client applies the flags to original word IDs and computes character offsets through the caption SDK. Model output cannot replace text or timings.

Limits: 1–1200 segments, 1–256 words per segment, 1000 characters per word, 40000 transcript characters total. Model batches contain up to 50 segments with neighboring context. Claude Haiku uses the existing Replicate credential and pinned model version.

Cost is always **one additional generation** beyond transcription, irrespective of model batch count or audio duration. The client cannot select or waive the fee. Preflight checks balance; validated successful output is followed by atomic consumption under the `captions` ledger category. No charge for input/model failure. A failed final consumption returns 402 without the result.

Run local validation with `node --test scripts/test-caption-highlights.mjs` and the TypeScript check. Tests mock model/auth/ledger; they do not invoke paid services or modify balances. Deploy this endpoint before releasing the panel option to production users.
