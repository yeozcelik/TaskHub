/* Headless Chromium'u CDP üzerinden süren küçük sürücü. Sıfır npm bağımlılığı —
   Node 22'nin yerleşik fetch ve WebSocket'ini kullanır.

   Neden Playwright değil: bu repo sıfır bağımlılık sözleşmesine sahip ve ölçüm
   araçlarının bu sözleşmeyi bozması gerekmiyor. Gereken tek şey "sayfayı aç,
   bir koşulu bekle, bir ifadeyi değerlendir".

   GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR. */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sleep = ms => new Promise(r => setTimeout(r, ms));

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
];

export function findBrowser(explicit){
  const bin = explicit || CANDIDATES.find(p => p && existsSync(p));
  if (!bin) throw new Error("Tarayıcı bulunamadı. CHROME_PATH ayarla veya --browser ver.");
  return bin;
}

/* Sayfayı açar, hazır olmasını bekler, fn(evaluate)'i çağırır, kapatır.
   evaluate(ifade) → { value } | { error }. Çok adımlı ölçümler için.
   waitFor: true dönene kadar yoklanan ifade (sayfa bağlamında). */
export async function withPage(url, fn, opts = {}){
  return runPage(url, opts, fn);
}

/* Tek ifadelik kısayol. */
export async function evaluateOnPage(url, expression, opts = {}){
  return runPage(url, opts, evaluate => evaluate(expression));
}

async function runPage(url, { browser, waitFor = "true", timeoutMs = 20000 } = {}, fn){
  const bin = findBrowser(browser);
  const port = 9000 + Math.floor(Math.random() * 900);
  const profile = mkdtempSync(join(tmpdir(), "taskhub-probe-"));
  const child = spawn(bin, [
    "--headless=new", "--no-sandbox", "--disable-gpu",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  const cleanup = () => {
    try { child.kill(); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };

  try {
    const base = `http://127.0.0.1:${port}`;
    let version = null;
    for (let i = 0; i < 80 && !version; i++){
      try { const r = await fetch(base + "/json/version"); if (r.ok) version = await r.json(); } catch {}
      if (!version) await sleep(250);
    }
    if (!version) throw new Error("Tarayıcı CDP portunu açmadı.");

    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("CDP bağlantısı kurulamadı")); });

    let id = 0;
    const pending = new Map();
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params = {}, sessionId) => new Promise(res => {
      const msgId = ++id;
      pending.set(msgId, res);
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });

    const { result: { targetId } } = await send("Target.createTarget", { url });
    const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });

    const evaluate = async expr => {
      const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
      if (r.result?.exceptionDetails) return { error: r.result.exceptionDetails.text };
      return { value: r.result?.result?.value };
    };

    const deadline = Date.now() + timeoutMs;
    let ready = false;
    while (Date.now() < deadline){
      const r = await evaluate(`(() => { try { return !!(${waitFor}); } catch(e){ return false; } })()`);
      if (r.value === true){ ready = true; break; }
      await sleep(200);
    }
    if (!ready) throw new Error(`Koşul ${timeoutMs}ms içinde sağlanmadı: ${waitFor}`);

    /* CDP'ye ham erişim: a11y koşumu görünüm boyutunu değiştirmek için
       Emulation.setDeviceMetricsOverride'a ihtiyaç duyuyor. */
    const cdp = (method, params) => send(method, params, sessionId);

    const out = await fn(evaluate, cdp);
    ws.close();
    return out;
  } finally { cleanup(); }
}
