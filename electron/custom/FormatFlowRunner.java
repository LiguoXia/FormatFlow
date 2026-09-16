import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.util.*;
import javax.tools.*;

/** Trusted bridge. User classes are never on the application classpath. */
@SuppressWarnings({"removal", "deprecation"})
public final class FormatFlowRunner {
    private static final PrintStream PROTOCOL = System.out;
    private static String quote(String value) {
        StringBuilder out = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 32 || Character.isSurrogate(c)) out.append(String.format("\\u%04x", (int)c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
    private static void failure(String message, long line, long column) {
        PROTOCOL.print("{\"ok\":false,\"message\":" + quote(message) + ",\"line\":" + line + ",\"column\":" + column + "}");
    }
    private static final class RestrictedLoader extends ClassLoader {
        final Map<String, byte[]> classes;
        RestrictedLoader(Map<String, byte[]> classes) { super(null); this.classes = classes; }
        protected synchronized Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            Class<?> loaded = findLoadedClass(name);
            if (loaded == null) {
                if (classes.containsKey(name)) loaded = defineClass(name, classes.get(name), 0, classes.get(name).length, new ProtectionDomain(null, new Permissions()));
                else {
                    boolean allowed = name.startsWith("java.lang.") || name.startsWith("java.util.") || name.startsWith("java.text.") || name.startsWith("java.time.") || name.startsWith("java.math.") || name.startsWith("java.io.") || name.startsWith("java.nio.charset.");
                    if (!allowed || name.startsWith("java.lang.reflect.") || name.equals("java.lang.ClassLoader") || name.equals("java.lang.Runtime") || name.equals("java.lang.ProcessBuilder") || name.equals("java.lang.Process") || name.equals("java.lang.SecurityManager")) throw new ClassNotFoundException("安全限制：不允许访问 " + name);
                    loaded = super.loadClass(name, false);
                }
            }
            if (resolve) resolveClass(loaded);
            return loaded;
        }
        public java.net.URL getResource(String name) { return null; }
        public InputStream getResourceAsStream(String name) { return null; }
    }
    private static void isolate() {
        Policy.setPolicy(new Policy() {
            public PermissionCollection getPermissions(CodeSource source) { Permissions p = new Permissions(); p.add(new AllPermission()); return p; }
            public boolean implies(ProtectionDomain domain, Permission permission) { return true; }
        });
        System.setSecurityManager(new SecurityManager() {
            public void checkAccess(Thread thread) { checkPermission(new RuntimePermission("modifyThread")); }
            public void checkAccess(ThreadGroup group) { checkPermission(new RuntimePermission("modifyThreadGroup")); }
        });
        if (System.getSecurityManager() == null) throw new IllegalStateException("当前 JDK 无法启用安全隔离，请配置 JDK 8–23（推荐 JDK 21）。");
    }
    private static Map<String, byte[]> loadBytes(Path dir) throws IOException {
        Map<String, byte[]> classes = new HashMap<>();
        try (java.util.stream.Stream<Path> paths = Files.walk(dir)) {
            Iterator<Path> it = paths.filter(p -> p.toString().endsWith(".class")).iterator();
            while (it.hasNext()) { Path file = it.next(); String name = dir.relativize(file).toString().replace(File.separatorChar, '.'); classes.put(name.substring(0, name.length() - 6), Files.readAllBytes(file)); }
        }
        return classes;
    }
    public static void main(String[] args) {
        try {
            String mode = args[0];
            Path directory = Paths.get(args[1]);
            String className = args[2], methodName = args[3];
            if (mode.equals("compile")) {
                JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
                if (compiler == null) throw new IllegalStateException("未找到 Java 编译器，请安装完整 JDK，而不是 JRE。");
                DiagnosticCollector<JavaFileObject> diagnostics = new DiagnosticCollector<>();
                try (StandardJavaFileManager manager = compiler.getStandardFileManager(diagnostics, Locale.SIMPLIFIED_CHINESE, StandardCharsets.UTF_8)) {
                    Iterable<? extends JavaFileObject> units = manager.getJavaFileObjects(directory.resolve(className + ".java").toFile());
                    List<String> options = Arrays.asList("-encoding", "UTF-8", "-proc:none", "-classpath", directory.toString(), "-d", directory.toString());
                    boolean success = compiler.getTask(new StringWriter(), manager, diagnostics, options, null, units).call();
                    if (!success) {
                        for (Diagnostic<?> d : diagnostics.getDiagnostics()) if (d.getKind() == Diagnostic.Kind.ERROR) { failure("编译失败：" + d.getMessage(Locale.SIMPLIFIED_CHINESE), d.getLineNumber(), d.getColumnNumber()); return; }
                        throw new IllegalArgumentException("Java 编译失败");
                    }
                }
            }
            Map<String, byte[]> classes = loadBytes(directory);
            RestrictedLoader loader = new RestrictedLoader(classes);
            String input = "";
            if (mode.equals("run")) {
                String encoded = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine();
                input = new String(Base64.getDecoder().decode(encoded == null ? "" : encoded), StandardCharsets.UTF_8);
            }
            System.setIn(new ByteArrayInputStream(new byte[0]));
            PrintStream discard = new PrintStream(new OutputStream() { public void write(int b) {} });
            System.setOut(discard); System.setErr(discard);
            isolate();
            Class<?> type = Class.forName(className, false, loader);
            Method method;
            try { method = type.getMethod(methodName, String.class); }
            catch (NoSuchMethodException error) { throw new IllegalArgumentException("方法不存在或参数错误：需要 public static String " + methodName + "(String input)"); }
            if (!Modifier.isPublic(type.getModifiers()) || !Modifier.isStatic(method.getModifiers()) || method.getReturnType() != String.class) throw new IllegalArgumentException("方法签名错误：类必须 public，方法必须 public static String " + methodName + "(String input)");
            if (mode.equals("compile")) { PROTOCOL.print("{\"ok\":true}"); return; }
            String output = (String)method.invoke(null, input);
            if (output == null) throw new IllegalArgumentException("方法返回了 null，请返回 String（空结果可返回空字符串）。");
            if (output.length() > 10 * 1024 * 1024) throw new IllegalArgumentException("输出超过 10 MB 字符限制");
            PROTOCOL.print("{\"ok\":true,\"text\":" + quote(output) + "}");
        } catch (Throwable error) {
            while ((error instanceof InvocationTargetException || error instanceof ExceptionInInitializerError) && error.getCause() != null) error = error.getCause();
            String message = error instanceof SecurityException ? "安全限制：禁止文件、网络、系统命令、环境修改或危险反射操作。" : "处理失败：" + error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage());
            if (error instanceof ArithmeticException) message = "处理失败：ArithmeticException，算术运算错误（例如除数为 0）。";
            failure(message, 0, 0);
        }
    }
}
