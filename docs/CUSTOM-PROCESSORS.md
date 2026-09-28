# 自定义文本处理使用指南（1.3）

## 快速开始

1. 打开「自定义处理」（Ctrl + 6）。顶部自动检查本机 JDK。
2. 点击「新增功能」，填写名称，例如「全部转大写」。
3. 类名保留 `CustomProcessor`，方法名保留 `process`。代码可填写完整 public 类，也可只填写下面的方法：

```java
public static String process(String input) {
    return input.toUpperCase(java.util.Locale.ROOT);
}
```

4. 点击「测试」，默认输入为 `hello world`，结果为 `HELLO WORLD`。可在下方修改测试输入。
5. 点击「保存」。程序检查方法签名并编译；成功后功能出现在左侧列表。
6. 切换「处理文本」，粘贴内容并点击「执行处理」。结果支持选择和复制。

未保存代码可测试，必须保存后才会在下次启动恢复。测试时不会自动保存代码。切换功能或新建功能前会提示处理未保存的草稿。

## 安装与检测 JDK

程序不附带 JDK，也不会自动安装。仅自定义 Java 功能需要 JDK，JSON、SQL、时间戳和其他内置工具照常工作。

支持完整 **JDK 8–23**，建议安装仍获得更新的 **Temurin JDK 21 x64**。JRE 只有运行环境，不满足编译需求。

1. 打开 [Eclipse Adoptium](https://adoptium.net/temurin/releases/?version=21)，选择 Windows、x64、JDK、MSI。
2. 按安装向导安装。可启用安装器提供的 JAVA_HOME 与 PATH 设置，具体见 [官方 Windows 安装说明](https://adoptium.net/en-GB/installation/windows)。
3. 如果手动配置，在 Windows「编辑系统环境变量 → 环境变量」中新增 `JAVA_HOME`，值为 JDK 根目录，例如 `C:\Program Files\Eclipse Adoptium\jdk-21...`，不要带 `bin`。
4. 在 Path 中添加 `%JAVA_HOME%\bin`。
5. 新开 PowerShell，检查：

```powershell
java -version
javac -version
```

两条命令应显示同一主版本。然后完全退出并重新打开 FormatFlow，让程序继承更新后的环境变量。

程序优先检查 JAVA_HOME，再检查 PATH 中同时包含 java 与 javac 的目录。「重新检测」适用于当前应用进程已经可见的环境。多个 JDK 并存时，JAVA_HOME 用于优先选择。

**JDK 24 及以后暂不支持本执行引擎。** 这些版本永久禁用了 Security Manager，程序会拒绝执行并显示教程，不会回退为无限制执行。依据：[Oracle JDK 24 安全说明](https://docs.oracle.com/en/java/javase/24/security/security-manager-is-permanently-disabled.html)。

## 方法与库

- 类必须 public，方法必须是 `public static String 方法名(String input)`。
- 支持完整类或只填写方法。完整类名称需与类名字段一致，不支持 package 声明。
- 返回空字符串代表有效的空结果；返回 null 会显示错误。
- 可使用 java.lang、java.util、java.util.regex、java.text、java.time、java.math，以及受限的 java.io 内存流和字符编码类。
- 正则包是 `java.util.regex`，不是 `java.regex`。
- 不加载第三方依赖；注解处理器被关闭。
- 文件、网络、系统命令、环境修改、危险反射和创建线程受限；纯内存 StringReader、StringWriter 等可用。
- `System.out` / `System.err` 输出不作为处理结果。结果必须由方法 return 返回。
- 编译错误显示行列号，并可定位编辑器；运行异常转成页面提示。

## 配置、缓存与缩进

配置位于：

```text
%APPDATA%\FormatFlow\config\custom-processors.json
%APPDATA%\FormatFlow\config\settings.json
```

编译缓存位于：

```text
%LOCALAPPDATA%\FormatFlow\processors\compiled\<功能ID>\<内容哈希>\
%LOCALAPPDATA%\FormatFlow\processors\runner\<引擎和JDK哈希>\
```

配置不依赖 EXE 所在目录，升级不会覆盖已有配置。设置文件分别保存 `jsonIndent`、`sqlIndent` 和 `javaIndent`，支持 2/4 空格，启动时读取。

配置以数组保存，记录 id、name、description、className、methodName、code、createTime、updateTime。示例：

```json
[
  {
    "id": "uppercase-example",
    "name": "全部转大写",
    "description": "使用 Java 将文本转成大写",
    "className": "CustomProcessor",
    "methodName": "process",
    "code": "public static String process(String input) { return input.toUpperCase(java.util.Locale.ROOT); }"
  }
]
```

兼容省略 ID 的配置，以及使用 `method` 作为方法名字段的简化配置。可从完整代码推导类名，默认方法名为 process。ID 按大小写不敏感方式处理，防止 Windows 缓存目录冲突。

点击「配置目录」可打开实际路径。外部编辑配置后点击「重新加载」，或重新启动应用。重新加载前先处理未保存的草稿。

保存、导入、删除采用临时文件替换，并将上一份配置保存在 `.bak`。损坏的配置不会被静默覆盖。需要恢复时，退出应用，备份损坏文件，再将 `.bak` 复制回相应 `.json`。

## 导入导出

- 导出通过系统保存对话框生成 `FormatFlowProcessorBackup.json`，只包含功能代码与元数据，不包含输入文本、处理结果或本机 class 路径。
- 导入逐项校验并编译；全部成功后一次性写入配置。任何一项失败都不改变已有功能列表。
- 导入时生成新 ID，因此不会覆盖同 ID 的已有功能。重复导入会新增副本。
- 最多保存 100 个功能，代码上限 100 KB，导入文件上限 5 MB。
- 删除某个功能会删除当前配置记录及其编译缓存，不影响其他功能。上一份配置备份可能仍含已删除记录。

## 执行限制

每个自定义功能分别暂存输入文本和处理结果。切换功能或切换到其他工具后再返回，会恢复该功能本次运行中最近的内容；重新加载功能列表不会清空这些内容。新建功能使用独立的输入与结果，删除功能只清除它自己的暂存。关闭应用或刷新页面会清除所有暂存文本，不会将文本写入配置或导出文件。

每次执行启动独立 Java 子进程，输入通过标准输入传递；输入和结果不写入文件。保存的 Java 源码和编译 class 会写入上述用户缓存目录。

- 输入上限 10 MB（UTF-8）；结果长度与协议输出均有上限。
- Java 执行默认 5 秒，超时由主进程终止 JVM；也可点击取消。
- 编译及首次准备引擎分别限制 20 秒。
- Java 堆上限 192 MB，元空间上限 96 MB；这不等于整个进程总内存的绝对上限。
- 程序退出会终止仍在运行的 Java 子进程。
- 缓存由代码、类名、方法名、JDK 信息和引擎内容决定；代码改变后重新编译，未改变时复用 class。保存和导入会提前编译校验。

隔离基于独立进程、受限类加载器和 JDK 权限检查，不是操作系统虚拟机。请使用受维护的 JDK，不把它当作运行任意恶意程序的通用沙箱。
