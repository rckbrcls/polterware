// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NotesNotifier",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "NotesNotifier", targets: ["NotesNotifier"]),
    ],
    targets: [
        .executableTarget(
            name: "NotesNotifier",
            path: "Sources/NotesNotifier",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
