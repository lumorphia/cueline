// Worker の中で setTimeout し、起きたらメインスレッドへ知らせる (docs/design/03-engine.md)。
const handles = new Map();

self.onmessage = (e) => {
  const { type, id, delayMs } = e.data;
  if (type === "set") {
    handles.set(
      id,
      setTimeout(() => {
        handles.delete(id);
        self.postMessage({ type: "fire", id });
      }, delayMs),
    );
  } else if (type === "clear") {
    clearTimeout(handles.get(id));
    handles.delete(id);
  }
};
