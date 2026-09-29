# FormatFlow 1.4.0

基于现有文本工具与自定义 Java 处理逻辑，新增 macOS Intel 和 Apple Silicon 原生版本，同时提供 Windows x64 便携版。

| 设备 | 下载文件 |
| --- | --- |
| Intel Mac | `FormatFlow-1.4.0-mac-x64.dmg` |
| Apple Silicon Mac（M 系列） | `FormatFlow-1.4.0-mac-arm64.dmg` |
| Windows x64 | `FormatFlow-1.4.0-win-x64.exe` |

macOS 另提供 ZIP 包。所有安装包均可使用 `SHA256SUMS.txt` 校验。

## macOS 安装

需要 macOS 12 Monterey 或更高版本。打开对应芯片的 DMG，将 FormatFlow 拖到 Applications，再从应用程序启动。Apple Silicon 版本原生运行，无需 Rosetta。

本版本仅进行 ad-hoc 签名，未使用 Apple Developer ID，未经过 Apple 公证。首次打开可能被 Gatekeeper 阻止；确认下载自本仓库后，可在「系统设置 → 隐私与安全性」中使用「仍要打开」。参见 [Apple 官方说明](https://support.apple.com/102445)。

## macOS 适配

- 原生红黄绿窗口按钮、应用/编辑/窗口菜单，支持 ⌘Q 退出及原生全屏。
- ⌘Enter 处理、⌘1–6 切换工具、⌘/ 快捷键指南；编辑器支持 ⌘C/V/X/A、⌘Z、⌘ShiftZ、⌘F、⌘OptionF。
- 自动查找系统及用户目录内的 JDK 和 Homebrew JDK，从 Finder 启动也可发现。
- 自定义功能配置位于 `~/Library/Application Support/FormatFlow/config`，Java 缓存位于 `~/Library/Caches/FormatFlow/processors`。
- 保留本地处理、离线使用、文本仅在本次运行中保留的行为；关闭最后一个窗口即退出。

内置工具无需安装额外运行时。自定义 Java 功能需要完整 JDK 8–23，推荐 Temurin 21，下载时选择与芯片对应的 x64 或 aarch64。JDK 24+ 不受当前安全执行引擎支持。

## 构建与验证

发行工作流在原生 Intel、ARM64 macOS runner 上分别构建 DMG/ZIP，在 Windows runner 上构建 EXE。发布前运行核心测试、Java 集成测试和打包后的桌面检查；macOS 额外检查二进制架构、ad-hoc 签名、Command 快捷键、Finder 环境 JDK 查找、全屏和离线限制。各平台诊断报告在对应 GitHub Actions 运行的 artifacts 中。

自动化环境为 macOS 15；macOS 12–14 及其他系统版本未逐一实机验证。最低版本依据所用 Electron 40 的系统要求。
