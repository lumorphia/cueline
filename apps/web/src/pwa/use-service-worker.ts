// Service Worker を登録し、新しい版が待っているかを知らせる。入れ替えは利用者が「更新」を押したときだけ
import { useCallback, useEffect, useState } from "react";
import { scriptUrl } from "../trusted-types.ts";

export function useServiceWorker() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // 開発中 (vite dev) は登録しない。ビルドしたものだけ
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let registration: ServiceWorkerRegistration | null = null;
    const watch = (reg: ServiceWorkerRegistration) => {
      if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        installing?.addEventListener("statechange", () => {
          // 初めての登録 (controller がまだ無い) は更新ではない
          if (installing.state === "installed" && navigator.serviceWorker.controller)
            setWaiting(installing);
        });
      });
    };
    navigator.serviceWorker
      .register(scriptUrl("/sw.js") as unknown as string)
      .then((reg) => {
        registration = reg;
        watch(reg);
      })
      .catch(() => {
        // 登録できなくても、オンラインでは使える
      });
    // 見えるようになったときに、新しい版が出ていないか確かめる
    const onVisible = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const apply = useCallback(() => {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), {
      once: true,
    });
    waiting.postMessage("skip-waiting");
  }, [waiting]);

  return { updateReady: waiting !== null, apply };
}
