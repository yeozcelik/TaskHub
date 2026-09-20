/* src/state/store.js — şema normalleştirme.
 *
 * T3.1'e kadar bu dosya Node'da yüklenemiyordu: modül yüklenirken
 * `window.addEventListener` çağırıyordu (ADR 0002'de kayıtlı bulgu).
 * Kanca artık `installStorageHooks()` içinde ve açıkça çağrılıyor, dosya da
 * sınanabilir hâle geldi.
 *
 * Buradaki iddialar SPEC.md S11'in ta kendisi: eski veri okunur kalmalı. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const FILES = ["core/util.js", "core/sort.js", "core/recurrence.js", "i18n/strings.js",
               "html/sanitize.js", "state/adapter-local.js", "state/store.js"];
const {
  normalizeTask, normalizeState, normalizeNotes, normalizeNotebook,
  normalizeNotePage, normalizeBox, defaultState, defaultNotes,
  formatBytes, SCHEMA_VERSION, BOX_MIN_W, BOX_MAX_W, CANVAS_MAX,
} = load(FILES, ["normalizeTask", "normalizeState", "normalizeNotes", "normalizeNotebook",
  "normalizeNotePage", "normalizeBox", "defaultState", "defaultNotes",
  "formatBytes", "SCHEMA_VERSION", "BOX_MIN_W", "BOX_MAX_W", "CANVAS_MAX"]);

test("normalizeTask: çöp girdi görev üretmez", () => {
  for (const bad of [null, undefined, 42, "metin", [], {}, { title: "   " }])
    assert.equal(normalizeTask(bad), null);
});

test("normalizeTask: eksik alanlar güvenli varsayılana oturur", () => {
  const t = plain(normalizeTask({ title: "iş" }));
  assert.equal(t.title, "iş");
  assert.equal(t.priority, "med");
  assert.equal(t.dueDate, null);
  assert.deepEqual(t.tags, []);
  assert.deepEqual(t.subtasks, []);
  assert.equal(t.done, false);
  assert.equal(t.completedAt, null);
  assert.equal(t.sourceNoteId, null);
  assert.ok(t.id && t.createdAt && t.updatedAt);
});

test("normalizeTask: geçersiz değerler REDDEDİLİR, uydurulmaz", () => {
  const t = plain(normalizeTask({ title: "x", priority: "acayip", dueDate: "14/02/2026" }));
  assert.equal(t.priority, "med", "bilinmeyen öncelik varsayılana düşer");
  assert.equal(t.dueDate, null, "ayrıştırılamayan tarih null olur, tahmin edilmez");
});

test("normalizeTask: etiketler kırpılır, boşlar atılır, 30 ile sınırlanır", () => {
  const many = Array.from({ length: 50 }, (_, i) => " et" + i + " ");
  const t = plain(normalizeTask({ title: "x", tags: many.concat([" ", "", null, 5]) }));
  assert.equal(t.tags.length, 30);
  assert.equal(t.tags[0], "et0", "baştaki/sondaki boşluk kırpılır");
});

test("normalizeTask: başlıksız alt görev saklanmaz", () => {
  const t = plain(normalizeTask({ title: "x", subtasks: [
    { title: "gerçek" }, { title: "  " }, {}, null, "metin",
  ]}));
  assert.equal(t.subtasks.length, 1);
  assert.equal(t.subtasks[0].title, "gerçek");
  assert.ok(t.subtasks[0].id, "kimliksiz alt göreve kimlik verilir");
});

test("normalizeTask: completedAt yalnız tamamlanmışta dolar", () => {
  assert.equal(plain(normalizeTask({ title: "x", done: false, completedAt: "2026-01-01T00:00:00.000Z" })).completedAt, null);
  assert.ok(plain(normalizeTask({ title: "x", done: true })).completedAt, "tamamlanana zaman damgası verilir");
});

test("normalizeTask: sourceNoteId eksikse tamamen reddedilir", () => {
  assert.equal(plain(normalizeTask({ title: "x", sourceNoteId: { notebookId: "a" } })).sourceNoteId, null);
  assert.equal(plain(normalizeTask({ title: "x", sourceNoteId: "a" })).sourceNoteId, null);
  assert.deepEqual(plain(normalizeTask({ title: "x", sourceNoteId: { notebookId: "a", pageId: "b" } })).sourceNoteId,
    { notebookId: "a", pageId: "b" });
});

test("normalizeState: çöpten varsayılan duruma düşer", () => {
  for (const bad of [null, undefined, 7, "x", []])
    assert.deepEqual(plain(normalizeState(bad)), plain(defaultState()));
  assert.equal(plain(defaultState()).version, SCHEMA_VERSION);
});

test("normalizeState: bilinmeyen tema/dil reddedilir", () => {
  const s = plain(normalizeState({ settings: { theme: "neon", lang: "kl" } }));
  assert.equal(s.settings.theme, "auto");
  assert.equal(s.settings.lang, "tr");
  const ok = plain(normalizeState({ settings: { theme: "dark", lang: "en" } }));
  assert.equal(ok.settings.theme, "dark");
  assert.equal(ok.settings.lang, "en");
});

/* ---------------- S11 (not sayfaları) NEDEN BURADA DEĞİL ------------------
 * `normalizeNotePage` eski `html` alanını kutuya çevirirken `sanitizeHtml`
 * çağırır, o da `document.implementation` ister. Node'da `document` yok.
 *
 * Kritik ayrıntı: `sanitizeHtml` bu hatayı YUTAR ve `""` döndürür
 * (`try { scratchDoc(html) } catch { return "" }`). Tarayıcıda makul bir
 * savunma — bozuk içerik yüzünden uygulama çökmesin. Ama DOM'suz bir ortamda
 * sonuç sessizce BOŞ olur: burada yazılacak bir S11 testi, göç hiç çalışmadan
 * "geçiyormuş" gibi görünebilirdi.
 *
 * Bu yüzden S11'in not-sayfası iddiaları GERÇEK tarayıcıda, gerçek süzgeçle
 * koşuyor: `tools/probe/behavior.mjs`. Sahte bir DOM'a karşı süzgeç sınamak
 * hiç sınamamaktan kötüdür.                                                */

test("normalizeBox: koordinat ve genişlik sınırlara oturur", () => {
  const far = plain(normalizeBox({ id: "b", x: 999999, y: -50, w: 999999, html: "<p>x</p>" }));
  assert.ok(far.x <= CANVAS_MAX && far.x >= 0);
  assert.ok(far.y >= 0);
  assert.ok(far.w <= BOX_MAX_W && far.w >= BOX_MIN_W);
  const tiny = plain(normalizeBox({ id: "b", x: 0, y: 0, w: 1, html: "<p>x</p>" }));
  assert.equal(tiny.w, BOX_MIN_W);
});

test("normalizeNotebook: adsız defter ve bozuk sayfa çökertmez", () => {
  const nb = plain(normalizeNotebook({ id: "x", pages: [null, 5, { id: "p", title: "t" }] }));
  assert.ok(Array.isArray(nb.pages));
  assert.ok(nb.pages.length >= 1);
  assert.equal(typeof nb.name, "string");
});

test("normalizeNotes: çöpten boş defter listesi", () => {
  for (const bad of [null, 3, "x", { notebooks: "hayır" }])
    assert.deepEqual(plain(normalizeNotes(bad)).notebooks, []);
  assert.deepEqual(plain(normalizeNotes(undefined)), plain(defaultNotes()));
});

test("formatBytes: okunabilir birimler", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});

test("normalizeTask: recur EKLEMELİ alan — eski kayıtta yok, null olur", () => {
  assert.equal(plain(normalizeTask({ title: "eski görev" })).recur, null);
  assert.equal(plain(normalizeTask({ title: "x", recur: "haftalık" })).recur, null, "çöp kural reddedilir");
  assert.equal(plain(normalizeTask({ title: "x", recur: { freq: "yearly", interval: 1, anchor: "2026-05-10" } })).recur,
    null, "desteklenmeyen frekans sessizce kabul edilmez");
});

test("normalizeTask: geçerli tekrar kuralı korunur", () => {
  const t = plain(normalizeTask({ title: "x",
    recur: { freq: "weekly", interval: 2, byDay: [1, 3], anchor: "2026-05-11" } }));
  assert.deepEqual(t.recur, { freq: "weekly", interval: 2, byDay: [1, 3], anchor: "2026-05-11" });
});
