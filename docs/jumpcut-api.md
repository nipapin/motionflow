# JumpCut analysis for CEP

`POST /api/generations/captions` optionally accepts multipart
`jumpCutFrequency=low|medium|high` alongside the existing MP3 upload,
`durationSeconds`, language and bearer authentication.

When supplied, the endpoint transcribes with Scribe, selects meaningful punch-in
phrases with the existing Claude model and returns an additional
`zoomPhrases: { start: number; end: number; text: string }[]` field.
All timestamps are seconds relative to the uploaded audio. The model selects
word IDs only; `lib/jumpcut-analysis.ts` validates IDs and derives exact phrase
text/times from ASR. Empty arrays are valid. Responses without the optional
request field remain unchanged.

Analysis is completed before consuming the existing duration-based captions
charge. Invalid frequency returns 400; failed or invalid AI analysis returns
502 without consuming quota. There is no separate second charge. Request
authentication and generation allowance checks remain in the captions route.

The analysis processes up to 40,000 transcript characters in 500-word batches.
The SDK handles frame snapping, zoom spacing, focus/scale settings and Premiere
adjustment layers. No Adobe-specific logic is needed on the server.

Verification: `node --test scripts/test-jumpcut-analysis.mjs` and
`npx tsc --noEmit --incremental false`.
