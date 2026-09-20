#!/usr/bin/env node
/* Görev listesinin DOM davranışı — gerçek tarayıcıda.
 *
 * `node --test` saf fonksiyonları, `verify.mjs` iddia setini kanıtlar.
 * İkisi de uzlaştırıcının DOĞRU ÇİZDİĞİNİ kanıtlamaz. Bu koşum onu kanıtlar,
 * özellikle T2.2'nin en riskli kabul ölçütünü: filtre değişince ODAK KAYBOLMAZ.
 *
 * GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flag = n => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };

const SEED = `(() => {
  state.tasks = [
    { id:"a", title:"alfa rapor",  notes:"", dueDate:"2026-05-10", priority:"high", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"beta rapor",  notes:"", dueDate:"2026-05-10", priority:"low",  tags:[],     subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"gama İstanbul", notes:"", dueDate:null,       priority:"med",  tags:[],     subtasks:[], done:false, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:null, sourceNoteId:null },
  ];
  today = "2026-05-10";
  ui.q = ""; render();
  return true;
})()`;

const ids = 'Array.from(document.querySelectorAll("#list .card")).map(n => n.getAttribute("aria-label"))';

const checks = [];
const check = (name, actual, expected) => checks.push({ name, actual, expected,
  pass: JSON.stringify(actual) === JSON.stringify(expected) });

await withPage(`file://${resolve(ROOT, "index.html")}`, async evaluate => {
  const ev = async expr => { const r = await evaluate(expr); if (r.error) throw new Error(expr + "\n  → " + r.error); return r.value; };
  await ev(SEED);

  check("üç görev çizildi", await ev(ids), ["alfa rapor", "beta rapor", "gama İstanbul"]);

  // Grup içi sıra sortTasks ile aynı olmalı: aynı tarih → öncelik (high önce).
  check("grup içi sıra: yüksek öncelik önde",
    await ev(`Array.from(document.querySelectorAll("#g-today .card")).map(n => n.getAttribute("aria-label"))`),
    ["alfa rapor", "beta rapor"]);

  // Türkçe harf katlamalı arama listede de geçerli.
  await ev(`ui.q = "istanbul"; renderList();`);
  check('arama "istanbul" → "İstanbul"u bulur', await ev(ids), ["gama İstanbul"]);

  // --- ASIL SINAMA: odak korunumu ---
  await ev(`ui.q = ""; renderList();`);
  await ev(`document.querySelector('#list .card[aria-label="beta rapor"]').focus();`);
  check("odak karta yerleşti", await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor");

  // Kartın İÇERİĞİ değişsin (imza değişir → kart yeniden kurulur).
  await ev(`state.tasks.find(t => t.id === "b").title = "beta rapor (güncel)"; renderList();`);
  check("içerik güncellendikten sonra odak KORUNDU",
    await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor (güncel)");

  // Onay kutusuna odaklanıp içerik değiştir: yuva da korunmalı.
  await ev(`document.querySelector('#list .card[aria-label="alfa rapor"] .check').focus();`);
  await ev(`state.tasks.find(t => t.id === "a").title = "alfa rapor v2"; renderList();`);
  check("odak YUVASI korundu (onay kutusu)",
    await ev(`document.activeElement.className`), "check");

  // Sıralama değişince (taşıma yolu) odak kaybolmamalı.
  await ev(`document.querySelector('#list .card[aria-label="beta rapor (güncel)"]').focus();`);
  await ev(`state.tasks.find(t => t.id === "b").priority = "high"; state.tasks.find(t => t.id === "a").priority = "low"; renderList();`);
  check("taşımadan sonra sıra değişti",
    await ev(`Array.from(document.querySelectorAll("#g-today .card")).map(n => n.getAttribute("aria-label"))`),
    ["beta rapor (güncel)", "alfa rapor v2"]);
  check("taşımadan sonra odak hâlâ aynı kartta",
    await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor (güncel)");

  // Kova değişimi: tamamlanan görev "completed" grubuna düşmeli.
  await ev(`state.tasks.find(t => t.id === "c").done = true; renderList();`);
  check("tamamlanan görev completed kovasına taşındı",
    await ev(`Array.from(document.querySelectorAll("#g-completed .card")).map(n => n.getAttribute("aria-label"))`),
    ["gama İstanbul"]);

  // Odak listeden BAŞKA bir yere gittiyse geri çalınmamalı. Bu, düzeltmenin
  // kendisinden daha sinir bozucu bir hata olurdu: kullanıcı arama kutusuna
  // geçer, bir çizim tetiklenir ve imleç karta geri fırlar.
  await ev(`document.querySelector('#list .card').focus();`);
  await ev(`document.getElementById("q").focus(); state.tasks[0].title = "alfa v3"; renderList();`);
  check("odak arama kutusundayken ÇALINMAZ", await ev(`document.activeElement.id`), "q");

  // Boş durum ve geri dönüş: durum sıfırlanıp tekrar kurulabilmeli.
  await ev(`ui.q = "hicbirseyeuymaz"; renderList();`);
  check("eşleşme yoksa boş durum", await ev(`!!document.querySelector("#list .empty")`), true);
  await ev(`ui.q = ""; renderList();`);
  check("boş durumdan sonra liste yeniden kurulur", await ev(`document.querySelectorAll("#list .card").length`), 3);
}, { browser: flag("--browser"), waitFor: "typeof renderList === 'function' && document.getElementById('list')" });

let bad = 0;
for (const c of checks){
  console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  if (!c.pass){ console.log(`      beklenen: ${JSON.stringify(c.expected)}`); console.log(`      gelen   : ${JSON.stringify(c.actual)}`); bad++; }
}
console.log(`\nbehavior: ${checks.length - bad}/${checks.length} geçti`);
process.exit(bad ? 1 : 0);
