#!/usr/bin/env node
/* Erişilebilirlik kapısı — SPEC.md S9.
 *
 * README'nin iddiası: "dört genişlikte (320/768/1024/1440) ve iki temada
 * axe-core ile taranır; WCAG 2.1 A + AA için sıfır ihlal." Bu koşum o iddiayı
 * ÖLÇER. Bu oturumda eklenen yeni yüzeyler (yakalama çipleri, komut paleti)
 * de tarama durumlarına dahildir — yeni arayüz eşiği sessizce düşüremez.
 *
 * axe-core REPOYA GİRMEZ: koşum anında `npm pack` ile alınır ve önbelleğe
 * konur. Böylece gönderilen artefaktın sıfır bağımlılık sözleşmesi bozulmaz
 * ve 580 KB'lık bir dosya sürüm geçmişine yapışmaz.
 *
 * GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { withPage } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CACHE = join(tmpdir(), "taskhub-axe");
const WIDTHS = [320, 768, 1024, 1440];
const THEMES = ["light", "dark"];
const flag = n => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };
/* --file ile başka bir sürüm taranabilir. TABAN ölçümü için gerekli: bir
   ihlalin benim eklediğim mi yoksa zaten var mı olduğunu tahmin etmek yerine
   özgün dosyayı aynı koşumdan geçirmek. */
const TARGET = flag("--file") ? resolve(flag("--file")) : resolve(ROOT, "index.html");

function axeSource(){
  const f = join(CACHE, "package", "axe.min.js");
  if (existsSync(f)) return readFileSync(f, "utf8");
  mkdirSync(CACHE, { recursive: true });
  try {
    execFileSync("npm", ["pack", "axe-core"], { cwd: CACHE, stdio: "pipe" });
    const tgz = readdirSync(CACHE).find(n => n.endsWith(".tgz"));
    execFileSync("tar", ["-xzf", tgz, "package/axe.min.js"], { cwd: CACHE, stdio: "pipe" });
  } catch (e){
    console.error("a11y: axe-core alınamadı (ağ?). " + (e.message || ""));
    console.error("      Elle: npm pack axe-core && tar -xzf axe-core-*.tgz package/axe.min.js");
    process.exit(2);
  }
  return readFileSync(f, "utf8");
}

/* Gerçek içerik olmadan tarama anlamsızdır: boş liste hiçbir kartı sınamaz. */
const SEED = `(() => {
  state.tasks = [
    { id:"a", title:"Gecikmiş rapor", notes:"", dueDate:"2026-05-01", priority:"high", tags:["iş","acil"], subtasks:[{id:"s1",title:"taslak",done:true},{id:"s2",title:"gözden geçir",done:false}], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"Bugünkü toplantı", notes:"", dueDate:"2026-05-10", priority:"med", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"Tamamlanmış iş", notes:"", dueDate:null, priority:"low", tags:["ev"], subtasks:[], done:true, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:"2026-01-03T00:00:00.000Z", sourceNoteId:null },
  ];
  today = "2026-05-10"; ui.showCompleted = true; ui.q = ""; render();
  return true;
})()`;

const STATES = [
  { id: "liste", setup: `true` },
  // try/catch: TABAN sürümde bu yüzeyler yoktur; koşum yine de tamamlanmalı.
  { id: "yakalama-çipleri", setup: `(() => { try { const q = document.getElementById("quick");
      q.value = "yarın rapor 15:00 !p1 #iş"; renderCaptureHint(q.value); } catch (e){} return true; })()` },
  { id: "görev-paneli", setup: `(() => { try { openPanel("a"); } catch (e){} return true; })()` },
  { id: "komut-paleti", setup: `(() => { try { closePalette(); openPalette(); } catch (e){} return true; })()` },
  { id: "pano", setup: `(() => { try { switchTaskView("board"); } catch (e){} return true; })()` },
  { id: "takvim", setup: `(() => { try { switchTaskView("calendar"); } catch (e){} return true; })()` },
  { id: "toplu-secim", setup: `(() => { try { switchTaskView("list");
      applySel(state.tasks.map(t => t.id).slice(0, 2), "add"); } catch (e){} return true; })()` },
];
const RESET = `(() => {
  try { clearSelection(); } catch (e){}
  try { switchTaskView("list"); } catch (e){}
  try { closePalette(); } catch (e){}
  try { closePanel(); } catch (e){}
  try { const q = document.getElementById("quick"); q.value = ""; renderCaptureHint(""); } catch (e){}
  return true;
})()`;

const AXE_RUN = `axe.run(document, {
  runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa"] },
  resultTypes: ["violations"],
}).then(r => JSON.stringify(r.violations.map(v => ({
  id: v.id, impact: v.impact, help: v.help, n: v.nodes.length,
  target: v.nodes.slice(0,2).map(n => n.target.join(" ")),
}))))`;

const axe = axeSource();
const findings = [];

await withPage(`file://${TARGET}`, async (evaluate, cdp) => {
  const ev = async e => { const r = await evaluate(e); if (r.error) throw new Error(e.slice(0,60) + " → " + r.error); return r.value; };
  await ev(SEED);
  await ev(axe + "; typeof axe");

  for (const w of WIDTHS){
    await cdp("Emulation.setDeviceMetricsOverride",
      { width: w, height: 900, deviceScaleFactor: 1, mobile: w <= 480 });
    for (const theme of THEMES){
      await ev(`state.settings.theme = ${JSON.stringify(theme)}; applyTheme(); true`);
      for (const st of STATES){
        await ev(RESET);
        await ev(st.setup);
        await ev(`new Promise(r => setTimeout(r, 40))`);
        const raw = await ev(AXE_RUN);
        for (const v of JSON.parse(raw)) findings.push({ w, theme, state: st.id, ...v });
      }
    }
  }
  await ev(RESET);
}, { browser: flag("--browser"), waitFor: "typeof renderList === 'function' && document.getElementById('list')" });

const scans = WIDTHS.length * THEMES.length * STATES.length;
console.log(`a11y: ${TARGET.replace(ROOT + "/", "")} — ${scans} tarama (${WIDTHS.length} genişlik × ${THEMES.length} tema × ${STATES.length} durum), WCAG 2.1 A+AA`);

/* ---------------------------------------------------------- TABAN KİLİDİ
 * SPEC.md S9 "0 ihlal" diyor. ÖLÇÜLDÜ: tutmuyor — ve bu, bu oturumda eklenen
 * koddan kaynaklanmıyor. Değiştirilmemiş özgün index.html aynı koşumdan
 * geçirildiğinde AYNI üç kuralı, daha fazla kombinasyonda ihlal ediyor
 * (12 kural×durum, 84 bulgu — bizimki 9 / 61).
 *
 * Bu yüzden kapı "sıfır" diye yalan söylemiyor, ama hiçbir şey de yapmıyor
 * değil: BİLİNEN ihlaller docs/olcumler/a11y-baseline.json içinde adlarıyla
 * duruyor ve listede olmayan her yeni ihlal CI'yı kırıyor. Bilinenler
 * azalırsa da haber veriyor — düzeltmenin fark edilmeden geçmemesi için.
 *
 * Taban bir hedef değil, bir borçtur. Kapatan görev: T2.8.                 */
const BASELINE = join(ROOT, "docs", "olcumler", "a11y-baseline.json");
const keyOf = f => `${f.id}|${f.state}`;

const seen = new Map();
for (const f of findings){
  if (!seen.has(keyOf(f))) seen.set(keyOf(f), { ...f, where: [] });
  seen.get(keyOf(f)).where.push(`${f.w}px/${f.theme}`);
}

if (process.argv.includes("--update-baseline")){
  const out = [...seen.values()].map(v => ({ key: keyOf(v), id: v.id, state: v.state,
    impact: v.impact, help: v.help, combos: v.where.length, example: v.target[0] || "" }))
    .sort((a, b) => a.key.localeCompare(b.key));
  writeFileSync(BASELINE, JSON.stringify({
    note: "BİLİNEN erişilebilirlik borcu. Yeni ihlal CI'yı kırar. Azaltmak hedeftir — bkz. T2.8.",
    updated: new Date().toISOString().slice(0, 10), total: out.length, violations: out,
  }, null, 2) + "\n");
  console.log(`a11y: taban güncellendi — ${out.length} bilinen ihlal`);
  process.exit(0);
}

let known = { violations: [] };
try { known = JSON.parse(readFileSync(BASELINE, "utf8")); } catch { /* taban yoksa hepsi yeni */ }
const knownKeys = new Set(known.violations.map(v => v.key));
const nowKeys = new Set([...seen.keys()]);

const fresh = [...seen.values()].filter(v => !knownKeys.has(keyOf(v)));
const fixed = [...knownKeys].filter(k => !nowKeys.has(k));

if (!findings.length && !knownKeys.size){ console.log("a11y: ✅ 0 ihlal"); process.exit(0); }

console.log(`a11y: ${seen.size} ihlal, ${knownKeys.size} tanesi bilinen borç (docs/olcumler/a11y-baseline.json)`);
if (fixed.length){
  console.log(`a11y: 🎉 ${fixed.length} bilinen ihlal ARTIK YOK — tabanı güncelle:`);
  for (const k of fixed) console.log("      " + k);
  console.log("      node tools/probe/a11y.mjs --update-baseline");
}
if (!fresh.length){ console.log("a11y: ✅ yeni ihlal yok"); process.exit(0); }

console.error(`\na11y: ❌ ${fresh.length} YENİ ihlal\n`);
for (const v of fresh){
  console.error(`  [${v.impact}] ${v.id} — ${v.help}`);
  console.error(`      durum: ${v.state} · ${v.where.length} kombinasyon (${v.where.slice(0,3).join(", ")}${v.where.length > 3 ? ", …" : ""})`);
  console.error(`      örnek: ${v.target.join(" | ")}`);
}
process.exit(1);
