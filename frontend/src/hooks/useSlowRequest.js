import { useEffect, useState } from 'react';

// The API runs on Render's free tier, which spins the instance down after a
// spell with no traffic. The next request has to wait for a cold start, and
// that can run to the better part of a minute — long enough that a bare
// spinner reads as a broken app. Anything past a few seconds is almost
// certainly that wake-up, so we say so instead of leaving people guessing.
export const COLD_START_HINT =
  'The API sleeps when the clinic is quiet, so the first request has to wake it. ' +
  'This can take up to a minute — later pages are quick.';

export function useSlowRequest(active, delay = 4000) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return;

    const id = setTimeout(() => setSlow(true), delay);
    return () => {
      clearTimeout(id);
      setSlow(false);
    };
  }, [active, delay]);

  return slow;
}
