// Drive headless Chromium over CDP with zero npm dependencies (Node 22 has global WebSocket).
const [,, targetUrl] = process.argv;
const base = "http://127.0.0.1:9222";

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForBrowser(){
  for (let i = 0; i < 60; i++){
    try { const r = await fetch(base + "/json/version"); if (r.ok) return await r.json(); } catch {}
    await sleep(250);
  }
  throw new Error("browser did not expose CDP port");
}

const version = await waitForBrowser();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let id = 0;
const pending = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params = {}, sessionId){
  const msgId = ++id;
  return new Promise(res => { pending.set(msgId, res); ws.send(JSON.stringify({ id: msgId, method, params, sessionId })); });
}

const { result: { targetId } } = await send("Target.createTarget", { url: targetUrl });
const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });

await sleep(6000);   // real wall-clock time: lets IndexedDB actually hit disk

const out = await send("Runtime.evaluate",
  { expression: "document.getElementById('out').textContent", returnByValue: true }, sessionId);
console.log(out.result?.result?.value ?? JSON.stringify(out, null, 2));
ws.close();
process.exit(0);
