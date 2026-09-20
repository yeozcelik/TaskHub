#!/usr/bin/env node
/* Derlenmiş index.html'i gerçek bir tarayıcıda açar ve ?test=1 iddia setini koşar.
   `node --test` saf çekirdeği kanıtlar; bu, TARAYICIDA çalıştığını kanıtlar.
   İkisi farklı sorulardır ve ikisi de gerekir.

   Çıkış kodu: 0 = hepsi geçti ve taban korundu, 1 = değil.  */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateOnPage } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASELINE = 222;   // SPEC.md S2: iddia sayısı GERİLEYEMEZ

const flag = n => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };

const { value, error } = await evaluateOnPage(
  `file://${resolve(ROOT, "index.html")}?test=1`,
  "JSON.stringify(window.__testResult)",
  { browser: flag("--browser"), waitFor: "window.__testResult" },
);

if (error){ console.error("verify: sayfa hata verdi —", error); process.exit(1); }

const r = JSON.parse(value);
const passed = r.total - r.failed;
console.log(`verify: ${r.total} iddia · ${passed} geçti · ${r.failed} kaldı`);

let bad = false;
if (r.failed > 0){
  console.error("verify: BAŞARISIZ İDDİALAR:");
  for (const n of r.names) console.error("  ✗ " + n);
  bad = true;
}
if (r.total < BASELINE){
  console.error(`verify: İDDİA SAYISI GERİLEDİ — ${r.total} < ${BASELINE} (SPEC.md S2)`);
  bad = true;
}
process.exit(bad ? 1 : 0);
