const { app } = require("electron");
const fs = require("node:fs");
const command = process.argv[2] || "status";
const nativePath = process.argv[3];
const resultPath = process.argv[4];
function finish(value) {
  fs.writeFileSync(resultPath, JSON.stringify(value));
  app.quit();
}
if (!nativePath || !resultPath) {
  finish({ ok: false, error: "usage" });
} else {
  const native = require(nativePath);
  native.start((raw) => {
    const message = JSON.parse(raw);
    if (!message.rid) return;
    if (message.error) return finish({ ok: false, error: message.error });
    if (message.rid === "status") {
      if (command === "authorize") native.send("auth", "requestAuthorization", "null");
      else if (command === "pending") native.send("pending", "pending", "null");
      else if (command === "delivered") native.send("delivered", "delivered", "null");
      else if (command === "cleanup") native.send("cleanup-rem", "removeAll", JSON.stringify("rem:"));
      else finish({ ok: true, authorization: message.value.authorization, pendingCount: message.value.pendingCount });
    } else if (message.rid === "auth") native.send("status2", "status", "null");
    else if (message.rid === "status2") finish({ ok: true, granted: message.value, authorization: message.value.authorization, pendingCount: message.value.pendingCount });
    else if (message.rid === "pending") finish({ ok: true, pending: message.value });
    else if (message.rid === "delivered") finish({ ok: true, delivered: message.value });
    else if (message.rid === "cleanup-rem") native.send("cleanup-one", "removeAll", JSON.stringify("one:"));
    else if (message.rid === "cleanup-one") finish({ ok: true, removed: true });
  });
  app.whenReady().then(() => native.send("status", "status", "null"));
}
setTimeout(() => finish({ ok: false, error: "inspect-timeout" }), 15_000);
