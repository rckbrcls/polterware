import Darwin
import Foundation

func startDebugServer() -> Int? {
    guard ProcessInfo.processInfo.environment["PWNOTES_NOTIFIER_DEBUG"] == "1" else {
        return nil
    }
    let fd = socket(AF_INET, SOCK_STREAM, 0)
    guard fd >= 0 else {
        log("debug socket failed")
        return nil
    }
    var reuse: Int32 = 1
    _ = setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
    var address = sockaddr_in()
    address.sin_family = sa_family_t(AF_INET)
    address.sin_port = in_port_t(0).bigEndian
    address.sin_addr.s_addr = inet_addr("127.0.0.1")
    let bound = withUnsafePointer(to: address) { pointer -> Int32 in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sock in
            bind(fd, sock, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
    }
    guard bound == 0, listen(fd, 8) == 0 else {
        log("debug bind failed")
        close(fd)
        return nil
    }
    var resolved = sockaddr_in()
    var length = socklen_t(MemoryLayout<sockaddr_in>.size)
    let named = withUnsafeMutablePointer(to: &resolved) { pointer -> Int32 in
        pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { sock in
            getsockname(fd, sock, &length)
        }
    }
    guard named == 0 else {
        close(fd)
        return nil
    }
    let port = Int(UInt16(bigEndian: resolved.sin_port))
    Thread.detachNewThread {
        while true {
            let client = accept(fd, nil, nil)
            if client < 0 {
                continue
            }
            var buffer = [UInt8](repeating: 0, count: 8192)
            let count = buffer.withUnsafeMutableBytes { raw in
                read(client, raw.baseAddress, raw.count)
            }
            let text = count > 0 ? String(bytes: buffer[..<count], encoding: .utf8) ?? "" : ""
            let response = debugResponse(for: text)
            _ = response.withCString { write(client, $0, strlen($0)) }
            close(client)
        }
    }
    return port
}

private func debugResponse(for request: String) -> String {
    guard let range = request.range(of: "\r\n\r\n") else {
        return httpJSON(400, ["ok": false])
    }
    let body = String(request[range.upperBound...])
    guard let data = body.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let action = object["action"] as? String,
          let note = object["noteId"] as? String,
          let identifier = object["identifier"] as? String else {
        return httpJSON(400, ["ok": false])
    }
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        await performAction(action, note: note, identifier: identifier, source: "debug")
        semaphore.signal()
    }
    semaphore.wait()
    return httpJSON(200, ["ok": true])
}

private func httpJSON(_ code: Int, _ object: [String: Any]) -> String {
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
    let body = String(data: data, encoding: .utf8) ?? "{}"
    return "HTTP/1.1 \(code) OK\r\nContent-Type: application/json\r\nContent-Length: \(body.utf8.count)\r\nConnection: close\r\n\r\n\(body)"
}
