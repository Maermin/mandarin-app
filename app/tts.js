// Text-to-speech wrapper. Encapsulated so the engine is swappable (spec: TTS is
// baseline/device-dependent). Browser SpeechSynthesis with zh-CN voice.
export function ttsAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let voice = null;
function pickVoice() {
  if (!ttsAvailable()) return null;
  if (voice) return voice;
  const voices = window.speechSynthesis.getVoices() || [];
  voice =
    voices.find((v) => /zh[-_]?CN/i.test(v.lang)) ||
    voices.find((v) => /^zh/i.test(v.lang)) ||
    null;
  return voice;
}

export function speak(text, lang = "zh-CN") {
  if (!ttsAvailable()) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 0.85;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}
