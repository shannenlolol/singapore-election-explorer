import { useEffect, useState } from "react";
import { apiGet } from "../../api.js";

export function useResource(path) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    apiGet(path, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ path, attempt, data }); },
      error => { if (!controller.signal.aborted) setResult({ path, attempt, error: error.message }); },
    );
    return () => controller.abort();
  }, [path, attempt]);
  const current = result?.path === path && result?.attempt === attempt ? result : null;
  return { data: current?.data, error: current?.error, loading: Boolean(path && !current), retry: () => setAttempt(value => value + 1) };
}
