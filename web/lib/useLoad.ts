"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api";
import { useAuth } from "./auth";

/** GET `path` once signed in; pass null to skip. */
export function useLoad<T>(path: string | null) {
  const { staff } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!path || !staff) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [path, staff]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, error, reload };
}

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
