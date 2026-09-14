export {};
declare global {
  interface Window {
    desktop?: {
      windowAction(action: 'minimize' | 'maximize' | 'fullscreen' | 'exit-fullscreen' | 'close'): Promise<void>;
      getWindowState(): Promise<{maximized: boolean; fullscreen: boolean}>;
      onWindowState(callback: (state: {maximized: boolean; fullscreen: boolean}) => void): () => void;
      readClipboard(): Promise<string>;
      writeClipboard(text: string): Promise<void>;
    };
  }
}
