# Custom Processor Framework 设计

## 现有项目与接入方式

当前为 Electron + React + TypeScript + Vite 桌面应用，UI 使用共享 CodeMirror 编辑器与 CSS 语义变量。JSON、SQL、配置和内置文本操作继续在原有 Web Worker 中处理。

本次通过新增 Electron 主进程服务、固定 IPC 与独立 React 页面接入，不把 Java 调用放进浏览器 Worker，也不向 renderer 暴露任意命令、路径或通用进程创建能力。

## 模块

- `electron/custom/manager.cjs`：配置校验、原子保存、备份、导入事务、JDK 检测、编译缓存、进程超时及取消。
- `electron/custom/FormatFlowRunner.java`：Java Compiler API 编译、受限 ClassLoader、签名校验与反射调用；用户 class 不在宿主 classpath 上。
- `electron/custom/ipc.cjs`：固定 IPC、发送方校验、原生导入/导出文件对话框；配置位置由主进程决定。
- `src/pages/CustomPage.tsx`：功能列表、编辑、测试、执行、错误定位、草稿确认与 JDK 教程。
- `src/lib/customTypes.ts`：String → processor → String 接口及 IPC 类型。
- `src/lib/settings.ts`：缩进设置加载/保存，防止延迟加载覆盖用户已修改的值。

## 隔离与生命周期

Node 仅以明确的 java/javac 可执行文件路径启动进程，使用参数数组、`shell:false`、隐藏窗口。环境仅传递启动必需字段，不继承 CLASSPATH、JAVA_TOOL_OPTIONS、JDK_JAVA_OPTIONS 或 _JAVA_OPTIONS。

编译关闭注解处理器，classpath 仅指向该功能的缓存目录。运行时先读入 class 字节，再以仅含空静态权限集合的 ProtectionDomain 加载。安装 Security Manager 后才反射执行，静态初始化也处于受限域。JDK 24+ 禁止使用此引擎；没有不受限降级路径。

宿主使用可信权限处理协议和类文件，用户类不继承这些权限。类加载器仅允许约定的 JDK 包与当前用户 class，并拒绝危险类及反射包。权限检查拦截文件、网络、外部程序、环境修改和退出等操作；线程创建额外受限。程序输出被丢弃，可信协议流独立保存。

Java 调用互斥，避免无限累积 JVM。编译最长 20 秒、执行最长 5 秒；超时、取消和应用退出均终止子进程，不使用无法可靠停止死循环的 Thread.stop 或单纯 Future.cancel。

递归清理前验证目标位于 compiled 缓存根目录内。导入失败只清理本次生成的新 ID 缓存，成功才更新配置。旧文件用 `.bak` 保留，坏 JSON 不覆盖。

## 配置升级

用户配置位于独立的系统数据目录；创建文件使用排他 `wx`，已有文件保持不变。载入兼容无 ID、无时间戳以及 method 别名的简化记录，规范化后在用户保存时写回。未知字段不会用于拼接执行命令或加载 class 路径。

## 全屏状态修复

Windows 上 Electron 的 enter-full-screen / leave-full-screen 事件可能早于 isFullScreen() 属性更新。本版直接使用事件含义更新状态，避免图标显示前一个状态；进入图标向外，退出图标向内，标题同步提示动作。

## 验证

`test:custom` 覆盖真实系统 JDK 的编译、缓存、错误、权限限制、资源限制、配置与导入事务；`test:custom-desktop` 覆盖 UI 流程、配置恢复、错误行定位、取消、原生文件对话框接口、删除与全屏。`scripts/custom-no-jdk.mjs` 单独验证缺少 JDK 时原有工具可用及安装教程。

测试使用 `test-results` 下的独立临时配置目录。生产应用不会使用开发测试目录覆盖设置，不附带 JDK，也不上传用户代码或输入。
