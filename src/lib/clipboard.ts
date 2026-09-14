export async function copyText(text: string) {
  if (window.desktop) await window.desktop.writeClipboard(text);
  else await navigator.clipboard.writeText(text);
}
export async function pasteText() { return window.desktop ? window.desktop.readClipboard() : navigator.clipboard.readText(); }
