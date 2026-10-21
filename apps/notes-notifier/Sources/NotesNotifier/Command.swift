import Foundation

enum Command {
    case serve
    case armIn(seconds: Double, note: String, title: String, body: String, category: String)
    case armPlan
    case measurePending(Int)
    case dumpPending
    case dumpDelivered
    case removePrefix(String)
    case authStatus
    case requestAuth
    case registerAgent
    case unregisterAgent
    case registerLoginItem
    case unregisterLoginItem
    case registrationStatus
    case simulateAction(action: String, note: String, identifier: String)
}

struct CommandParseError: Error, CustomStringConvertible {
    let message: String
    var description: String { message }
}

func parseCommand() throws -> Command {
    let args = Array(CommandLine.arguments.dropFirst())
    if args.isEmpty || args == ["--serve"] {
        return .serve
    }

    var values: [String: String] = [:]
    var flags = Set<String>()
    var index = 0
    while index < args.count {
        let arg = args[index]
        guard arg.hasPrefix("--") else {
            throw CommandParseError(message: "unexpected argument \(arg)")
        }
        if index + 1 < args.count, !args[index + 1].hasPrefix("--") {
            values[arg] = args[index + 1]
            index += 2
        } else {
            flags.insert(arg)
            index += 1
        }
    }

    if flags.contains("--serve") {
        return .serve
    }
    if let raw = values["--arm-in"] {
        guard let seconds = Double(raw), seconds > 0 else {
            throw CommandParseError(message: "--arm-in requires a number of seconds greater than 0")
        }
        return .armIn(
            seconds: seconds,
            note: values["--note"] ?? "01ARZ3NDEKTSV4RRFFQ69G5FAV",
            title: values["--title"] ?? "Polterware Notes",
            body: values["--body"] ?? "",
            category: values["--category"] ?? "reminder"
        )
    }
    if flags.contains("--arm-plan") {
        return .armPlan
    }
    if let raw = values["--measure-pending"] {
        guard let count = Int(raw), count > 0 else {
            throw CommandParseError(message: "--measure-pending requires a positive integer")
        }
        return .measurePending(count)
    }
    if flags.contains("--dump-pending") {
        return .dumpPending
    }
    if flags.contains("--dump-delivered") {
        return .dumpDelivered
    }
    if let prefix = values["--remove-prefix"] {
        return .removePrefix(prefix)
    }
    if flags.contains("--auth-status") {
        return .authStatus
    }
    if flags.contains("--request-auth") {
        return .requestAuth
    }
    if flags.contains("--register-agent") {
        return .registerAgent
    }
    if flags.contains("--unregister-agent") {
        return .unregisterAgent
    }
    if flags.contains("--register-login-item") {
        return .registerLoginItem
    }
    if flags.contains("--unregister-login-item") {
        return .unregisterLoginItem
    }
    if flags.contains("--registration-status") {
        return .registrationStatus
    }
    if let action = values["--simulate-action"] {
        return .simulateAction(
            action: action,
            note: values["--note"] ?? "",
            identifier: values["--identifier"] ?? ""
        )
    }
    throw CommandParseError(message: "unknown command \(args.joined(separator: " "))")
}
