#!/usr/bin/env node
/* T3.2 — göç ve geri düşme. Bunlar sayfa YENİDEN YÜKLEMESİ gerektirir
 * (başlangıç sırası sınanıyor), o yüzden behavior.mjs'ten ayrı duruyor.
 *
 * Sınananlar:
 *   1. `?noidb=1` ile localStorage'a düşülür ve her şey çalışır
 *   2. Bayraksız açılışta localStorage verisi IndexedDB'ye TAŞINIR
 *   3. Göç GERİ ALINABİLİR: localStorage kaydı silinmez
 *   4. Taşınan veri doğru okunur (S11: v1 yapısı kayıpsız)
 *   5. Göç bir kez olur; ikinci açılış veriyi ezmez
 *
 * GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FILE = `file://${resolve(ROOT, "index.html")}`;
const flag = n => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };
const READY = "typeof renderList === 'function' && typeof storageKind === 'string' && document.getElementById('list') !== null";

const checks = [];
const check = (name, actual, expected) => checks.push({ name, actual, expected,
  pass: JSON.stringify(actual) === JSON.stringify(expected) });

/* v1 şemasıyla, tuval öncesi `html` alanlı bir kayıt — S11'in gerçek girdisi. */
const V1_STATE = JSON.stringify({
  version: 1,
  settings: { theme: "dark", lang: "en", noteGrid: true, lastNote: null, lastBackupAt: null, nagDismissedAt: null },
  tasks: [
    { id: "eski1", title: "Eski görev", notes: "", dueDate: "2026-05-10", priority: "high",
      tags: ["arşiv"], subtasks: [{ id: "s", title: "adım", done: true }], done: false,
      createdAt: "2025-01-01T00:00:00.000Z", updatedAt: "2025-01-01T00:00:00.000Z", completedAt: null },
  ],
});
const V1_NOTES = JSON.stringify({
  version: 1,
  notebooks: [{ id: "nb", name: "Eski defter", color: "#5b5bd6",
    pages: [{ id: "pg", title: "Eski sayfa", html: "<p>tuval <b>öncesi</b></p>" }] }],
});

await withPage(`${FILE}?noidb=1`, async evaluate => {
  const ev = async e => { const r = await evaluate(e); if (r.error) throw new Error(e.slice(0, 70) + " → " + r.error); return r.value; };
  const waitReady = async () => {
    for (let i = 0; i < 100; i++){
      try { if (await ev(`(() => { try { return !!(${READY}); } catch(e){ return false; } })()`)) return; } catch (e){}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error("sayfa yeniden yüklendikten sonra hazır olmadı");
  };
  const reload = async url => { await ev(`location.href = ${JSON.stringify(url)}; true`).catch(() => {}); await waitReady(); };

  await waitReady();

  // --- 1) geri düşme yolu ---
  check("?noidb=1 → localStorage'a düşülür", await ev(`storageKind`), "localStorage");
  check("düşüşte de yazma çalışır",
    await ev(`(async () => { await storage.set("__probe__","1"); const v = await storage.get("__probe__");
      await storage.remove("__probe__"); return v; })()`), "1");

  // --- v1 verisini localStorage'a koy, IndexedDB'yi temizle ---
  await ev(`(async () => {
    localStore.setSync(STORAGE_KEY, ${JSON.stringify(V1_STATE)});
    localStore.setSync(NOTES_KEY, ${JSON.stringify(V1_NOTES)});
    await localStore.remove(MIGRATED_KEY);
    await localStore.remove(JOURNAL_KEY);
    await new Promise(res => { const r = indexedDB.deleteDatabase("taskhub"); r.onsuccess = r.onerror = r.onblocked = res; });
    return true;
  })()`);

  // --- 2) bayraksız açılış: göç ---
  await reload(FILE);
  check("bayraksız açılışta IndexedDB seçilir", await ev(`storageKind`), "indexedDB");

  const migrated = await ev(`(async () => {
    const inIdb = await storage.get(STORAGE_KEY);
    const notesIdb = await storage.get(NOTES_KEY);
    const stillLocal = await localStore.get(STORAGE_KEY);
    const stamp = await localStore.get(MIGRATED_KEY);
    return { inIdb: !!inIdb, notesIdb: !!notesIdb, stillLocal: !!stillLocal, stamped: !!stamp };
  })()`);
  check("görevler IndexedDB'ye taşındı", migrated.inIdb, true);
  check("notlar IndexedDB'ye taşındı", migrated.notesIdb, true);
  check("GERİ ALINABİLİR: localStorage kaydı silinmedi", migrated.stillLocal, true);
  check("göç zaman damgası bırakıldı", migrated.stamped, true);

  // --- 3) taşınan veri doğru okundu mu (S11) ---
  const loaded = await ev(`(() => ({
    tasks: state.tasks.map(t => [t.title, t.priority, t.dueDate, t.tags.join(), t.subtasks.length]),
    theme: state.settings.theme, lang: state.settings.lang,
    nb: notes.notebooks.map(n => [n.name, n.pages.length, n.pages[0].boxes.length]),
    boxHtml: notes.notebooks[0].pages[0].boxes[0].html,
  }))()`);
  check("S11: v1 görev kayıpsız", loaded.tasks, [["Eski görev", "high", "2026-05-10", "arşiv", 1]]);
  check("S11: v1 ayarlar kayıpsız", [loaded.theme, loaded.lang], ["dark", "en"]);
  check("S11: v1 defter ve eski `html` → kutu", loaded.nb, [["Eski defter", 1, 1]]);
  check("S11: eski içerik ve biçim korundu",
    [loaded.boxHtml.includes("tuval"), loaded.boxHtml.includes("<b>")], [true, true]);

  // --- 4) göç bir kez olur ---
  await ev(`(async () => {
    state.tasks.push({ id:"yeni", title:"göçten sonra", notes:"", dueDate:null, priority:"med",
      tags:[], subtasks:[], done:false, createdAt:"2026-06-01T00:00:00.000Z",
      updatedAt:"2026-06-01T00:00:00.000Z", completedAt:null, sourceNoteId:null });
    await saveNow(); return true;
  })()`);
  await reload(FILE);
  check("ikinci açılış eski localStorage verisini geri getirmez",
    await ev(`state.tasks.map(t => t.title)`), ["Eski görev", "göçten sonra"]);

  // --- 5) S5: tavan gerçekten kalktı mı? ---
  // `estimate().quota` bir TAVAN bildirir, rezervasyon değil. Tek dürüst
  // kanıt gerçekten yazıp geri okumaktır.
  const quota = await ev(`(async () => {
    const CHUNK = 10 * 1024 * 1024;
    const blob = "x".repeat(CHUNK);
    const res = { quota: quotaBytes, measured: quotaMeasured, written: 0, readBack: 0, error: null };
    try {
      for (let i = 0; i < 6; i++){ await storage.set("__quota_" + i, blob); res.written += CHUNK; }
      for (let i = 0; i < 6; i++){
        const v = await storage.get("__quota_" + i);
        if (typeof v === "string") res.readBack += v.length;
      }
    } catch (err){ res.error = String((err && err.name) || err); }
    for (let i = 0; i < 6; i++){ try { await storage.remove("__quota_" + i); } catch (e){} }
    try { localStore.setSync("__quota_local", blob); res.localOk = true; await localStore.remove("__quota_local"); }
    catch (err){ res.localOk = false; res.localError = String((err && err.name) || err); }
    return res;
  })()`);
  check("S5: 60 MB IndexedDB'ye yazıldı ve BİREBİR geri okundu",
    [quota.error, quota.written, quota.readBack], [null, 62914560, 62914560]);
  check("S5: aynı veri localStorage'a sığmaz (eski tavan gerçekti)",
    [quota.localOk, quota.localError], [false, "QuotaExceededError"]);
  check("T3.3: kota ölçüldü ve varsayımın çok üstünde",
    [quota.measured, quota.quota > 50 * 1024 * 1024], [true, true]);

  // temizlik
  await ev(`(async () => {
    await localStore.remove(STORAGE_KEY); await localStore.remove(NOTES_KEY);
    await localStore.remove(MIGRATED_KEY); await localStore.remove(JOURNAL_KEY);
    return true;
  })()`);
}, { browser: flag("--browser"), waitFor: READY });

let bad = 0;
for (const c of checks){
  console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  if (!c.pass){ console.log(`      beklenen: ${JSON.stringify(c.expected)}`); console.log(`      gelen   : ${JSON.stringify(c.actual)}`); bad++; }
}
console.log(`\nmigration: ${checks.length - bad}/${checks.length} geçti`);
process.exit(bad ? 1 : 0);
