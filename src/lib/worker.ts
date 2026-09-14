export interface ToolError { message: string; offset?: number; line?: number; column?: number; }
export class ToolWorker {
  private worker: Worker | undefined;
  private nextId = 0;
  private pending = new Map<number, {resolve(value: any): void; reject(reason: ToolError): void; timer: ReturnType<typeof setTimeout>}>();
  private create() {
    if (this.worker) return;
    this.worker = new Worker(new URL('../workers/tools.worker.ts', import.meta.url), {type: 'module'});
    this.worker.onmessage = ({data}) => {
      const task = this.pending.get(data.id);
      if (!task) return;
      clearTimeout(task.timer); this.pending.delete(data.id);
      data.error ? task.reject(data.error) : task.resolve(data.result);
    };
    this.worker.onerror = () => this.dispose('处理线程异常，请重试');
  }
  request<T = any>(action: string, payload?: object): Promise<T> {
    this.create();
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.dispose('处理超时，请缩小输入或检查文本'), 60000);
      this.pending.set(id, {resolve, reject, timer});
      this.worker!.postMessage({id, action, payload});
    });
  }
  dispose(message = '操作已取消') {
    this.worker?.terminate(); this.worker = undefined;
    for (const task of this.pending.values()) { clearTimeout(task.timer); task.reject({message}); }
    this.pending.clear();
  }
}
