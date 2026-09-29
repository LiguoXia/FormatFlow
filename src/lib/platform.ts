export const isMac = window.desktop?.platform === 'darwin' || (!window.desktop && /Mac/.test(navigator.platform));
export const modifier = isMac ? '⌘' : 'Ctrl';
export const shortcut = (keys: string) => keys.replaceAll('Ctrl', modifier);
