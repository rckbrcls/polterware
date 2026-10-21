import AppKit
import Foundation
import UserNotifications

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        let center = UNUserNotificationCenter.current()
        center.delegate = self
        registerCategories()
        log("start pid=\(ProcessInfo.processInfo.processIdentifier) bundleName=\(bundleDisplayName()) bundleId=\(Bundle.main.bundleIdentifier ?? "?")")
        Task.detached {
            do {
                let command = try parseCommand()
                let code = await run(command)
                if case .serve = command {
                    return
                }
                exit(code)
            } catch {
                log("error \(error)")
                fputs("\(error)\n", stderr)
                exit(2)
            }
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        let note = info["noteId"] as? String ?? ""
        let identifier = response.notification.request.identifier
        switch response.actionIdentifier {
        case UNNotificationDismissActionIdentifier:
            log("dismissed id=\(identifier)")
        case UNNotificationDefaultActionIdentifier:
            await performAction("OPEN", note: note, identifier: identifier, source: "os")
        default:
            await performAction(response.actionIdentifier, note: note, identifier: identifier, source: "os")
        }
    }
}

func performAction(_ action: String, note: String, identifier: String, source: String) async {
    log("action=\(action) source=\(source) note=\(note) id=\(identifier)")
    switch action {
    case "DONE":
        let code = await postAction(path: "/complete", fields: [
            "noteId": note,
            "occurrenceId": identifier,
            "action": "done",
            "source": source,
        ])
        log("complete status=\(code)")
    case "SNOOZE":
        let code = await postAction(path: "/snooze", fields: [
            "noteId": note,
            "occurrenceId": identifier,
            "minutes": 10,
            "source": source,
        ])
        log("snooze status=\(code)")
    case "OPEN":
        openNotes(note: note, focus: false)
    case "START_FOCUS":
        openNotes(note: note, focus: true)
    default:
        log("ignored action \(action)")
    }
}

private func openNotes(note: String, focus: Bool) {
    var text = "pwnotes://note/\(note)"
    if focus {
        text += "?action=focus"
    }
    guard let url = URL(string: text) else {
        log("open invalid \(text)")
        return
    }
    let opened = NSWorkspace.shared.open(url)
    log("open \(text) ok=\(opened)")
}

private func run(_ command: Command) async -> Int32 {
    switch command {
    case .serve:
        await serve()
        return 0
    case let .armIn(seconds, note, title, body, category):
        let auth = await requestAuthIfNeeded()
        guard auth == .authorized || auth == .provisional else {
            return 3
        }
        let fire = Date().addingTimeInterval(seconds)
        let millis = Int(fire.timeIntervalSince1970 * 1000)
        let item = ReminderItem(
            id: "rem:\(note):\(millis)",
            noteId: note,
            fireAt: isoString(fire),
            title: title,
            body: body,
            category: category
        )
        do {
            try await schedule(item)
            emit("armed-cli \(item.id) fireAt=\(item.fireAt)")
            return 0
        } catch {
            log("arm-in failed \(error)")
            return 4
        }
    case .armPlan:
        let auth = await requestAuthIfNeeded()
        guard auth == .authorized || auth == .provisional else {
            return 3
        }
        guard await ensureCore(), let plan = await fetchPlan() else {
            return 4
        }
        await reconcile(items: plan.items)
        emit("armed-plan \(plan.items.count)")
        return 0
    case let .measurePending(count):
        let auth = await requestAuthIfNeeded()
        guard auth == .authorized || auth == .provisional else {
            return 3
        }
        await measurePending(count: count)
        return 0
    case .dumpPending:
        await dumpPending()
        return 0
    case .dumpDelivered:
        await dumpDelivered()
        return 0
    case let .removePrefix(prefix):
        await removePrefix(prefix)
        return 0
    case .authStatus:
        emit(authPayload(await currentAuth()))
        return 0
    case .requestAuth:
        let state = await requestAuthIfNeeded()
        return (state == .authorized || state == .provisional) ? 0 : 3
    case .registerAgent:
        return registerService(agentService(), label: "agent")
    case .unregisterAgent:
        return unregisterService(agentService(), label: "agent")
    case .registerLoginItem:
        return registerService(loginItemService(), label: "login-item")
    case .unregisterLoginItem:
        return unregisterService(loginItemService(), label: "login-item")
    case .registrationStatus:
        emit(registrationSnapshot())
        return 0
    case let .simulateAction(action, note, identifier):
        await performAction(action, note: note, identifier: identifier, source: "cli")
        return 0
    }
}

private func serve() async {
    if ProcessInfo.processInfo.environment["PWNOTES_NOTIFIER_SKIP_AUTH"] == "1" {
        log("serve skip-auth pid=\(ProcessInfo.processInfo.processIdentifier)")
        await park()
        return
    }
    if let port = startDebugServer() {
        log("debug=http://127.0.0.1:\(port)")
        let url = dataDirectory().appendingPathComponent("run/notifier.json")
        let payload: [String: Any] = [
            "pid": ProcessInfo.processInfo.processIdentifier,
            "debug": "http://127.0.0.1:\(port)",
            "bundleName": bundleDisplayName(),
        ]
        if let data = try? JSONSerialization.data(withJSONObject: payload) {
            try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: url)
        }
    }
    var delay: UInt64 = 1
    let auth = await requestAuthIfNeeded()
    if auth != .authorized && auth != .provisional {
        log("serve without permission; already-armed notifications stay with the OS")
        await park()
        return
    }
    while true {
        if await ensureCore() {
            delay = 1
            if let plan = await fetchPlan() {
                await reconcile(items: plan.items)
            }
            await ackHeartbeat()
            _ = await coreRequest(method: "GET", path: "/watch?timeout=25", body: nil)
        } else {
            log("core retry in \(delay)s")
            try? await Task.sleep(nanoseconds: delay * 1_000_000_000)
            delay = min(delay * 2, 30)
        }
    }
}

private func park() async {
    while true {
        try? await Task.sleep(nanoseconds: 3_600_000_000_000)
    }
}

@main
enum NotesNotifierMain {
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
    }
}
