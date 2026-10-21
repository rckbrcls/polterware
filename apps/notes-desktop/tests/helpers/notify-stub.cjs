// Test-only N-API transport substitute. Never claims OS delivery.
let callback;
let items = [];
module.exports = {
  start(fn) { callback = fn; },
  send(rid, method, raw) {
    const input = JSON.parse(raw);
    let value;
    switch (method) {
      case "requestAuthorization": value = true; break;
      case "status": value = { authorization: "authorized", pendingCount: items.length }; break;
      case "pending": value = items.map(x => ({ id: x.id, hash: x.hash, repeats: !!x.repeat })); break;
      case "delivered": value = []; break;
      case "apply": {
        const old = new Map(items.map(x => [x.id, x.hash]));
        value = { added: input.filter(x => old.get(x.id) !== x.hash).map(x => x.id), removed: items.filter(x => !input.some(y => y.id === x.id)).map(x => x.id), unchanged: input.filter(x => old.get(x.id) === x.hash).length };
        items = input; break;
      }
      case "removeAll": value = items.filter(x => x.id.startsWith(input)).map(x => x.id); items = items.filter(x => !x.id.startsWith(input)); break;
      case "emitSystemEvent": queueMicrotask(() => callback(JSON.stringify({ event: "refresh", reason: input }))); value = null; break;
      case "finishAction": value = null; break;
      default: throw new Error(`Unsupported notification stub command: ${method}`);
    }
    queueMicrotask(() => callback(JSON.stringify({ rid, value })));
  },
  wasActionLaunch() { return false; },
  close() { items = []; },
};
