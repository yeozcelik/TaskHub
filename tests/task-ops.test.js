/* src/core/task-ops.js — bırakma hedefinin VERİDEKİ karşılığı.
   Sürükleme mekaniğinden bağımsız sınanır; gerekçe docs/adr/0003. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const { dropFields, fieldsChange, neighborGroup, BUCKETS } =
  load(["core/util.js", "core/task-ops.js"],
       ["dropFields", "fieldsChange", "neighborGroup", "BUCKETS"]);

const T = "2026-05-10";

test("dropFields liste: kova → tarih", () => {
  assert.deepEqual(plain(dropFields("today", "list", T)),    { dueDate: "2026-05-10", done: false });
  assert.deepEqual(plain(dropFields("tomorrow", "list", T)), { dueDate: "2026-05-11", done: false });
  // "Bu hafta" 2-7. günleri kapsıyor; kovanın EN ERKEN günü seçilir.
  assert.deepEqual(plain(dropFields("week", "list", T)),     { dueDate: "2026-05-12", done: false });
  // "Sonra" 8. günden başlar.
  assert.deepEqual(plain(dropFields("later", "list", T)),    { dueDate: "2026-05-18", done: false });
  assert.deepEqual(plain(dropFields("nodate", "list", T)),   { dueDate: null, done: false });
});

test("dropFields: seçilen tarih GERÇEKTEN o kovaya düşer", () => {
  /* Sabit sayıları elle saymak yerine kovalama fonksiyonuna sorulur: tarih
     aritmetiği değişirse bu iddia kırılır, testin kendisi değil. */
  const { bucketOf } = load(["core/util.js", "core/task-ops.js"], ["bucketOf"]);
  for (const key of ["today", "tomorrow", "week", "later"]){
    const f = dropFields(key, "list", T);
    const sahte = { done: false, dueDate: f.dueDate };
    assert.equal(bucketOf(sahte, T), key, `${key} kovasına bırakınca tarih ${f.dueDate} oldu`);
  }
});

test("dropFields: GECİKMİŞ bırakma hedefi DEĞİL", () => {
  assert.equal(dropFields("overdue", "list", T), null);
  assert.equal(dropFields("overdue", "board", T), null);
});

test("dropFields: tamamlanan her iki görünümde de hedef", () => {
  assert.deepEqual(plain(dropFields("completed", "list", T)),  { done: true });
  assert.deepEqual(plain(dropFields("completed", "board", T)), { done: true });
});

test("dropFields pano: sütun → öncelik, ve tamamlanmışlıktan çıkarır", () => {
  for (const p of ["high", "med", "low"])
    assert.deepEqual(plain(dropFields(p, "board", T)), { priority: p, done: false });
  // Liste kovaları panoda hedef değil, sütun adları listede hedef değil.
  assert.equal(dropFields("today", "board", T), null);
  assert.equal(dropFields("high", "list", T), null);
});

test("dropFields: bilinmeyen anahtar null", () => {
  assert.equal(dropFields("", "list", T), null);
  assert.equal(dropFields("uydurma", "list", T), null);
  assert.equal(dropFields("hasOwnProperty", "list", T), null);   // prototip sızıntısı yok
});

test("fieldsChange: fark yoksa false", () => {
  const task = { dueDate: "2026-05-10", done: false, priority: "med" };
  assert.equal(fieldsChange(task, { dueDate: "2026-05-10", done: false }), false);
  assert.equal(fieldsChange(task, { dueDate: "2026-05-11", done: false }), true);
  assert.equal(fieldsChange(task, { done: true }), true);
});

test("neighborGroup: ekrandaki gruplar arasında gezinir, uçlarda sarmaz", () => {
  const present = ["today", "tomorrow", "week", "nodate"];
  assert.equal(neighborGroup(present, "today", 1, "list", T), "tomorrow");
  assert.equal(neighborGroup(present, "week", -1, "list", T), "tomorrow");
  assert.equal(neighborGroup(present, "today", -1, "list", T), null);
  assert.equal(neighborGroup(present, "nodate", 1, "list", T), null);
});

test("neighborGroup: geçersiz hedefler ATLANIR (gecikmiş)", () => {
  const present = ["overdue", "today", "tomorrow"];
  // Bugün'den yukarı çıkınca gecikmişe düşmez — atlanır, uç kabul edilir.
  assert.equal(neighborGroup(present, "today", -1, "list", T), null);
  assert.equal(neighborGroup(present, "today", 1, "list", T), "tomorrow");
  // Gecikmişteki bir görev yine de AŞAĞI taşınabilir: kaynak olmak serbest.
  assert.equal(neighborGroup(present, "overdue", 1, "list", T), "today");
});

test("neighborGroup: ekranda olmayan grup hedef değil", () => {
  assert.equal(neighborGroup(["today", "nodate"], "today", 1, "list", T), "nodate");
  assert.equal(neighborGroup(["today"], "today", 1, "list", T), null);
});

test("neighborGroup pano: sütunlar arası", () => {
  const cols = ["high", "med", "low", "completed"];
  assert.equal(neighborGroup(cols, "med", -1, "board", T), "high");
  assert.equal(neighborGroup(cols, "low", 1, "board", T), "completed");
  assert.equal(neighborGroup(cols, "high", -1, "board", T), null);
});

test("BUCKETS sırası bırakma hedefleriyle tutarlı", () => {
  // Kovaların görünen sırası zamansal: gecikmiş → bugün → yarın → hafta → sonra.
  const idx = k => plain(BUCKETS).indexOf(k);
  assert.ok(idx("today") < idx("tomorrow"));
  assert.ok(idx("tomorrow") < idx("week"));
  assert.ok(idx("week") < idx("later"));
  assert.ok(idx("later") < idx("nodate"));
});
