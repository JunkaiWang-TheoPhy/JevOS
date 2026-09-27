import Cocoa
@preconcurrency import WebKit
import SystemConfiguration

func missingModelConfiguration(_ values: [String: String]) -> [String] {
    var missing: [String] = []
    for (key, label) in [("TYPESAFE_API_KEY", "Jev API Key"), ("APP_GENERATOR_API_KEY", "LLM API Key"), ("APP_GENERATOR_MODEL", "LLM 模型名称")] {
        if values[key]?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false { missing.append(label) }
    }
    if let base = values["APP_GENERATOR_BASE_URL"], !base.isEmpty {
        let url = URL(string: base)
        if url?.host == nil || !["http", "https"].contains(url?.scheme ?? "") || url?.user != nil || url?.password != nil || url?.query != nil || url?.fragment != nil { missing.append("有效的 LLM API 地址") }
    }
    return missing
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    private var window: NSWindow!
    private var web: WKWebView!
    private var backend: Process?
    private var log: FileHandle?
    private var probe: Timer?
    private var attempts = 0
    private var downloads: [WKDownload] = []
    private var promptOnNextLoad = true
    private var forceSettingsOnNextLoad = false
    private let smoke = CommandLine.arguments.contains("--smoke-test")
    private var name: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "JevOS" }
    private var port: Int {
        if smoke, let raw = ProcessInfo.processInfo.environment["JEVOS_SMOKE_PORT"],
           let value = Int(raw), (1024...65535).contains(value) { return value }
        return Bundle.main.object(forInfoDictionaryKey: "JevOSPort") as? Int ?? 4473
    }
    private var origin: URL { URL(string: "http://127.0.0.1:\(port)")! }
    private var support: URL {
        if let path = ProcessInfo.processInfo.environment["JEVOS_APP_SUPPORT_DIR"] { return URL(fileURLWithPath: path) }
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "dev.jevos.next")
    }
    private var configURL: URL { support.appendingPathComponent("settings.env") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
            try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: support.path)
        }
        catch { fail("无法创建应用数据目录：\(error.localizedDescription)"); return }
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = smoke ? .nonPersistent() : .default()
        configuration.userContentController.add(self, name: "jevosConfiguration")
        configuration.userContentController.addUserScript(WKUserScript(source: "window.jevosDesktop = Object.freeze({openConfiguration: () => window.webkit.messageHandlers.jevosConfiguration.postMessage('open'), restartConfiguration: () => window.webkit.messageHandlers.jevosConfiguration.postMessage('restart')});", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = false
        if #available(macOS 13.3, *) { web.isInspectable = true }
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = name
        window.minSize = NSSize(width: 760, height: 540)
        window.contentView = web
        let controls = NSTitlebarAccessoryViewController()
        controls.layoutAttribute = .right
        let buttons = NSStackView(views: [
            NSButton(title: "重新打开配置", target: self, action: #selector(settings)),
            NSButton(title: "重启并打开配置", target: self, action: #selector(restartSettings))
        ])
        buttons.spacing = 8
        buttons.frame = NSRect(x: 0, y: 0, width: 290, height: 30)
        controls.view = buttons
        window.addTitlebarAccessoryViewController(controls)
        window.center()
        installMenu()
        if !smoke { window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
        startBackend()
    }

    private func installMenu() {
        let bar = NSMenu()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 JevOS", action: #selector(about), keyEquivalent: "").target = self
        appMenu.addItem(withTitle: "模型设置…", action: #selector(settings), keyEquivalent: ",").target = self
        appMenu.addItem(withTitle: "重启并打开配置", action: #selector(restartSettings), keyEquivalent: "").target = self
        appMenu.addItem(withTitle: "打开数据目录", action: #selector(openData), keyEquivalent: "").target = self
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出 \(name)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        let appItem = NSMenuItem(); appItem.submenu = appMenu; bar.addItem(appItem)
        let edit = NSMenu(title: "编辑")
        edit.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        let editItem = NSMenuItem(title: "编辑", action: nil, keyEquivalent: ""); editItem.submenu = edit; bar.addItem(editItem)
        let view = NSMenu(title: "视图")
        view.addItem(withTitle: "刷新工作台", action: #selector(reload), keyEquivalent: "r").target = self
        let viewItem = NSMenuItem(title: "视图", action: nil, keyEquivalent: ""); viewItem.submenu = view; bar.addItem(viewItem)
        NSApp.mainMenu = bar
    }

    private func configuration() -> [String: String] {
        guard let text = try? String(contentsOf: configURL, encoding: .utf8) else { return [:] }
        var values: [String: String] = [:]
        for line in text.components(separatedBy: .newlines) {
            guard !line.hasPrefix("#"), let split = line.firstIndex(of: "=") else { continue }
            values[String(line[..<split])] = String(line[line.index(after: split)...])
        }
        return values
    }

    private func startBackend() {
        guard let resources = Bundle.main.resourceURL else { fail("应用资源缺失。"); return }
        let runtime = resources.appendingPathComponent("runtime/node")
        let app = resources.appendingPathComponent("application")
        let process = Process()
        process.executableURL = runtime
        process.arguments = ["server/index.mjs", "--static"]
        process.currentDirectoryURL = app
        // Only an explicit allowlist reaches the server. Never inherit another project's keys.
        let inherited = ProcessInfo.processInfo.environment
        var environment: [String: String] = [:]
        for key in ["PATH", "HOME", "LANG", "TMPDIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "ALL_PROXY"] {
            if let value = inherited[key] { environment[key] = value }
        }
        let allowed = Set(["TYPESAFE_API_KEY", "JEV_MODEL", "APP_GENERATOR_API_KEY", "APP_GENERATOR_MODEL", "APP_GENERATOR_BASE_URL", "HTTP_PROXY", "HTTPS_PROXY"])
        for (key, value) in configuration() where allowed.contains(key) { environment[key] = value }
        if let proxy = SCDynamicStoreCopyProxies(nil) as? [String: Any] {
            for (flag, host, proxyPort, target) in [("HTTPEnable", "HTTPProxy", "HTTPPort", "HTTP_PROXY"), ("HTTPSEnable", "HTTPSProxy", "HTTPSPort", "HTTPS_PROXY")] {
                if environment[target]?.isEmpty != false, (proxy[flag] as? NSNumber)?.boolValue == true,
                   let address = proxy[host] as? String, let number = proxy[proxyPort] as? NSNumber {
                    var url = URLComponents(); url.scheme = "http"; url.host = address; url.port = number.intValue
                    environment[target] = url.string
                }
            }
        }
        environment["NODE_USE_ENV_PROXY"] = "1"
        environment["NO_PROXY"] = "localhost,127.0.0.1,::1"
        environment["PORT"] = String(port)
        environment["VIBEOS_DB_PATH"] = support.appendingPathComponent("workspace.sqlite").path
        process.environment = environment
        let logURL = support.appendingPathComponent("server.log")
        FileManager.default.createFile(atPath: logURL.path, contents: nil)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: logURL.path)
        log = try? FileHandle(forWritingTo: logURL)
        process.standardOutput = log; process.standardError = log
        process.terminationHandler = { [weak self] child in
            DispatchQueue.main.async {
                guard let self = self, self.backend === child else { return }
                self.probe?.invalidate()
                self.backend = nil
                self.fail("本地服务未能启动或已退出。端口 \(self.port) 可能被占用。日志位于应用数据目录。")
            }
        }
        do { try process.run(); backend = process }
        catch { fail("本地运行时启动失败：\(error.localizedDescription)"); return }
        attempts = 0
        let sessionConfig = URLSessionConfiguration.ephemeral
        sessionConfig.connectionProxyDictionary = [:]
        let session = URLSession(configuration: sessionConfig)
        probe = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] timer in
            guard let self = self else { timer.invalidate(); return }
            self.attempts += 1
            if self.attempts > 75 { timer.invalidate(); self.fail("本地服务启动超时。请检查数据目录中的 server.log。"); return }
            var request = URLRequest(url: self.origin.appendingPathComponent("api/health")); request.timeoutInterval = 1
            session.dataTask(with: request) { [weak self] data, response, _ in
                guard let self = self, let data = data, (response as? HTTPURLResponse)?.statusCode == 200,
                      let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any], info["ok"] as? Bool == true else { return }
                DispatchQueue.main.async {
                    guard timer.isValid, self.backend?.isRunning == true else { return }
                    timer.invalidate(); session.invalidateAndCancel()
                    self.web.load(URLRequest(url: self.origin))
                }
            }.resume()
        }
    }

    private func stopBackend() {
        probe?.invalidate(); probe = nil
        guard let child = backend else { return }
        backend = nil
        if child.isRunning {
            child.terminate()
            let deadline = Date().addingTimeInterval(3)
            while child.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.03) }
            if child.isRunning { kill(child.processIdentifier, SIGKILL) }
        }
        try? log?.close(); log = nil
    }

    @objc private func settings() {
        let current = configuration()
        let missing = missingModelConfiguration(current)
        let fields: [(String, String, Bool)] = [
            ("TYPESAFE_API_KEY", "Jev API Key", true),
            ("JEV_MODEL", "Jev 模型", false),
            ("APP_GENERATOR_BASE_URL", "生成 API 地址（填到 /v1）", false),
            ("APP_GENERATOR_MODEL", "生成模型名称", false),
            ("APP_GENERATOR_API_KEY", "生成 API Key", true),
            ("HTTPS_PROXY", "HTTP(S) 代理（可选）", false),
        ]
        let view = NSView(frame: NSRect(x: 0, y: 0, width: 470, height: 380))
        var inputs: [String: NSTextField] = [:]
        for (index, entry) in fields.enumerated() {
            let y = CGFloat(340 - index * 58)
            let label = NSTextField(labelWithString: entry.1); label.frame = NSRect(x: 0, y: y + 24, width: 470, height: 20); view.addSubview(label)
            let input: NSTextField = entry.2 ? NSSecureTextField() : NSTextField()
            input.frame = NSRect(x: 0, y: y, width: 470, height: 24)
            input.stringValue = current[entry.0] ?? (entry.0 == "JEV_MODEL" ? "jev-latest" : entry.0 == "APP_GENERATOR_BASE_URL" ? "https://api.openai.com/v1" : "")
            view.addSubview(input); inputs[entry.0] = input
        }
        let alert = NSAlert(); alert.messageText = "\(name) 模型设置"
        let reminder = missing.isEmpty ? "必要字段已填写；实际连接结果以服务响应为准。" : "尚未配置：\(missing.joined(separator: "、"))。未配齐时每次启动都会提醒；关闭仅隐藏本次提示，可从标题栏重新打开。"
        alert.informativeText = reminder + "\n配置只保存到本机应用数据目录（仅当前用户可读）。保存后重启本地服务。"
        alert.accessoryView = view; alert.addButton(withTitle: "保存并重启"); alert.addButton(withTitle: "关闭提示")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let values = fields.map { key, _, _ in "\(key)=\(inputs[key]!.stringValue.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "\n", with: "").replacingOccurrences(of: "\r", with: ""))" }.joined(separator: "\n") + "\n"
        do {
            try values.write(to: configURL, atomically: true, encoding: .utf8)
            try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: configURL.path)
            promptOnNextLoad = true
            stopBackend(); startBackend()
        } catch { fail("配置保存失败：\(error.localizedDescription)") }
    }

    @objc private func restartSettings() {
        forceSettingsOnNextLoad = true
        promptOnNextLoad = true
        stopBackend(); startBackend()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, message.frameInfo.request.url?.host == "127.0.0.1",
              let action = message.body as? String else { return }
        if action == "open" { settings() }
        if action == "restart" { restartSettings() }
    }

    @objc private func openData() { NSWorkspace.shared.open(support) }
    @objc private func about() {
        let alert = NSAlert()
        alert.messageText = name
        alert.informativeText = "WangTheoPhys@outlook.com\nhttps://Junkaiwang-theophy.github.io"
        alert.addButton(withTitle: "访问个人网站")
        alert.addButton(withTitle: "关闭")
        if alert.runModal() == .alertFirstButtonReturn {
            NSWorkspace.shared.open(URL(string: "https://Junkaiwang-theophy.github.io")!)
        }
    }
    @objc private func reload() { web.reload() }
    private func fail(_ message: String) {
        if smoke { print("SMOKE_FAILED: \(message)"); stopBackend(); exit(1) }
        let alert = NSAlert(); alert.messageText = name; alert.informativeText = message; alert.runModal()
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) { stopBackend() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard smoke else {
            if promptOnNextLoad {
                promptOnNextLoad = false
                let shouldOpen = forceSettingsOnNextLoad || !missingModelConfiguration(configuration()).isEmpty
                forceSettingsOnNextLoad = false
                if shouldOpen { DispatchQueue.main.async { [weak self] in self?.settings() } }
            }
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            webView.evaluateJavaScript("JSON.stringify({title:document.title,rendered:document.getElementById('root').innerText.length>20})") { [weak self] value, error in
                guard let self = self else { return }
                if let result = value as? String, error == nil, result.contains("\"rendered\":true") {
                    print("SMOKE_OK: \(result)"); self.stopBackend(); exit(0)
                } else { self.fail("内嵌网页未完成渲染。") }
            }
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if action.targetFrame?.isMainFrame == true, let url = action.request.url,
           url.host != "127.0.0.1" && url.host != "localhost" {
            if action.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { downloads.append(download); download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { downloads.append(download); download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel(); panel.nameFieldStringValue = (suggestedFilename as NSString).lastPathComponent
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
    func downloadDidFinish(_ download: WKDownload) { downloads.removeAll { $0 === download } }
    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) { downloads.removeAll { $0 === download } }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
