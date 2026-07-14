"use client";

import { useEffect, useState } from "react";

/** Port of `resources/js/premieregal/hooks/usePackageVersion.jsx`. */
export function usePackageVersion(): string {
  const [version, setVersion] = useState("");
  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const res = await fetch("/api/get-package-version");
        if (!res.ok) {
          setVersion("");
          return;
        }
        const data = await res.json();
        const market = data.market;
        const packages = market.Packages;
        const anyPack = packages[0];
        setVersion(anyPack.version);
      } catch {
        setVersion("");
      }
    };
    fetchVersion();
  }, []);
  return version;
}
