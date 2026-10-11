import { describe, expect, it } from "vitest";
import { cacheName, precacheList, strategyFor } from "./strategy.ts";

const ORIGIN = "https://tc.example";

describe("strategyFor", () => {
  const precache = ["/", "/assets/index-abc.js", "/manifest.webmanifest"];

  it("answers a page navigation with the saved app", () => {
    expect(
      strategyFor({ url: `${ORIGIN}/play/x`, mode: "navigate", method: "GET" }, ORIGIN, precache),
    ).toBe("app-shell");
  });

  it("answers a saved file from the cache first", () => {
    expect(
      strategyFor(
        { url: `${ORIGIN}/assets/index-abc.js`, mode: "cors", method: "GET" },
        ORIGIN,
        precache,
      ),
    ).toBe("cache-first");
  });

  it("leaves a file it did not save to the network", () => {
    expect(
      strategyFor({ url: `${ORIGIN}/other.js`, mode: "cors", method: "GET" }, ORIGIN, precache),
    ).toBe("network");
  });

  it("leaves other sites to the network (VOICEVOX on this computer)", () => {
    expect(
      strategyFor(
        { url: "http://127.0.0.1:50021/version", mode: "cors", method: "GET" },
        ORIGIN,
        precache,
      ),
    ).toBe("network");
  });

  it("leaves anything but GET to the network", () => {
    expect(
      strategyFor({ url: `${ORIGIN}/`, mode: "navigate", method: "POST" }, ORIGIN, precache),
    ).toBe("network");
  });
});

describe("precacheList", () => {
  it("lists the page and the built files without the service worker, headers and maps", () => {
    expect(
      precacheList([
        "index.html",
        "assets/index-abc.js",
        "assets/index-abc.js.map",
        "sw.js",
        "_headers",
        "icons/192.png",
      ]),
    ).toEqual(["/", "/assets/index-abc.js", "/icons/192.png"]);
  });
});

describe("cacheName", () => {
  it("changes when the list changes", () => {
    expect(cacheName(["/", "/a.js"])).not.toBe(cacheName(["/", "/b.js"]));
  });

  it("stays the same for the same list in another order", () => {
    expect(cacheName(["/a.js", "/"])).toBe(cacheName(["/", "/a.js"]));
  });
});
