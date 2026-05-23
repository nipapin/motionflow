# public/

Static assets served from the root `/`.

## Add your hero video

Drop a file named `hero.mp4` here and it will autoplay (muted, looped) in the hero bento tile:

```
public/hero.mp4
```

Optionally, add `public/hero-poster.jpg` — it's shown while the video is loading.

Recommended format:

- MP4 (H.264) — widest compatibility
- ~1080p, 5–15 seconds, under ~5 MB for fast loading
- No sound needed (the player is muted)

If no file is provided, the tile still looks fine thanks to a gradient fallback.
