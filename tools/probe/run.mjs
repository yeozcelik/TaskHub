// Tarayıcı yetenek ölçümünü uçtan uca koşar: Chromium'u başlatır, CDP ile bağlanır,
// probe.html'i file:// üzerinden açar, sonucu basar. Sıfır npm bağımlılığı.
//
// Kullanım:  node tools/probe/run.mjs [--browser /yol/chrome]
//
// Bu betik GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR. Yalnız ölçüm içindir; iddiaların
// yeniden üretilebilir olması için repoda durur.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const probe = resolve(here, "probe.html");

const CANDIDATES = [
  process.env.CHROME_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome",
];
const flagIdx = process.argv.indexOf("--browser");
const bin = flagIdx !== -1 ? process.argv[flagIdx + 1] : CANDIDATES.find(p => p && existsSync(p));
if (!bin) { console.error("Tarayıcı bulunamadı. --browser ile yol ver veya CHROME_PATH ayarla."); process.exit(2); }

const profile = mkdtempSync(join(tmpdir(), "taskhub-probe-"));
const child = spawn(bin, [
  "--headless=new", "--no-sandbox", "--disable-gpu",
  "--remote-debugging-port=9222", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });

const cleanup = () => { try { child.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

const driver = spawn(process.execPath, [resolve(here, "cdp.mjs"), `file://${probe}`], { stdio: "inherit" });
driver.on("exit", code => { cleanup(); process.exit(code ?? 0); });
