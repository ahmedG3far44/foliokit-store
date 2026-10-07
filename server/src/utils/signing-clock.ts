// Presigned URLs must use storage time, even when the host clock is incorrect.
// A monotonic clock keeps the cached time valid if the OS clock changes.
export function createSigningClock(readStorageTime: () => Promise<number>, elapsed = () => performance.now()) {
  let anchor: { time: number; elapsed: number } | undefined;
  let refreshAt = -Infinity;
  let pending: Promise<void> | undefined;

  return async (): Promise<Date> => {
    if (elapsed() >= refreshAt && !pending) {
      pending = (async () => {
        try {
          const time = await readStorageTime();
          if (!Number.isFinite(time)) throw new Error("Invalid storage date");
          anchor = { time, elapsed: elapsed() };
          refreshAt = elapsed() + 5 * 60_000;
        } catch {
          // Keep the last known storage time through a temporary network failure.
          refreshAt = elapsed() + 30_000;
        }
      })().finally(() => { pending = undefined; });
    }
    await pending;
    return new Date(anchor ? anchor.time + elapsed() - anchor.elapsed : Date.now());
  };
}
