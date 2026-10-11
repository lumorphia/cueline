// 端末の読み上げの声の一覧。Chrome は後から voiceschanged で届くので待つ
import { sortVoices } from "@timeline-call/speech";
import { useEffect, useState } from "react";

export function useVoices(language: string): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const load = () => setVoices(sortVoices(synth.getVoices(), language));
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => synth.removeEventListener?.("voiceschanged", load);
  }, [language]);
  return voices;
}
