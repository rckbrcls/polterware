import Foundation
import ServiceManagement

func agentService() -> SMAppService {
    SMAppService.agent(plistName: "com.polterware.notes.notifier.plist")
}

func loginItemService() -> SMAppService {
    SMAppService.loginItem(identifier: "com.polterware.notes.notifier")
}

func statusName(_ status: SMAppService.Status) -> String {
    switch status {
    case .notRegistered:
        return "not-registered"
    case .enabled:
        return "enabled"
    case .requiresApproval:
        return "requires-approval"
    case .notFound:
        return "not-found"
    @unknown default:
        return "unknown"
    }
}

func registrationSnapshot() -> String {
    let agent = agentService()
    let login = loginItemService()
    let payload: [String: String] = [
        "agent": statusName(agent.status),
        "loginItem": statusName(login.status),
        "bundleId": Bundle.main.bundleIdentifier ?? "",
        "bundleName": bundleDisplayName(),
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else {
        return "{\"agent\":\"unknown\"}"
    }
    return line
}

func registerService(_ service: SMAppService, label: String) -> Int32 {
    do {
        try service.register()
        emit("\(label)-register ok \(registrationSnapshot())")
        return 0
    } catch {
        let nsError = error as NSError
        emit("\(label)-register error domain=\(nsError.domain) code=\(nsError.code) \(nsError.localizedDescription) \(registrationSnapshot())")
        return 5
    }
}

func unregisterService(_ service: SMAppService, label: String) -> Int32 {
    do {
        try service.unregister()
        emit("\(label)-unregister ok \(registrationSnapshot())")
        return 0
    } catch {
        let nsError = error as NSError
        emit("\(label)-unregister error domain=\(nsError.domain) code=\(nsError.code) \(nsError.localizedDescription) \(registrationSnapshot())")
        return 5
    }
}
