"use client";

import { createContext } from "react";

/** Hidden tools keep their work, but refresh quota when they become active again. */
export const AiWorkspaceActiveContext = createContext(true);

/** Workspace quota slot; undefined means the tool is rendered on its own. */
export const AiWorkspaceQuotaContext = createContext<HTMLElement | null | undefined>(undefined);
