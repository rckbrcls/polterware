/** Block Chromium from navigating when files or URLs are dropped on the shell. */
export function attachDesktopDropGuards(target: Window = window): () => void {
  const prevent = (event: Event) => {
    event.preventDefault();
  };

  target.addEventListener("dragover", prevent);
  target.addEventListener("drop", prevent);

  return () => {
    target.removeEventListener("dragover", prevent);
    target.removeEventListener("drop", prevent);
  };
}
