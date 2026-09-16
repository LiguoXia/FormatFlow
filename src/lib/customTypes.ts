export interface CustomProcessor {
  id: string; name: string; description: string; className: string; methodName: string;
  code: string; createTime?: string; updateTime?: string;
}
export interface CustomEnvironment { available: boolean; message: string; version?: string; home?: string; configPath: string; }
export interface AppSettings { jsonIndent: number; sqlIndent: number; javaIndent: number; }
export type CustomResponse<T> = {ok: true; value: T} | {ok: false; error: {message: string; line?: number; column?: number}};
export interface CustomResult { text: string; cached: boolean; durationMs: number; }
