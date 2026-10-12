// 記録して作る (要件 FR-008、05 の「記録して作る」)。プルカウントか開始で時計を動かし、「いま」を押した時刻を集める。
// 時計はエンジンと同じく単調時計から毎回計算する。ゲームには触れない
import type { Script } from "@cueline/script";
import { addEvent, addPhase } from "./draft.ts";

export type RecordedPhase = { stamps: readonly number[] };

const tenth = (seconds: number) => Math.round(seconds * 10) / 10;

export function createRecorder(now: () => number) {
  let anchor: { logical: number; mono: number } | null = null;
  // 記録したフェーズ。start はそのフェーズが始まった論理時刻 (秒)
  let phases: { start: number; stamps: number[] }[] = [{ start: 0, stamps: [] }];

  const logical = () => (anchor ? anchor.logical + (now() - anchor.mono) / 1000 : 0);

  return {
    startCountdown(seconds: number) {
      anchor = { logical: -seconds, mono: now() };
    },
    start() {
      anchor = { logical: 0, mono: now() };
    },
    running: () => anchor !== null,
    /** 今の論理時刻 (秒) と、今のフェーズの中の時刻 */
    clock: () => ({
      logical: logical(),
      phase: phases.length - 1,
      phaseTime: logical() - (phases.at(-1)?.start ?? 0),
    }),
    stamp(): { phase: number; at: number } | null {
      if (!anchor) return null;
      const current = phases.at(-1) as { start: number; stamps: number[] };
      const at = tenth(logical() - current.start);
      phases = [...phases.slice(0, -1), { ...current, stamps: [...current.stamps, at] }];
      return { phase: phases.length - 1, at };
    },
    nextPhase() {
      phases = [...phases, { start: logical(), stamps: [] }];
    },
    /** 直前に足したものを消す。今のフェーズが空なら、そのフェーズを消す */
    undo() {
      const current = phases.at(-1) as { start: number; stamps: number[] };
      if (current.stamps.length > 0) {
        phases = [...phases.slice(0, -1), { ...current, stamps: current.stamps.slice(0, -1) }];
      } else if (phases.length > 1) {
        phases = phases.slice(0, -1);
      }
    },
    result: (): RecordedPhase[] => phases.map((p) => ({ stamps: p.stamps })),
  };
}

/** 記録を下書きに足す。最初のフェーズの記録は選んだフェーズに、後のものは手動のフェーズを足してそこに */
export function applyRecording(
  script: Script,
  phaseIndex: number,
  recorded: readonly RecordedPhase[],
): Script {
  return recorded.reduce((s, phase, i) => {
    const target = i === 0 ? phaseIndex : s.phases.length;
    const withPhase = i === 0 ? s : addPhase(s);
    return phase.stamps.reduce((acc, at) => addEvent(acc, target, { at }), withPhase);
  }, script);
}
