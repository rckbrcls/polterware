import Foundation

private let logLock = NSLock()

func dataDirectory() -> URL {
    if let raw = ProcessInfo.processInfo.environment["PWNOTES_DATA_DIR"], !raw.isEmpty {
        return URL(fileURLWithPath: raw, isDirectory: true)
    }
    let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    return base.appendingPathComponent("Polterware Notes", isDirectory: true)
}

func bundleDisplayName() -> String {
    let display = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String
    let name = Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String
    return display ?? name ?? "Polterware Notes"
}

func log(_ message: String) {
    let stamp = isoNow()
    let line = "\(stamp) \(message)\n"
    logLock.lock()
    defer { logLock.unlock() }
    FileHandle.standardError.write(Data(line.utf8))
    let dir = dataDirectory().appendingPathComponent("run", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let url = dir.appendingPathComponent("notifier.log")
    if !FileManager.default.fileExists(atPath: url.path) {
        FileManager.default.createFile(atPath: url.path, contents: nil)
    }
    if let handle = try? FileHandle(forWritingTo: url) {
        defer { try? handle.close() }
        _ = try? handle.seekToEnd()
        try? handle.write(contentsOf: Data(line.utf8))
    }
}

func emit(_ line: String) {
    log(line)
    print(line)
    fflush(stdout)
}

func isoNow() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}

func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
}

func parseISO(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = fractional.date(from: value) {
        return date
    }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: value)
}

func osVersionString() -> String {
    let version = ProcessInfo.processInfo.operatingSystemVersion
    return "\(version.majorVersion).\(version.minorVersion).\(version.patchVersion)"
}
