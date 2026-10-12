import { useEffect, useEffectEvent, useState } from "react";

// Runs load(signal) whenever key changes (or on retry). A null key loads nothing.
// Only the result for the current key and attempt is kept, so a slow earlier
// response can never overwrite a newer one.
export function useResource(key, load) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  // Read the latest loader without re-running the effect for every new function identity.
  const run = useEffectEvent(signal => load(signal));
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    // Wrapping in a promise turns a synchronous throw into an error state too.
    new Promise(resolve => resolve(run(controller.signal))).then(
      data => { if (!controller.signal.aborted) setResult({ key, attempt, data }); },
      error => { if (!controller.signal.aborted) setResult({ key, attempt, error: error.message }); },
    );
    return () => controller.abort();
  }, [key, attempt]);
  const current = result?.key === key && result?.attempt === attempt ? result : null;
  return { data: current?.data, error: current?.error, loading: Boolean(key && !current), retry: () => setAttempt(value => value + 1) };
}
