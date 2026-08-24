const active = new Set<HTMLAudioElement>();

export function playCry(url: string) {
  if (!url) return;
  try {
    const audio = new Audio(url);
    audio.volume = 0.45;
    const done = () => {
      active.delete(audio);
      audio.src = "";
    };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    active.add(audio);
    void audio.play().catch(() => {
      active.delete(audio);
    });
  } catch {
    // autoplay blocked or unsupported — ignore
  }
}
