/**
 * Screen-reader announcement helpers. Kept DOM-free so the batching and
 * repeat-announcement rules can be unit-tested without a browser.
 */

/** Join a step's events into one polite announcement, dropping duplicates. */
export function formatEvents(events: readonly string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const raw of events) {
    const text = raw.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
  }
  return parts.join(" ");
}

/**
 * Returns text to write into the live region. Repeating identical copy needs
 * an invisible suffix change or several screen readers stay silent.
 */
export function nextLiveText(previous: string, text: string, flip: boolean): string {
  if (text !== previous) return text;
  return text + (flip ? "\u200b" : "\u200b\u200b");
}

/** Stateful wrapper around nextLiveText for the frame loop. */
export function createAnnouncer(write: (text: string) => void): (text: string) => void {
  let previous = "";
  let flip = false;
  return (text: string): void => {
    if (!text) return;
    if (text === previous) {
      write(nextLiveText(previous, text, flip));
      flip = !flip;
    } else {
      write(text);
    }
    previous = text;
  };
}
