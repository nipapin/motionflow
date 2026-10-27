# JumpCut analysis for CEP

`POST /api/generations/captions` optionally accepts multipart
`jumpCutFrequency=low|medium|high` alongside the existing MP3 upload,
`durationSeconds`, language and bearer authentication.

The value sets the AI selection rate: Low targets one meaningful phrase per
30–45 seconds of speech, Medium per 15–25 seconds, and High per 8–15 seconds.
These are editorial targets, not mandatory quotas. When supplied, the endpoint transcribes with Scribe, selects meaningful punch-in
phrases with the existing Claude model and returns an additional
`zoomPhrases: { start: number; end: number; text: string }[]` field.
All timestamps are seconds relative to the uploaded audio. The model selects
word IDs only; `lib/jumpcut-analysis.ts` validates IDs and derives exact phrase
text/times from ASR. Empty arrays are valid. Responses without the optional
request field remain unchanged. Meaningful content remains the basis of selection;
routine filler is excluded at every frequency.

Analysis is completed before consuming the existing duration-based captions
charge. Invalid frequency returns 400; failed or invalid AI analysis returns
502 without consuming quota. There is no separate second charge. Request
authentication and generation allowance checks remain in the captions route.

The analysis processes up to 40,000 transcript characters in 500-word batches.
The SDK handles frame snapping, focus/scale settings and Premiere adjustment
layers. It zooms for each full returned phrase without additional frequency filtering or a maximum
phrase duration; overlapping/frame-adjacent spans are merged. In/Out durations
only control the transitions within the phrase span. No Adobe-specific logic is
needed on the server.
Clip/sentence Gap is a separate local SDK setting; it is never sent for AI phrase
selection and does not change the set of phrases returned by this endpoint.

Verification: `node --test scripts/test-jumpcut-analysis.mjs` and
`npx tsc --noEmit --incremental false`.
