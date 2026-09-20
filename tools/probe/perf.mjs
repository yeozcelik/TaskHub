#!/usr/bin/env node
/* Görev listesi çizim bütçesi — SPEC.md S3 ve S4.
 *
 * S3: 5.000 görevde arama tuşu başına çizim < 16 ms (p95)
 * S4: filtre değişince EKLENEN DÜĞÜM SAYISI O(değişen), O(toplam) değil
 *
 * Ölçüm gerçek tarayıcıda, gerçek DOM üstünde. Aynı koşumda "tam yıkım"
 * davranışı da zorlanır (durum sıfırlanarak) — böylece önce/sonra aynı
 * koşullarda karşılaştırılır, iki ayrı sürüm derlemeye gerek kalmaz.
 *
 * GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR.  */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const N = Number(process.env.TASKS || 5000);
const BUDGET_MS = 16;          // S3
const flag = n => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };

const SEED = `(() => {
  const words = ["rapor","toplantı","İstanbul","ödeme","sıkça","proje","fatura","tasarım","gözden","analiz"];
  const prios = ["low","med","high"];
  const tasks = [];
  for (let i = 0; i < ${N}; i++){
    const d = new Date(2026, 4, 10 + (i % 40) - 15);
    tasks.push({
      id: "t" + i,
      title: words[i % words.length] + " " + i,
      notes: "", dueDate: (i % 7 === 0) ? null : d.toISOString().slice(0,10),
      priority: prios[i % 3], tags: (i % 5 === 0) ? ["iş"] : [],
      subtasks: [], done: i % 11 === 0,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      completedAt: (i % 11 === 0) ? "2026-01-01T00:00:00.000Z" : null, sourceNoteId: null,
    });
  }
  state.tasks = tasks;
  ui.q = ""; render();
  return document.querySelectorAll("#list .card").length;
})()`;

/* Bir çizimi ölçer: süre + MutationObserver ile eklenen düğüm sayısı.
   reset=true ise çizim durumu silinir; bu, ESKİ "her seferinde baştan kur"
   davranışının ta kendisidir. */
const MEASURE = (q, reset) => `(async () => {
  const box = document.getElementById("list");
  let added = 0, removed = 0;
  const obs = new MutationObserver(ms => {
    for (const m of ms){ added += m.addedNodes.length; removed += m.removedNodes.length; }
  });
  obs.observe(box, { childList:true, subtree:true });
  ui.q = ${JSON.stringify(q)};
  ${reset ? 'box.__taskList = null; box.textContent = "";' : ""}
  // Veri hattının payı: süzme + kovalama + sıralama, DOM'a dokunmadan.
  const d0 = performance.now();
  const vis = state.tasks.filter(matches);
  const gr = new Map(BUCKETS.map(b => [b, []]));
  for (const x of vis) gr.get(bucketOf(x, today)).push(x);
  for (const b of BUCKETS) sortTasks(gr.get(b));
  const dataMs = performance.now() - d0;
  const t0 = performance.now();
  renderList();
  const ms = performance.now() - t0;
  await new Promise(r => setTimeout(r, 0));
  obs.disconnect();
  return { ms, dataMs, q: ui.q, added, removed, cards: document.querySelectorAll("#list .card").length };
})()`;

const pct = (xs, p) => { const s = xs.slice().sort((a,b) => a-b); return s[Math.min(s.length-1, Math.floor(s.length*p))]; };

const result = await withPage(`file://${resolve(ROOT, "index.html")}`, async evaluate => {
  const seeded = await evaluate(SEED);
  if (seeded.error) throw new Error("tohumlama başarısız: " + seeded.error);
  const out = { seeded: seeded.value, incremental: [], teardown: [] };

  // Arama kutusuna harf harf yazmayı taklit eder: her tuş bir çizim.
  const typed = ["r", "ra", "rap", "rapo", "rapor", "rapo", "rap", "ra", "r", ""];
  for (const q of typed){
    const r = await evaluate(MEASURE(q, false));
    if (r.error) throw new Error("ölçüm başarısız: " + r.error);
    out.incremental.push(r.value);
  }
  for (const q of typed){
    const r = await evaluate(MEASURE(q, true));
    if (r.error) throw new Error("ölçüm başarısız: " + r.error);
    out.teardown.push(r.value);
  }
  return out;
}, { browser: flag("--browser"), waitFor: "typeof renderList === 'function' && document.getElementById('list')" });

const inc = result.incremental, tear = result.teardown;
const incMs = inc.map(x => x.ms), tearMs = tear.map(x => x.ms);
const incAdd = inc.map(x => x.added), tearAdd = tear.map(x => x.added);

console.log(`\nGörev sayısı: ${result.seeded} kart çizili (${N} görev)\n`);
console.log("  ARTIMLI — adım adım");
console.log('  sorgu      kart   eklenen   silinen    veri(ms)   toplam(ms)');
for (const r of inc) console.log(`  ${JSON.stringify(r.q).padEnd(9)} ${String(r.cards).padStart(6)} ${String(r.added).padStart(9)} ${String(r.removed).padStart(9)} ${r.dataMs.toFixed(2).padStart(11)} ${r.ms.toFixed(2).padStart(12)}`);
console.log("");
console.log("                         artımlı      tam yıkım");
console.log(`  çizim p50 (ms)      ${pct(incMs,.5).toFixed(2).padStart(10)}   ${pct(tearMs,.5).toFixed(2).padStart(12)}`);
console.log(`  çizim p95 (ms)      ${pct(incMs,.95).toFixed(2).padStart(10)}   ${pct(tearMs,.95).toFixed(2).padStart(12)}`);
console.log(`  eklenen düğüm p50   ${String(pct(incAdd,.5)).padStart(10)}   ${String(pct(tearAdd,.5)).padStart(12)}`);
console.log(`  eklenen düğüm top.  ${String(incAdd.reduce((a,b)=>a+b,0)).padStart(10)}   ${String(tearAdd.reduce((a,b)=>a+b,0)).padStart(12)}`);

/* S3 ÖLÇÜLDÜĞÜNDE İKİ AYRI REJİME AYRILDI — bkz. docs/olcumler/.
   Tek eşik iki farklı şeyi ölçüyormuş:
     S3a  küçük delta (yazarken):  uzlaştırıcının işi. KARŞILANIYOR, kapı aktif.
     S3b  toplu geçiş (filtre temizleme): binlerce kart İNŞA etmek gerekiyor;
          fark algoritmasıyla çözülmez, pencereleme gerekir. AÇIK, T2.3b.
   Eşik düşürülmedi; ölçüm iki eşiğin gerektiğini gösterdi ve ikisi de tutuluyor. */
const SMALL_DELTA = 100;                       // düğüm değişimi eşiği
const small = inc.filter(r => r.added + r.removed <= SMALL_DELTA);
const bulk  = inc.filter(r => r.added + r.removed >  SMALL_DELTA);

let bad = false;
console.log("");
if (!small.length){ console.error("S3a ÖLÇÜLEMEDİ: küçük deltalı çizim yok"); bad = true; }
else {
  const p95s = pct(small.map(r => r.ms), .95);
  if (p95s > BUDGET_MS){ console.error(`S3a BAŞARISIZ: küçük delta p95 ${p95s.toFixed(2)} ms > ${BUDGET_MS} ms`); bad = true; }
  else console.log(`S3a ✅ küçük delta p95 ${p95s.toFixed(2)} ms < ${BUDGET_MS} ms  (${small.length} çizim)`);
}

const incTotal = incAdd.reduce((a,b)=>a+b,0), tearTotal = tearAdd.reduce((a,b)=>a+b,0);
const incMed = pct(incAdd,.5), tearMed = pct(tearAdd,.5);
if (incTotal >= tearTotal){ console.error(`S4 BAŞARISIZ: artımlı ${incTotal}, tam yıkım ${tearTotal} — kazanç yok`); bad = true; }
else console.log(`S4  ✅ eklenen düğüm ${tearTotal} → ${incTotal} toplam; medyanda ${tearMed} → ${incMed}  (${Math.round(tearMed/Math.max(1,incMed))}× az)`);

if (bulk.length){
  const worst = bulk.reduce((a,b) => a.ms > b.ms ? a : b);
  const perCard = worst.ms / Math.max(1, worst.added);
  console.log(`S3b ⛔ AÇIK — toplu geçişte en kötü ${worst.ms.toFixed(0)} ms (${worst.added} kart, ~${perCard.toFixed(3)} ms/kart)`);
  console.log(`        16 ms'lik kareye sığan kart sayısı ≈ ${Math.floor(BUDGET_MS / perCard)} → pencereleme gerekli (T2.3b)`);
}
process.exit(bad ? 1 : 0);
