import Foundation

struct CoreConfig: Decodable {
    let endpoint: String
    let token: String
}

struct ReminderItem: Decodable {
    let id: String
    let noteId: String
    let fireAt: String
    let title: String
    let body: String
    let category: String
}

struct PlanBody: Decodable {
    let items: [ReminderItem]
}

func loadCoreConfig() -> CoreConfig? {
    let url = dataDirectory().appendingPathComponent("run/core.json")
    guard let data = try? Data(contentsOf: url) else {
        return nil
    }
    return try? JSONDecoder().decode(CoreConfig.self, from: data)
}

func coreRequest(method: String, path: String, body: Data?) async -> (Int, Data) {
    guard let config = loadCoreConfig() else {
        log("core config missing")
        return (0, Data())
    }
    let base = config.endpoint.hasSuffix("/") ? String(config.endpoint.dropLast()) : config.endpoint
    guard let url = URL(string: base + path) else {
        log("core url invalid")
        return (0, Data())
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 40
    request.setValue("Bearer \(config.token)", forHTTPHeaderField: "Authorization")
    if body != nil {
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
    }
    do {
        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        return (code, data)
    } catch {
        log("core \(method) \(path) error \(error.localizedDescription)")
        return (0, Data())
    }
}

func coreHealthy() async -> Bool {
    let (code, _) = await coreRequest(method: "GET", path: "/health", body: nil)
    return code == 200
}

func ensureCore() async -> Bool {
    if await coreHealthy() {
        return true
    }
    guard let bin = ProcessInfo.processInfo.environment["PWNOTES_CORE_BIN"], !bin.isEmpty else {
        log("core unreachable and PWNOTES_CORE_BIN is unset; keeping already-armed notifications")
        return false
    }
    let process = Process()
    process.executableURL = URL(fileURLWithPath: bin)
    process.arguments = ["-data", dataDirectory().path]
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice
    do {
        try process.run()
        log("spawned core pid=\(process.processIdentifier)")
    } catch {
        log("spawn core failed \(error.localizedDescription)")
        return false
    }
    for _ in 0..<25 {
        if await coreHealthy() {
            return true
        }
        try? await Task.sleep(nanoseconds: 200_000_000)
    }
    log("core did not become healthy; keeping already-armed notifications")
    return false
}

func fetchPlan() async -> PlanBody? {
    let (code, data) = await coreRequest(method: "GET", path: "/plan", body: nil)
    guard code == 200 else {
        log("plan status=\(code)")
        return nil
    }
    do {
        return try JSONDecoder().decode(PlanBody.self, from: data)
    } catch {
        log("plan decode \(error.localizedDescription)")
        return nil
    }
}

func postAction(path: String, fields: [String: Any]) async -> Int {
    guard JSONSerialization.isValidJSONObject(fields),
          let body = try? JSONSerialization.data(withJSONObject: fields) else {
        log("action payload invalid")
        return 0
    }
    let (code, _) = await coreRequest(method: "POST", path: path, body: body)
    return code
}

func ackHeartbeat() async {
    let fields: [String: Any] = [
        "pid": ProcessInfo.processInfo.processIdentifier,
        "bundleName": bundleDisplayName(),
        "seenAt": isoNow(),
    ]
    guard let body = try? JSONSerialization.data(withJSONObject: fields) else {
        return
    }
    let (code, _) = await coreRequest(method: "POST", path: "/ack", body: body)
    log("ack status=\(code)")
}
