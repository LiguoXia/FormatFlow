# FormatFlow 1.2 界面设计

参考 Apple Human Interface Guidelines 的信息层级、侧栏、颜色、材质及排版原则，为 Windows 上的文本工作台重新设计。继续使用 Electron、React 和 CodeMirror，不引入远程字体或图片依赖。

## 视觉与布局

- 内容优先：移除大段装饰性文案与重复英文标题，让出编辑空间。导航保持五项平级工具，标题区统一工具名称、说明和复制等操作。
- 材质层级：侧栏、标题栏使用柔和中性色；浮动提示使用轻量半透明背景。编辑器、结构树和结果区使用纯色，避免玻璃效果干扰代码阅读。
- 排版：采用系统 UI 字体和本机等宽字体回退；25 px 主标题、12–13 px 控件、14 px 代码、10–11 px 辅助信息。940 × 640 时适度收紧间距。
- 控件：统一 7 px 控件圆角、12 px 面板圆角、细边框和轻量阴影。主操作与当前导航使用强调蓝；转换方向、工具分类和外观使用分段控件。
- 结果区：双栏仍支持拖动及键盘调宽；面板标题和状态栏可换行，空状态提示随可用高度简化。

## 外观与可访问性

`src/tokens.css` 定义语义颜色、字体、圆角与阴影；所有 UI、CodeMirror 语法色及 JSON 树共用这些变量。支持浅色、深色、跟随系统，默认浅色。仅外观偏好写入 localStorage，文本继续只保留在本次运行内。

切换外观不销毁编辑器，输入、选择和撤销历史保留。选区在获得或失去焦点时均有背景；当前行不会遮住末行选区。

键盘焦点有清晰描边。快捷键指南采用模态 dialog，约束焦点并在关闭时返回原控件；打开期间阻止后台工具快捷键。文本分类支持左右方向键和 Home / End，转换方向与外观按钮提供可访问的选中状态。

支持减少动态效果、减少透明度、增强对比度与强制颜色的媒体偏好。UI 回归会检查基础文字、辅助文字、强调色和语法色在对应常规背景上的对比度；这不代表完成了所有辅助技术的认证。

## Windows 适配

保留右上角最小化、最大化、关闭及真实全屏控制，继续使用 Windows 快捷键。使用本机系统字体与 Lucide 线性图标，不打包 Apple 字体、SF Symbols 或 Apple 标志；不是 macOS 原生控件或 Liquid Glass 的原生实现。

## 官方参考

- [Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：材质区分导航与内容层，内容区保持清晰。
- [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)：平级导航、简洁标签和一致的强调色。
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)：清晰层级、控制字体数量和易读性。
- [Color](https://developer.apple.com/design/human-interface-guidelines/color)：语义颜色、一致性与对比度。

验证命令：`npm run test:ui`。截图与机器可读报告位于被 Git 忽略的 `test-results/`，供发布前验收。
