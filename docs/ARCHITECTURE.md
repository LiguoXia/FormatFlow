# 实现说明

## 进程边界

```text
Electron main
  ├─ BrowserWindow：窗口尺寸 / 全屏 / 最小化 / 最大化
  ├─ 本地文件加载 + 外部网络阻断
  └─ 受限 IPC ← sandboxed preload → React renderer
                                    ├─ CodeMirror 视口渲染
                                    ├─ 当前工具的内存状态
                                    └─ ToolWorker
                                       ├─ JSON 格式化与 AST / 树查询
                                       ├─ SQL 格式化
                                       ├─ Properties / YAML 转换
                                       └─ 26 项文本转换与编码操作
```

每个文本工具按需建立自己的 Worker。JSON AST 保存在对应 Worker 中，不向 UI 传递完整对象树。格式化采用扫描器给出的空白修改列表，一次顺序拼接，避免大量替换引发二次方复杂度。

树列表根据展开状态在 Worker 内构造；UI 向 Worker 请求当前视口附近最多 100 行。节点通过源文本偏移定位，支持编辑器跳转与精确复制。修改输入会清除旧树，防止树与编辑器内容不一致。

## 请求和错误

每个请求携带递增 ID。页面任务还有独立序号；处理途中改动输入、清空或取消时会终止当前 Worker，并使旧任务结果失效。未知异常转换为用户可见错误，不清空用户输入。60 秒上限防止异常或极端数据无限处理。

JSON 错误包含 UTF-16 偏移、1 起算的行列位置，与 CodeMirror 文档偏移一致。编辑器使用错误 decoration 标记位置。程序化替换使用独立 history 注解，保证一次撤销只回退一次工具操作。

1.1 的文本操作使用单独的 `core/text.ts` 实现，操作标签及说明集中在 `lib/textActions.ts`。JSON 压缩通过扫描器移除结构空白，不经 JSON.stringify 重写值。编辑器根据选择范围动态设置 `data-has-selection`，在有选区时去掉当前行的实色背景，避免遮住 CodeMirror 位于文字层下方的选择背景。

## 视图与窗口

全高 flex 布局将标题栏、状态栏与内容区域分开。工具页面有可伸缩的编辑区；双栏采用 CSS grid，分隔线比例限制为 30%～75%，支持 pointer capture 与键盘方向键。小窗口下工具栏自动换行，时间页独立滚动。

原生全屏使用 BrowserWindow.setFullScreen，不以最大化代替。Esc 使用显式退出操作，避免窗口全屏状态事件延迟时误判。

## 取舍

- Electron 自带 Chromium，兼容性与编辑器体验优先，安装包和内存占用高于原生 Win32 小工具。
- 便携单 EXE 会先解压；常用时可保留 `win-unpacked` 目录以直接启动。
- 配置格式存在类型与表达能力差异，通过类型识别开关和明确错误来避免数据被静默改写。
- 使用锁文件进行可复现安装，不依赖系统浏览器或在线 CDN。

后续增加工具遵循 `core → worker action → page → navigation` 的结构，无需修改已有文本转换实现。
