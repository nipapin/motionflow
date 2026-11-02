"use client";

import { useState } from "react";

export function SpunkramProjectPreview({ image, video, name }: { image: string; video?: string; name: string }) {
  const [playing, setPlaying] = useState(false);
  if (playing && video) {
    return video.startsWith("https://www.youtube.com/embed/") ? (
      <iframe src={video} title={name} className="aspect-video w-full rounded-xl" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
    ) : (
      <video src={video} poster={image} controls autoPlay playsInline className="aspect-video w-full rounded-xl bg-black object-contain" />
    );
  }
  return (
    <button type="button" disabled={!video} onClick={() => setPlaying(true)} aria-label={`Play preview: ${name}`} className="group relative block w-full overflow-hidden rounded-xl disabled:cursor-default">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt={name} className="h-auto w-full object-cover" />
      {video && <span className="absolute bottom-4 left-4 grid h-12 w-12 place-items-center rounded-full border border-brand-300/50 bg-gradient-to-br from-brand-700/80 to-brand-300/80 text-white backdrop-blur-sm transition-transform group-hover:scale-105"><svg viewBox="0 0 24 24" className="h-5 w-5 translate-x-0.5" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg></span>}
    </button>
  );
}
