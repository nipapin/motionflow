"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface VideoMuteCtx {
  muted: boolean;
  toggle: () => void;
}

const Ctx = createContext<VideoMuteCtx>({ muted: true, toggle: () => {} });

export function VideoMuteProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(true);
  const toggle = useCallback(() => setMuted((m) => !m), []);
  return <Ctx value={{ muted, toggle }}>{children}</Ctx>;
}

export function useVideoMute() {
  return useContext(Ctx);
}
