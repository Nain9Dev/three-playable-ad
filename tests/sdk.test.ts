import { describe, expect, it, vi } from "vitest";
import { openStore, whenAdReady, type AdHost, type MraidApi } from "../src/ad/sdk.ts";

type Listener = (...args: unknown[]) => void;

function fakeMraid(state: string, viewable: boolean) {
  const listeners = new Map<string, Listener[]>();
  const open = vi.fn<(url: string) => void>();
  const api: MraidApi = {
    getState: () => state,
    isViewable: () => viewable,
    addEventListener: (event, listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
    },
    removeEventListener: (event, listener) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener));
    },
    open,
  };
  const fire = (event: string, ...args: unknown[]): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
  };
  return { api, open, fire };
}

const noopOpen = (): void => undefined;

describe("whenAdReady", () => {
  it("starts at once when there is no MRAID", () => {
    const start = vi.fn();
    whenAdReady(start, { open: noopOpen });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("starts at once when MRAID is ready and the ad is viewable", () => {
    const start = vi.fn();
    whenAdReady(start, { mraid: fakeMraid("default", true).api, open: noopOpen });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("waits for the ready event while MRAID is loading", () => {
    const { api, fire } = fakeMraid("loading", true);
    const start = vi.fn();
    whenAdReady(start, { mraid: api, open: noopOpen });
    expect(start).not.toHaveBeenCalled();
    fire("ready");
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("waits until the ad is viewable", () => {
    const { api, fire } = fakeMraid("default", false);
    const start = vi.fn();
    whenAdReady(start, { mraid: api, open: noopOpen });
    expect(start).not.toHaveBeenCalled();
    fire("viewableChange", false);
    expect(start).not.toHaveBeenCalled();
    fire("viewableChange", true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("never starts twice", () => {
    const { api, fire } = fakeMraid("default", false);
    const start = vi.fn();
    whenAdReady(start, { mraid: api, open: noopOpen });
    fire("viewableChange", true);
    fire("viewableChange", true);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("openStore", () => {
  it("uses mraid.open inside an ad network", () => {
    const { api, open } = fakeMraid("default", true);
    const hostOpen = vi.fn();
    const host: AdHost = { mraid: api, open: hostOpen };
    openStore("https://example.com/store", host);
    expect(open).toHaveBeenCalledWith("https://example.com/store");
    expect(hostOpen).not.toHaveBeenCalled();
  });

  it("opens a new tab when there is no MRAID", () => {
    const hostOpen = vi.fn();
    openStore("https://example.com/store", { open: hostOpen });
    expect(hostOpen).toHaveBeenCalledWith("https://example.com/store", "_blank");
  });
});
