/**
 * Thin MRAID 2.0 adapter. Ad networks inject `window.mraid`. The ad must wait for
 * the `ready` state, wait until it is viewable, and open the store through
 * `mraid.open` instead of changing the location itself.
 */

export interface MraidApi {
  getState(): string;
  isViewable(): boolean;
  addEventListener(event: string, listener: (...args: unknown[]) => void): void;
  removeEventListener(event: string, listener: (...args: unknown[]) => void): void;
  open(url: string): void;
}

export interface AdHost {
  mraid?: MraidApi;
  open(url: string, target?: string): unknown;
}

/**
 * Start the ad once the network says it is ready and visible.
 * Without MRAID (local development, a plain browser) it starts at once.
 * `start` runs at most once.
 */
export function whenAdReady(start: () => void, host: AdHost = window as unknown as AdHost): void {
  const mraid = host.mraid;
  let started = false;
  const begin = (): void => {
    if (started) return;
    started = true;
    start();
  };

  if (!mraid) {
    begin();
    return;
  }

  const onViewable = (): void => {
    if (mraid.isViewable()) {
      begin();
      return;
    }
    const listener = (viewable: unknown): void => {
      if (viewable) {
        mraid.removeEventListener("viewableChange", listener);
        begin();
      }
    };
    mraid.addEventListener("viewableChange", listener);
  };

  if (mraid.getState() === "loading") {
    const ready = (): void => {
      mraid.removeEventListener("ready", ready);
      onViewable();
    };
    mraid.addEventListener("ready", ready);
  } else {
    onViewable();
  }
}

/** Tell the ad when it becomes hidden or visible again, so it can pause. */
export function onViewableChange(
  callback: (viewable: boolean) => void,
  host: AdHost = window as unknown as AdHost,
): void {
  host.mraid?.addEventListener("viewableChange", (viewable) => callback(Boolean(viewable)));
}

/** Open the store page. Uses `mraid.open` inside a network, a new tab elsewhere. */
export function openStore(url: string, host: AdHost = window as unknown as AdHost): void {
  if (host.mraid) {
    host.mraid.open(url);
    return;
  }
  host.open(url, "_blank");
}
