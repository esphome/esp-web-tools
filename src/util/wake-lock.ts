/**
 * Holds a screen wake lock while wanted, so the display doesn't sleep (and the
 * tab isn't throttled) in the middle of an install. Does nothing in browsers
 * without the Screen Wake Lock API.
 *
 * The browser drops the lock whenever the page is hidden, so it is requested
 * again when the page becomes visible while the lock is still wanted.
 */
export class ScreenWakeLock {
  private _wanted = false;

  private _sentinel?: WakeLockSentinel;

  public async acquire(): Promise<void> {
    if (this._wanted) {
      return;
    }
    this._wanted = true;
    document.addEventListener("visibilitychange", this._handleVisibility);
    await this._request();
  }

  public async release(): Promise<void> {
    if (!this._wanted) {
      return;
    }
    this._wanted = false;
    document.removeEventListener("visibilitychange", this._handleVisibility);
    const sentinel = this._sentinel;
    this._sentinel = undefined;
    try {
      await sentinel?.release();
    } catch (err) {
      console.warn("Failed to release screen wake lock", err);
    }
  }

  private _handleVisibility = () => {
    if (document.visibilityState === "visible") {
      this._request();
    }
  };

  private async _request(): Promise<void> {
    if (!("wakeLock" in navigator) || this._sentinel) {
      return;
    }
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (!this._wanted) {
        // Released while the request was in flight.
        await sentinel.release();
        return;
      }
      this._sentinel = sentinel;
      sentinel.addEventListener("release", () => {
        if (this._sentinel === sentinel) {
          this._sentinel = undefined;
        }
      });
    } catch (err) {
      // Denied (e.g. low battery or page not visible). Installing still works.
      console.warn("Failed to acquire screen wake lock", err);
    }
  }
}
