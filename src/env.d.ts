import type { AppSettings, CustomEnvironment, CustomProcessor, CustomResponse, CustomResult } from './lib/customTypes';
export {};
declare global {
  interface Window {
    desktop?: {
      platform: string;
      windowAction(action: 'minimize' | 'maximize' | 'fullscreen' | 'exit-fullscreen' | 'close'): Promise<void>;
      getWindowState(): Promise<{maximized: boolean; fullscreen: boolean}>;
      onWindowState(callback: (state: {maximized: boolean; fullscreen: boolean}) => void): () => void;
      readClipboard(): Promise<string>;
      writeClipboard(text: string): Promise<void>;
      settings: { read(): Promise<AppSettings>; write(patch: Partial<AppSettings>): Promise<AppSettings>; };
      custom: {
        list(): Promise<CustomProcessor[]>; environment(): Promise<CustomEnvironment>;
        save(record: CustomProcessor): Promise<CustomResponse<CustomProcessor>>;
        run(record: CustomProcessor, text: string): Promise<CustomResponse<CustomResult>>;
        remove(id: string): Promise<boolean>; cancel(): Promise<boolean>;
        openFolder(): Promise<boolean>; export(): Promise<boolean>; import(): Promise<number | null>;
      };
    };
  }
}
