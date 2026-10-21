import AppKit
import CryptoKit
import Foundation
import UserNotifications

func contentHash(title: String, body: String, fireAt: String, category: String) -> String {
    let raw = "\(title)|\(body)|\(fireAt)|\(category)"
    let digest = SHA256.hash(data: Data(raw.utf8))
    return digest.map { String(format: "%02x", $0) }.joined()
}

func registerCategories() {
    let done = UNNotificationAction(identifier: "DONE", title: "Done", options: [])
    let snooze = UNNotificationAction(identifier: "SNOOZE", title: "Snooze", options: [])
    let open = UNNotificationAction(identifier: "OPEN", title: "Open", options: [.foreground])
    let startFocus = UNNotificationAction(identifier: "START_FOCUS", title: "Start focus", options: [.foreground])
    let reminder = UNNotificationCategory(
        identifier: "reminder",
        actions: [done, snooze, open],
        intentIdentifiers: [],
        options: []
    )
    let reminderFocus = UNNotificationCategory(
        identifier: "reminder-focus",
        actions: [done, snooze, startFocus, open],
        intentIdentifiers: [],
        options: []
    )
    let focusPhase = UNNotificationCategory(
        identifier: "focus-phase",
        actions: [],
        intentIdentifiers: [],
        options: []
    )
    UNUserNotificationCenter.current().setNotificationCategories([reminder, reminderFocus, focusPhase])
}

enum AuthState: String {
    case authorized
    case denied
    case notDetermined
    case provisional
    case ephemeral
    case unknown
}

func currentAuth() async -> AuthState {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    switch settings.authorizationStatus {
    case .authorized:
        return .authorized
    case .denied:
        return .denied
    case .notDetermined:
        return .notDetermined
    case .provisional:
        return .provisional
    case .ephemeral:
        return .ephemeral
    @unknown default:
        return .unknown
    }
}

func authPayload(_ state: AuthState) -> String {
    let payload: [String: String] = [
        "auth": state.rawValue,
        "bundleName": bundleDisplayName(),
        "bundleId": Bundle.main.bundleIdentifier ?? "",
        "os": osVersionString(),
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8) else {
        return "{\"auth\":\"\(state.rawValue)\"}"
    }
    return line
}

func requestAuthIfNeeded() async -> AuthState {
    let existing = await currentAuth()
    if existing != .notDetermined {
        emit(authPayload(existing))
        return existing
    }
    await MainActor.run {
        NSApp.activate()
    }
    do {
        let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
        let state: AuthState = granted ? .authorized : .denied
        emit(authPayload(state))
        if state == .denied {
            log("notification permission denied; not arming new reminders; already-armed notifications stay with the OS")
        }
        return state
    } catch {
        log("authorization error \(error.localizedDescription)")
        emit(authPayload(.unknown))
        return .unknown
    }
}

func schedule(_ item: ReminderItem) async throws {
    guard let fire = parseISO(item.fireAt) else {
        throw CommandParseError(message: "unparseable fireAt \(item.fireAt)")
    }
    let interval = fire.timeIntervalSinceNow
    guard interval > 0.2 else {
        log("skip past id=\(item.id) fireAt=\(item.fireAt)")
        return
    }
    let content = UNMutableNotificationContent()
    content.title = item.title
    content.body = item.body
    content.categoryIdentifier = item.category
    content.sound = .default
    content.userInfo = [
        "noteId": item.noteId,
        "hash": contentHash(title: item.title, body: item.body, fireAt: item.fireAt, category: item.category),
        "url": "pwnotes://note/\(item.noteId)",
    ]
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
    let request = UNNotificationRequest(identifier: item.id, content: content, trigger: trigger)
    try await UNUserNotificationCenter.current().add(request)
    log("armed id=\(item.id) in=\(String(format: "%.1f", interval))s category=\(item.category) title=\(item.title)")
}

func reconcile(items: [ReminderItem]) async {
    let center = UNUserNotificationCenter.current()
    let pending = await center.pendingNotificationRequests()
    var byID: [String: UNNotificationRequest] = [:]
    for request in pending {
        byID[request.identifier] = request
    }
    var desired = Set<String>()
    for item in items {
        desired.insert(item.id)
        let hash = contentHash(title: item.title, body: item.body, fireAt: item.fireAt, category: item.category)
        let existing = byID[item.id]?.content.userInfo["hash"] as? String
        if existing == hash {
            continue
        }
        do {
            try await schedule(item)
        } catch {
            log("arm failed id=\(item.id) \(error.localizedDescription)")
        }
    }
    let stale = pending.map(\.identifier).filter { identifier in
        (identifier.hasPrefix("rem:") || identifier.hasPrefix("one:")) && !desired.contains(identifier)
    }
    if !stale.isEmpty {
        center.removePendingNotificationRequests(withIdentifiers: stale)
        log("removed stale \(stale.joined(separator: ","))")
    }
}

func measurePending(count: Int) async {
    let center = UNUserNotificationCenter.current()
    var accepted = 0
    var rejected = 0
    var lastError = ""
    for index in 0..<count {
        let identifier = String(format: "spike-limit-%03d", index)
        let content = UNMutableNotificationContent()
        content.title = "Polterware Notes limit"
        content.body = identifier
        content.categoryIdentifier = "reminder"
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 3600 + Double(index), repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        do {
            try await center.add(request)
            accepted += 1
        } catch {
            rejected += 1
            lastError = error.localizedDescription
        }
    }
    let pending = await center.pendingNotificationRequests()
    let ours = pending.map(\.identifier).filter { $0.hasPrefix("spike-limit-") }.sorted()
    let payload: [String: Any] = [
        "requested": count,
        "accepted": accepted,
        "rejected": rejected,
        "pending": ours.count,
        "pendingMin": ours.first ?? "",
        "pendingMax": ours.last ?? "",
        "lastError": lastError,
        "os": osVersionString(),
        "bundleName": bundleDisplayName(),
    ]
    if let data = try? JSONSerialization.data(withJSONObject: payload),
       let line = String(data: data, encoding: .utf8) {
        emit(line)
    }
}

func dumpPending() async {
    let pending = await UNUserNotificationCenter.current().pendingNotificationRequests()
    for request in pending {
        let body = request.content.body.replacingOccurrences(of: "\n", with: " ")
        emit("pending \(request.identifier) title=\(request.content.title) body=\(body) category=\(request.content.categoryIdentifier)")
    }
    emit("pending-count \(pending.count)")
}

func dumpDelivered() async {
    let delivered = await UNUserNotificationCenter.current().deliveredNotifications()
    for notification in delivered {
        let request = notification.request
        let body = request.content.body.replacingOccurrences(of: "\n", with: " ")
        emit("delivered \(request.identifier) title=\(request.content.title) body=\(body) category=\(request.content.categoryIdentifier)")
    }
    emit("delivered-count \(delivered.count)")
}

func removePrefix(_ prefix: String) async {
    let center = UNUserNotificationCenter.current()
    let pending = await center.pendingNotificationRequests()
    let pendingIDs = pending.map(\.identifier).filter { $0.hasPrefix(prefix) }
    if !pendingIDs.isEmpty {
        center.removePendingNotificationRequests(withIdentifiers: pendingIDs)
    }
    let delivered = await center.deliveredNotifications()
    let deliveredIDs = delivered.map(\.request.identifier).filter { $0.hasPrefix(prefix) }
    if !deliveredIDs.isEmpty {
        center.removeDeliveredNotifications(withIdentifiers: deliveredIDs)
    }
    emit("removed-prefix \(prefix) pending=\(pendingIDs.count) delivered=\(deliveredIDs.count)")
}
