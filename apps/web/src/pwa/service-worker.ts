// Service Worker (要件 NFR-201)。ビルドのときに vite.config.ts が、この版のファイルの一覧を __TC_PRECACHE__ に埋め込む。
// 新しい版は入れるだけで待たせ (skipWaiting しない)、画面の「更新」で入れ替える (再生中は入れ替えない。01)
import { cacheName, strategyFor } from "./strategy.ts";

type ExtendableEvent = Event & { waitUntil(promise: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith(response: Promise<Response>): void;
};
type MessageEventLike = Event & { data: unknown };
type ServiceWorkerScope = {
  location: Location;
  addEventListener(type: "install" | "activate", fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", fn: (e: FetchEvent) => void): void;
  addEventListener(type: "message", fn: (e: MessageEventLike) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
};

const sw = self as unknown as ServiceWorkerScope;
const PRECACHE: string[] = JSON.parse("__TC_PRECACHE__");
const CACHE = cacheName(PRECACHE);

sw.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("tc-") && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

sw.addEventListener("fetch", (e) => {
  const strategy = strategyFor(e.request, sw.location.origin, PRECACHE);
  if (strategy === "network") return;
  const key = strategy === "app-shell" ? "/" : e.request;
  e.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(key))
      .then((hit) => hit ?? fetch(e.request)),
  );
});

sw.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") void sw.skipWaiting();
});
