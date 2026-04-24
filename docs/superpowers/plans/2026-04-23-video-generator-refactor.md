# VideoGenerator Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `components/video-generator.tsx` from 1043 lines to ~450 by deduplicating three repeated logic patterns and extracting three self-contained sub-components — with zero behavior change.

**Architecture:** All duplicated gate-check, 403-response, and generation-status-sync logic is unified into `useCallback` helpers defined once inside `VideoGenerator`. The First Frame dialog, Recent Videos list, and video lightbox are each extracted to focused files under `components/video-generator/`. The parent component retains ownership of all cross-cutting state (auth gate, error messages, recent video list).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS · Radix UI · lucide-react

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `components/video-generator.tsx` | Orchestrator: state, data-fetching, gate logic, layout |
| Create | `components/video-generator/video-lightbox.tsx` | Lightbox overlay (pure display, ~40 lines) |
| Create | `components/video-generator/recent-videos-list.tsx` | Recent generations list (pure display, ~70 lines) |
| Create | `components/video-generator/first-frame-dialog.tsx` | First-frame picker dialog with tabs + own ff* state (~200 lines) |

> No new dependencies. No behavior changes. Each task is independently verifiable with `npm run build && npm run lint`.

---

## Task 1: Move `triggerClasses` to module scope

**Files:**
- Modify: `components/video-generator.tsx` (line 522)

The `triggerClasses` string constant is currently defined inside the component body, recreated on every render. Moving it to module scope costs nothing.

- [ ] **Step 1: Locate and move the constant**

In `components/video-generator.tsx`, find this block (currently around line 522, just before the `return`):

```typescript
  const triggerClasses =
    "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

  return (
```

Replace with (constant gone from inside the function):

```typescript
  return (
```

And add this line to the module-level constants block, directly after the `ffDialogTabTriggerClass` constant (around line 92):

```typescript
const triggerClasses =
  "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";
```

- [ ] **Step 2: Verify**

```bash
npm run build
```

Expected: no new TypeScript errors. `triggerClasses` is referenced in JSX below — the reference is unchanged, only the declaration site moved.

- [ ] **Step 3: Commit**

```bash
git add components/video-generator.tsx
git commit -m "refactor: move triggerClasses to module scope in VideoGenerator"
```

---

## Task 2: Extract `checkGenerationGate` helper (deduplicates 3 identical blocks)

**Files:**
- Modify: `components/video-generator.tsx`

The following pattern appears verbatim three times — in `handleGenerate` (lines ~285–307), `handleFfFileChange` (lines ~379–399), and `handleFfGenerate` (lines ~444–466):

```typescript
const block = getAiGenerateBlockReason(user, generations, generationsLoading);
if (block === "sign_in") {
  markGuestWantedGenerate();
  setSignInOpen(true);
  return;
}
if (block === "needs_creator_ai") {
  setCreatorAiVariant(generations?.plan === "creator" ? "upgrade" : "subscribe");
  setCreatorAiGateOpen(true);
  return;
}
if (block === "limit") {
  setErrorMessage("You've reached your generation limit for this period.");
  return;
}
```

- [ ] **Step 1: Add the `checkGenerationGate` callback inside `VideoGenerator`**

Place it directly after the `repeatRecentVideo` callback (around line 220), before `const [firstFrameUrl, ...]`:

```typescript
  /**
   * Runs the generation gate check and triggers the appropriate UI response.
   * Returns true if the caller is clear to proceed, false if blocked.
   */
  const checkGenerationGate = useCallback((): boolean => {
    const block = getAiGenerateBlockReason(user, generations, generationsLoading);
    if (block === "sign_in") {
      markGuestWantedGenerate();
      setSignInOpen(true);
      return false;
    }
    if (block === "needs_creator_ai") {
      setCreatorAiVariant(
        generations?.plan === "creator" ? "upgrade" : "subscribe",
      );
      setCreatorAiGateOpen(true);
      return false;
    }
    if (block === "limit") {
      setErrorMessage(
        "You've reached your generation limit for this period. See pricing for options.",
      );
      return false;
    }
    return true;
  }, [
    user,
    generations,
    generationsLoading,
    markGuestWantedGenerate,
    setCreatorAiVariant,
    setCreatorAiGateOpen,
    setErrorMessage,
  ]);
```

- [ ] **Step 2: Replace the block in `handleGenerate`**

Find (inside `handleGenerate`, after `setErrorMessage(null)`):

```typescript
    const block = getAiGenerateBlockReason(
      user,
      generations,
      generationsLoading,
    );
    if (block === "sign_in") {
      markGuestWantedGenerate();
      setSignInOpen(true);
      return;
    }
    if (block === "needs_creator_ai") {
      setCreatorAiVariant(
        generations?.plan === "creator" ? "upgrade" : "subscribe",
      );
      setCreatorAiGateOpen(true);
      return;
    }
    if (block === "limit") {
      setErrorMessage(
        "You've reached your generation limit for this period. See pricing for options.",
      );
      return;
    }
```

Replace with:

```typescript
    if (!checkGenerationGate()) return;
```

- [ ] **Step 3: Replace the block in `handleFfFileChange`**

Find (inside `handleFfFileChange`, after `setErrorMessage(null)`):

```typescript
    const block = getAiGenerateBlockReason(
      user,
      generations,
      generationsLoading,
    );
    if (block === "sign_in") {
      markGuestWantedGenerate();
      setSignInOpen(true);
      return;
    }
    if (block === "needs_creator_ai") {
      setCreatorAiVariant(
        generations?.plan === "creator" ? "upgrade" : "subscribe",
      );
      setCreatorAiGateOpen(true);
      return;
    }
    if (block === "limit") {
      setErrorMessage("You've reached your generation limit for this period.");
      return;
    }
```

Replace with:

```typescript
    if (!checkGenerationGate()) return;
```

- [ ] **Step 4: Replace the block in `handleFfGenerate`**

Find (inside `handleFfGenerate`, after the early-return guard):

```typescript
    const block = getAiGenerateBlockReason(
      user,
      generations,
      generationsLoading,
    );
    if (block === "sign_in") {
      markGuestWantedGenerate();
      setSignInOpen(true);
      return;
    }
    if (block === "needs_creator_ai") {
      setCreatorAiVariant(
        generations?.plan === "creator" ? "upgrade" : "subscribe",
      );
      setCreatorAiGateOpen(true);
      return;
    }
    if (block === "limit") {
      setErrorMessage(
        "You've reached your generation limit for this period.",
      );
      return;
    }
```

Replace with:

```typescript
    if (!checkGenerationGate()) return;
```

- [ ] **Step 5: Verify**

```bash
npm run build
```

Expected: no errors. The import of `getAiGenerateBlockReason` is still used (inside `checkGenerationGate`) so TypeScript won't complain about unused imports.

- [ ] **Step 6: Commit**

```bash
git add components/video-generator.tsx
git commit -m "refactor: extract checkGenerationGate callback, deduplicate 3 gate-check blocks"
```

---

## Task 3: Extract `handle403CreatorAiGate` helper (deduplicates 2 identical blocks)

**Files:**
- Modify: `components/video-generator.tsx`

This pattern appears twice — once in `handleFfFileChange` and once in `handleFfGenerate`:

```typescript
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        void refreshGenerations();
        setCreatorAiVariant(data.plan === "creator" ? "upgrade" : "subscribe");
        setCreatorAiGateOpen(true);
        return;
      }
```

`handleGenerate` has the same pattern (lines ~334–339) so we deduplicate all three.

- [ ] **Step 1: Add the `handle403CreatorAiGate` callback inside `VideoGenerator`**

Place it directly after `checkGenerationGate` (added in Task 2):

```typescript
  const handle403CreatorAiGate = useCallback(
    (responsePlan?: string): void => {
      void refreshGenerations();
      setCreatorAiVariant(responsePlan === "creator" ? "upgrade" : "subscribe");
      setCreatorAiGateOpen(true);
    },
    [refreshGenerations, setCreatorAiVariant, setCreatorAiGateOpen],
  );
```

- [ ] **Step 2: Replace the 403 block in `handleGenerate`**

Find:

```typescript
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        void refreshGenerations();
        setCreatorAiVariant(data.plan === "creator" ? "upgrade" : "subscribe");
        setCreatorAiGateOpen(true);
        return;
      }
```

Replace with:

```typescript
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        handle403CreatorAiGate(data.plan);
        return;
      }
```

- [ ] **Step 3: Replace the 403 block in `handleFfFileChange`**

Find:

```typescript
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        void refreshGenerations();
        setCreatorAiVariant(data.plan === "creator" ? "upgrade" : "subscribe");
        setCreatorAiGateOpen(true);
        return;
      }
```

Replace with:

```typescript
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        handle403CreatorAiGate(data.plan);
        return;
      }
```

- [ ] **Step 4: Replace the 403 block in `handleFfGenerate`**

Find:

```typescript
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        void refreshGenerations();
        setCreatorAiVariant(data.plan === "creator" ? "upgrade" : "subscribe");
        setCreatorAiGateOpen(true);
        return;
      }
```

Replace with:

```typescript
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        handle403CreatorAiGate(data.plan);
        return;
      }
```

- [ ] **Step 5: Verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/video-generator.tsx
git commit -m "refactor: extract handle403CreatorAiGate callback, deduplicate 3 error-response blocks"
```

---

## Task 4: Extract `syncGenerations` helper (deduplicates 4 identical blocks)

**Files:**
- Modify: `components/video-generator.tsx`

This pattern appears 4 times — twice in `handleGenerate` (error path and success path) and twice in `handleFfGenerate` (error path and success path):

```typescript
      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        refreshGenerations();
      }
```

- [ ] **Step 1: Add the `syncGenerations` callback inside `VideoGenerator`**

Place it directly after `handle403CreatorAiGate` (added in Task 3):

```typescript
  const syncGenerations = useCallback(
    (genStatus?: GenerationStatus): void => {
      if (genStatus) {
        setGenerationsStatus(genStatus);
      } else {
        refreshGenerations();
      }
    },
    [setGenerationsStatus, refreshGenerations],
  );
```

`GenerationStatus` is already imported at the top of the file from `@/hooks/use-generations`.

- [ ] **Step 2: Replace the 4 occurrences**

In `handleGenerate`, find the error-path block:

```typescript
        if (data.generations) {
          setGenerationsStatus(data.generations);
        } else {
          refreshGenerations();
        }
        throw new Error(data.error || `Request failed (${res.status})`);
```

Replace with:

```typescript
        syncGenerations(data.generations);
        throw new Error(data.error || `Request failed (${res.status})`);
```

In `handleGenerate`, find the success-path block:

```typescript
      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        refreshGenerations();
      }

      setGeneratedVideo(url);
```

Replace with:

```typescript
      syncGenerations(data.generations);

      setGeneratedVideo(url);
```

In `handleFfGenerate`, find the error-path block:

```typescript
        if (data.generations) {
          setGenerationsStatus(data.generations);
        } else {
          refreshGenerations();
        }
        throw new Error(data.error || `Request failed (${res.status})`);
```

Replace with:

```typescript
        syncGenerations(data.generations);
        throw new Error(data.error || `Request failed (${res.status})`);
```

In `handleFfGenerate`, find the success-path block:

```typescript
      if (data.generations) {
        setGenerationsStatus(data.generations);
      } else {
        refreshGenerations();
      }
      setFirstFrameUrl(url);
```

Replace with:

```typescript
      syncGenerations(data.generations);
      setFirstFrameUrl(url);
```

- [ ] **Step 3: Verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/video-generator.tsx
git commit -m "refactor: extract syncGenerations callback, deduplicate 4 status-sync blocks"
```

---

## Task 5: Extract `<VideoLightbox>` component

**Files:**
- Create: `components/video-generator/video-lightbox.tsx`
- Modify: `components/video-generator.tsx`

- [ ] **Step 1: Create `components/video-generator/video-lightbox.tsx`**

```tsx
"use client";

import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoLightboxProps {
  videoUrl: string;
  onClose: () => void;
}

export function VideoLightbox({ videoUrl, onClose }: VideoLightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth z-10"
      >
        <X className="w-8 h-8" />
      </button>
      <div
        className="relative w-full max-w-5xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
          <video
            src={videoUrl}
            controls
            playsInline
            autoPlay
            className="w-full max-h-[80vh] object-contain"
          />
        </div>
        <div className="flex justify-center mt-4">
          <Button
            className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg"
            asChild
          >
            <a href={videoUrl} download target="_blank" rel="noreferrer">
              <Download className="w-4 h-4 mr-2" />
              Download Video
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the import to `components/video-generator.tsx`**

After the last existing import line (around line 43), add:

```typescript
import { VideoLightbox } from "@/components/video-generator/video-lightbox";
```

- [ ] **Step 3: Replace the lightbox JSX in `components/video-generator.tsx`**

Find (near the bottom of the return, before the closing `</div>`):

```tsx
      {lightboxVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
          onClick={() => setLightboxVideo(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxVideo(null)}
            className="absolute top-6 right-6 p-2 text-white/70 hover:text-white smooth z-10"
          >
            <X className="w-8 h-8" />
          </button>
          <div
            className="relative w-full max-w-5xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative rounded-2xl overflow-hidden border border-blue-500/30 bg-black">
              <video
                src={lightboxVideo}
                controls
                playsInline
                autoPlay
                className="w-full max-h-[80vh] object-contain"
              />
            </div>
            <div className="flex justify-center mt-4">
              <Button
                className="bg-white text-black hover:bg-white/90 rounded-xl shadow-lg"
                asChild
              >
                <a
                  href={lightboxVideo}
                  download
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Video
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
```

Replace with:

```tsx
      {lightboxVideo && (
        <VideoLightbox
          videoUrl={lightboxVideo}
          onClose={() => setLightboxVideo(null)}
        />
      )}
```

- [ ] **Step 4: Remove now-unused imports from `video-generator.tsx`**

Check whether `X` from lucide-react is still used anywhere else in the file. If not, remove it from the import line:

```typescript
// Before:
import {
  Video,
  Download,
  RefreshCw,
  Clock,
  X,
  Ratio,
  Palette,
  ImageIcon,
  Frame,
  Trash2,
  RotateCcw,
} from "lucide-react";

// After (if X is unused):
import {
  Video,
  Download,
  RefreshCw,
  Clock,
  Ratio,
  Palette,
  ImageIcon,
  Frame,
  Trash2,
  RotateCcw,
} from "lucide-react";
```

- [ ] **Step 5: Verify**

```bash
npm run build && npm run lint
```

Expected: no errors, no unused-variable warnings.

- [ ] **Step 6: Commit**

```bash
git add components/video-generator/video-lightbox.tsx components/video-generator.tsx
git commit -m "refactor: extract VideoLightbox component from VideoGenerator"
```

---

## Task 6: Extract `<RecentVideosList>` component

**Files:**
- Create: `components/video-generator/recent-videos-list.tsx`
- Modify: `components/video-generator.tsx`

- [ ] **Step 1: Export the `RecentVideo` type and `stylePresets` from `video-generator.tsx`**

Find the `RecentVideo` interface (around line 58):

```typescript
interface RecentVideo {
```

Change to:

```typescript
export interface RecentVideo {
```

Find the `stylePresets` constant (around line 67):

```typescript
const stylePresets = [
```

Change to:

```typescript
export const stylePresets = [
```

- [ ] **Step 2: Create `components/video-generator/recent-videos-list.tsx`**

```tsx
"use client";

import Link from "next/link";
import { Download, RotateCcw, Trash2 } from "lucide-react";
import type { RecentVideo } from "@/components/video-generator";
import { stylePresets } from "@/components/video-generator";

interface RecentVideosListProps {
  videos: RecentVideo[];
  onOpenLightbox: (url: string) => void;
  onRepeat: (item: RecentVideo) => void;
  onDelete: (id: string) => Promise<void>;
}

export function RecentVideosList({
  videos,
  onOpenLightbox,
  onRepeat,
  onDelete,
}: RecentVideosListProps) {
  return (
    <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-foreground">
          Recent generations
        </h3>
        <Link
          href="/profile/generations?tab=video"
          className="text-sm text-blue-400 hover:underline"
        >
          View all
        </Link>
      </div>
      <ul className="space-y-2">
        {videos.map((item) => {
          const styleLabel =
            stylePresets.find((s) => s.id === item.style)?.label ?? item.style;
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 p-2 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
            >
              <button
                type="button"
                onClick={() => onOpenLightbox(item.url)}
                className="w-20 h-14 shrink-0 rounded-lg overflow-hidden border border-blue-500/20 bg-black hover:opacity-80 smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              >
                <video
                  src={item.url}
                  muted
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-cover"
                />
              </button>
              <div className="flex-1 min-w-0">
                <p
                  className="text-sm text-foreground truncate"
                  title={item.prompt}
                >
                  {item.prompt || "Untitled"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {styleLabel} · {item.aspectRatio} · {item.durationSec}s
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onRepeat(item)}
                  title="Repeat with same settings"
                  aria-label="Repeat generation"
                  className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <a
                  href={item.url}
                  download
                  target="_blank"
                  rel="noreferrer"
                  title="Download"
                  aria-label="Download video"
                  className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => void onDelete(item.id)}
                  title="Delete"
                  aria-label="Delete generation"
                  className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Add the import to `components/video-generator.tsx`**

After the `VideoLightbox` import (added in Task 5), add:

```typescript
import { RecentVideosList } from "@/components/video-generator/recent-videos-list";
```

- [ ] **Step 4: Replace the recent-videos JSX in `components/video-generator.tsx`**

Find (inside the `lg:col-span-2` div, after the generated-video section):

```tsx
          {user && recentVideos.length > 0 ? (
            <div className="rounded-2xl border border-blue-500/30 bg-card/50 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground">
                  Recent generations
                </h3>
                <Link
                  href="/profile/generations?tab=video"
                  className="text-sm text-blue-400 hover:underline"
                >
                  View all
                </Link>
              </div>
              <ul className="space-y-2">
                {recentVideos.map((item) => {
                  const styleLabel =
                    stylePresets.find((s) => s.id === item.style)?.label ??
                    item.style;
                  return (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 p-2 rounded-xl border border-blue-500/20 bg-background/30 hover:border-blue-500/40 smooth"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxVideo(item.url)}
                        className="w-20 h-14 shrink-0 rounded-lg overflow-hidden border border-blue-500/20 bg-black hover:opacity-80 smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                      >
                        <video
                          src={item.url}
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm text-foreground truncate"
                          title={item.prompt}
                        >
                          {item.prompt || "Untitled"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {styleLabel} · {item.aspectRatio} · {item.durationSec}s
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => repeatRecentVideo(item)}
                          title="Repeat with same settings"
                          aria-label="Repeat generation"
                          className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <a
                          href={item.url}
                          download
                          target="_blank"
                          rel="noreferrer"
                          title="Download"
                          aria-label="Download video"
                          className="p-2 rounded-lg text-muted-foreground hover:text-blue-400 hover:bg-blue-500/10 smooth"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void deleteRecentVideo(item.id)}
                          title="Delete"
                          aria-label="Delete generation"
                          className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 smooth"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
```

Replace with:

```tsx
          {user && recentVideos.length > 0 ? (
            <RecentVideosList
              videos={recentVideos}
              onOpenLightbox={(url) => setLightboxVideo(url)}
              onRepeat={repeatRecentVideo}
              onDelete={deleteRecentVideo}
            />
          ) : null}
```

- [ ] **Step 5: Remove now-unused imports from `video-generator.tsx`**

`Link`, `Trash2`, `RotateCcw` may now be unused in `video-generator.tsx`. Also `stylePresets` is no longer referenced in JSX (it was used for the `styleLabel` lookup). Remove each from its import line only if it is no longer referenced anywhere else in `video-generator.tsx`. Do a quick search for each name before removing.

- [ ] **Step 6: Verify**

```bash
npm run build && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/video-generator/recent-videos-list.tsx components/video-generator.tsx
git commit -m "refactor: extract RecentVideosList component from VideoGenerator"
```

---

## Task 7: Extract `<FirstFrameDialog>` component

**Files:**
- Create: `components/video-generator/first-frame-dialog.tsx`
- Modify: `components/video-generator.tsx`

This is the largest extraction. The dialog owns all `ff*` state, `library*` state, and both `handleFfFileChange`/`handleFfGenerate` handlers. The parent retains the selected frame URL (`firstFrameUrl`) since it is consumed by the main generate form.

- [ ] **Step 1: Create `components/video-generator/first-frame-dialog.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { RefreshCw, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CREATOR_AI_REQUIRED_CODE,
} from "@/lib/ai-generation-gate";
import type { GenerationStatus } from "@/hooks/use-generations";

/** Matches `/api/generations/image` styles. */
const ffImageStyles = [
  { id: "realistic", label: "Realistic" },
  { id: "anime", label: "Anime" },
  { id: "3d", label: "3D Render" },
  { id: "digital-art", label: "Digital Art" },
  { id: "oil-painting", label: "Oil Painting" },
  { id: "watercolor", label: "Watercolor" },
];

const ffImageRatios = [
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
];

const triggerClasses =
  "w-full h-11 bg-background/50 border-blue-500/30 text-foreground rounded-xl px-4 hover:border-blue-500/60 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/30";

const ffDialogTabTriggerClass =
  "text-xs sm:text-sm text-muted-foreground data-[state=active]:border-transparent data-[state=active]:bg-linear-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-blue-500/30 data-[state=active]:dark:from-blue-600 data-[state=active]:dark:to-blue-500";

type ApiGenerationRecord = {
  id: string;
  status: string;
  result: Record<string, unknown> | null;
};

interface FirstFrameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the chosen frame URL when the user picks an image. */
  onFrameSelected: (url: string) => void;
  /** User id — used to gate the library load. Null when signed out. */
  userId: string | undefined | null;
  /** Returns true if the caller is clear to proceed; false if a gate was triggered. */
  checkGate: () => boolean;
  /** Call when a 403 with CREATOR_AI_REQUIRED_CODE is received. */
  onCreatorAiGate: (plan?: string) => void;
  /** Call to sync generation status after a successful/failed API response. */
  syncGenerations: (genStatus?: GenerationStatus) => void;
  /** Call to surface an error message to the parent. */
  onError: (message: string) => void;
  generationsLoading: boolean;
}

export function FirstFrameDialog({
  open,
  onOpenChange,
  onFrameSelected,
  userId,
  checkGate,
  onCreatorAiGate,
  syncGenerations,
  onError,
  generationsLoading,
}: FirstFrameDialogProps) {
  const [ffUploading, setFfUploading] = useState(false);
  const [ffGenLoading, setFfGenLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState<{ id: string; url: string }[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [ffPrompt, setFfPrompt] = useState("");
  const [ffStyle, setFfStyle] = useState("realistic");
  const [ffRatio, setFfRatio] = useState("1:1");

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLibraryLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          "/api/me/generation-records?tool=image&limit=100",
          { credentials: "include", cache: "no-store" },
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { items?: ApiGenerationRecord[] };
        const flat: { id: string; url: string }[] = [];
        for (const row of data.items ?? []) {
          if (row.status !== "ok" || !row.result) continue;
          const imgs = row.result.images;
          if (!Array.isArray(imgs)) continue;
          imgs.forEach((u, i) => {
            if (typeof u === "string") flat.push({ id: `${row.id}-${i}`, url: u });
          });
        }
        if (!cancelled) setLibraryItems(flat);
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  const handleFfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!checkGate()) return;

    setFfUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/generations/video/first-frame-upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
        code?: string;
        plan?: string;
      };
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        onCreatorAiGate(data.plan);
        return;
      }
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      if (!data.url) throw new Error("No URL returned");
      onFrameSelected(data.url);
      onOpenChange(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to upload image");
    } finally {
      setFfUploading(false);
    }
  };

  const handleFfGenerate = async () => {
    if (!ffPrompt.trim() || ffGenLoading || generationsLoading) return;
    if (!checkGate()) return;

    setFfGenLoading(true);
    try {
      const res = await fetch("/api/generations/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: ffPrompt.trim(),
          style: ffStyle,
          aspect_ratio: ffRatio,
        }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        images?: string[];
        error?: string;
        code?: string;
        plan?: string;
        generations?: GenerationStatus;
      };
      if (res.status === 403 && data.code === CREATOR_AI_REQUIRED_CODE) {
        onCreatorAiGate(data.plan);
        return;
      }
      if (!res.ok) {
        syncGenerations(data.generations);
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const url = data.images?.[0];
      if (!url) throw new Error("No image returned");
      syncGenerations(data.generations);
      onFrameSelected(url);
      onOpenChange(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setFfGenLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Choose first frame</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="generate" className="w-full mt-2">
          <TabsList className="grid w-full grid-cols-3 h-auto gap-1.5 rounded-xl border border-blue-500/25 bg-muted/40 p-1.5">
            <TabsTrigger value="generate" className={ffDialogTabTriggerClass}>
              Generate
            </TabsTrigger>
            <TabsTrigger value="library" className={ffDialogTabTriggerClass}>
              Library
            </TabsTrigger>
            <TabsTrigger value="upload" className={ffDialogTabTriggerClass}>
              From device
            </TabsTrigger>
          </TabsList>

          <TabsContent value="generate" className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Creates a still using one image generation, then uses it as the first frame.
            </p>
            <textarea
              value={ffPrompt}
              onChange={(e) => setFfPrompt(e.target.value)}
              placeholder="Describe the starting image..."
              rows={3}
              className="w-full bg-background/50 border border-blue-500/30 rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500/60"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Style
                </label>
                <Select value={ffStyle} onValueChange={setFfStyle}>
                  <SelectTrigger className={triggerClasses}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ffImageStyles.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                  Aspect
                </label>
                <Select value={ffRatio} onValueChange={setFfRatio}>
                  <SelectTrigger className={triggerClasses}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ffImageRatios.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="button"
              disabled={!ffPrompt.trim() || ffGenLoading || generationsLoading}
              className="w-full bg-linear-to-r from-blue-600 to-blue-500 text-white hover:from-blue-500 hover:to-blue-400 rounded-xl"
              onClick={() => void handleFfGenerate()}
            >
              {ffGenLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Generating image…
                </>
              ) : (
                <>
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Generate image &amp; use
                </>
              )}
            </Button>
          </TabsContent>

          <TabsContent value="library" className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Images from your past image generations.
            </p>
            {libraryLoading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
            ) : libraryItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No images yet. Generate some on the Image page first.
              </p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-72 overflow-y-auto pr-1">
                {libraryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="relative aspect-square rounded-lg overflow-hidden border border-blue-500/25 bg-black hover:border-blue-500/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
                    onClick={() => {
                      onFrameSelected(item.url);
                      onOpenChange(false);
                    }}
                  >
                    <img src={item.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="pt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Upload a JPEG, PNG, WebP, or GIF (max 15 MB).
            </p>
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-blue-500/40 bg-background/40 px-4 py-10 cursor-pointer hover:border-blue-500/60 smooth">
              <ImageIcon className="w-10 h-10 text-blue-400/80" />
              <span className="text-sm text-foreground">
                {ffUploading ? "Uploading…" : "Click to select a file"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="sr-only"
                disabled={ffUploading}
                onChange={(e) => void handleFfFileChange(e)}
              />
            </label>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Add the import to `components/video-generator.tsx`**

After the `RecentVideosList` import (added in Task 6), add:

```typescript
import { FirstFrameDialog } from "@/components/video-generator/first-frame-dialog";
```

- [ ] **Step 3: Remove `ff*` and `library*` state from `VideoGenerator`**

Delete these lines from the `VideoGenerator` function body (the ones that are now owned by `FirstFrameDialog`):

```typescript
  const [ffUploading, setFfUploading] = useState(false);
  const [ffGenLoading, setFfGenLoading] = useState(false);
  const [libraryItems, setLibraryItems] = useState<{ id: string; url: string }[]>(
    [],
  );
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [ffPrompt, setFfPrompt] = useState("");
  const [ffStyle, setFfStyle] = useState("realistic");
  const [ffRatio, setFfRatio] = useState("1:1");
```

- [ ] **Step 4: Remove the library `useEffect` from `VideoGenerator`**

Delete the entire `useEffect` block (around lines 241–275) that fetches `/api/me/generation-records?tool=image`:

```typescript
  useEffect(() => {
    if (!firstFrameDialogOpen || !user) return;
    let cancelled = false;
    setLibraryLoading(true);
    void (async () => {
      try {
        // ... fetch library images ...
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firstFrameDialogOpen, user?.id]);
```

- [ ] **Step 5: Remove `handleFfFileChange` and `handleFfGenerate` from `VideoGenerator`**

Delete the entire `handleFfFileChange` function (around lines 372–437) and the entire `handleFfGenerate` function (around lines 439–520) from `VideoGenerator`.

- [ ] **Step 6: Replace the First Frame button + inline Dialog JSX with `<FirstFrameDialog>`**

In the JSX, find the `<Dialog open={firstFrameDialogOpen} ...>` block (a large block starting around line 574). It currently contains the `<Button>` trigger AND the `<DialogContent>`. Replace the entire `<Dialog>…</Dialog>` wrapper with just the trigger button, and add `<FirstFrameDialog>` as a sibling element.

Find:

```tsx
                <Dialog
                  open={firstFrameDialogOpen}
                  onOpenChange={setFirstFrameDialogOpen}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    className="border border-blue-500/40 bg-blue-500/10 text-foreground hover:bg-blue-500/20"
                    onClick={() => setFirstFrameDialogOpen(true)}
                  >
                    <Frame className="w-4 h-4 mr-2 shrink-0" />
                    First frame
                  </Button>
                  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
                    ... (all dialog content) ...
                  </DialogContent>
                </Dialog>
```

Replace with:

```tsx
                  <Button
                    type="button"
                    variant="secondary"
                    className="border border-blue-500/40 bg-blue-500/10 text-foreground hover:bg-blue-500/20"
                    onClick={() => setFirstFrameDialogOpen(true)}
                  >
                    <Frame className="w-4 h-4 mr-2 shrink-0" />
                    First frame
                  </Button>
```

Then, after the closing `</form>` tag and before the `<div className="lg:col-span-2 ...">` div, add:

```tsx
        <FirstFrameDialog
          open={firstFrameDialogOpen}
          onOpenChange={setFirstFrameDialogOpen}
          onFrameSelected={(url) => {
            setFirstFrameUrl(url);
            setFirstFrameDialogOpen(false);
          }}
          userId={user?.id}
          checkGate={checkGenerationGate}
          onCreatorAiGate={handle403CreatorAiGate}
          syncGenerations={syncGenerations}
          onError={setErrorMessage}
          generationsLoading={generationsLoading}
        />
```

- [ ] **Step 7: Remove now-unused imports from `video-generator.tsx`**

After the above changes, the following imports are no longer needed in `video-generator.tsx`. Remove each only if it is not referenced elsewhere in the file:

- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` from `@/components/ui/dialog`
- `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger` from `@/components/ui/tabs`
- `ImageIcon`, `RefreshCw` from `lucide-react` (check — `RefreshCw` is still used in the submit button spinner)
- `ffImageStyles`, `ffImageRatios`, `ffDialogTabTriggerClass` constants — delete them from the module level of `video-generator.tsx`

- [ ] **Step 8: Verify**

```bash
npm run build && npm run lint
```

Expected: no errors. The component should be approximately 420–450 lines.

- [ ] **Step 9: Commit**

```bash
git add components/video-generator/first-frame-dialog.tsx components/video-generator.tsx
git commit -m "refactor: extract FirstFrameDialog component, reduce VideoGenerator to ~450 lines"
```

---

## Self-Review

**1. Spec coverage:**
- C1 (gate-check duplication) → Task 2 ✓
- C2 (403 response duplication) → Task 3 ✓
- C3 (status-sync duplication) → Task 4 ✓
- H1 (1043-line component) → Tasks 5 + 6 + 7 ✓
- H2 (ff* state mixed in root) → Task 7 ✓
- H3 (`triggerClasses` inside component) → Task 1 ✓

**2. Placeholder scan:** No "TBD" or "implement later" phrases present.

**3. Type consistency:**
- `RecentVideo` is exported from `video-generator.tsx` in Task 6, imported into `recent-videos-list.tsx` ✓
- `GenerationStatus` imported from `@/hooks/use-generations` in both parent and `first-frame-dialog.tsx` ✓
- `checkGate`, `onCreatorAiGate`, `syncGenerations` prop names defined in Task 7 Step 1 match usage in Task 7 Step 6 ✓
- `handle403CreatorAiGate` defined in Task 3 → passed as `onCreatorAiGate` prop in Task 7 ✓

**Risks:**
- `user?.id` — the `User` type must have an `id: string` field. Verify via TypeScript compilation.
- The `Dialog` import is removed from `video-generator.tsx` in Task 7. Confirm no other dialog usage remains in the file before removing.
- Task 5: If `X` icon is used elsewhere in `video-generator.tsx` (e.g. in a close button not part of the lightbox), do NOT remove it from imports.
