"use client";

import { useSyncExternalStore } from "react";
import {
  isPremiereGalSubdomainHost,
  premiereGalPaths,
  type PremiereGalPaths,
} from "@/lib/premiere-gal-paths";

const subscribe = () => () => {};

function getClientOnSubdomain(): boolean {
  return isPremiereGalSubdomainHost(window.location.hostname);
}

/** Defaults to main-site `/premiere-gal/*` paths during SSR; switches on subdomain after hydrate. */
export function usePremiereGalPaths(): PremiereGalPaths {
  const onSubdomain = useSyncExternalStore(subscribe, getClientOnSubdomain, () => false);
  return premiereGalPaths(onSubdomain);
}
