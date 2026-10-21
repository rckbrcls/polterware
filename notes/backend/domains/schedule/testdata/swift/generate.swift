// Fixture-only adaptation of ScheduleConfig.recurrenceDates: simple cases where
// iterative Calendar stepping and anchor-based stepping intentionally agree.
// Run from domains/schedule: swift testdata/swift/generate.swift > testdata/swift_golden.json
import Foundation

let formatter = ISO8601DateFormatter()
formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
let definitions: [(String, Calendar.Component, String, String, Int, Int)] = [
    ("daily", .day, "2026-03-01T12:00:00.000Z", "America/Sao_Paulo", 1, 4),
    ("weekly", .weekOfYear, "2026-10-05T08:00:00.000Z", "UTC", 2, 4),
    ("monthly", .month, "2026-01-28T09:00:00.000Z", "UTC", 1, 4),
    ("yearly", .year, "2026-06-15T09:00:00.000Z", "UTC", 1, 4),
    ("hourly", .hour, "2026-10-03T22:00:00.000Z", "UTC", 6, 4),
    ("minutely", .minute, "2026-10-03T21:30:00.000Z", "Asia/Kolkata", 2, 4)
]
var cases: [[String: Any]] = []
for (frequency, component, anchor, zone, every, count) in definitions {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: zone)!
    var date = formatter.date(from: anchor)!
    var expected: [String] = []
    for _ in 0..<count {
        expected.append(formatter.string(from: date))
        date = calendar.date(byAdding: component, value: every, to: date)!
    }
    cases.append([
        "name": "swift " + frequency,
        "rule": ["anchor": anchor, "tz": zone, "freq": frequency, "every": every, "end": ["type": "never"]],
        "query": ["kind": "first", "n": count],
        "expect": expected
    ])
}
let data = try JSONSerialization.data(withJSONObject: ["version": 1, "cases": cases], options: [.prettyPrinted, .sortedKeys])
print(String(data: data, encoding: .utf8)!)
