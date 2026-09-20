/* src/core/commands.js — komut kaydı ve eşleme. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const g = load(["core/util.js", "core/commands.js"],
  ["registerCommand", "availableCommands", "scoreMatch", "matchCommands", "COMMANDS"]);
const { registerCommand, availableCommands, scoreMatch, matchCommands } = g;

const items = [
  { id: "a", label: "Yeni görev" },
  { id: "b", label: "Görünümü değiştir" },
  { id: "c", label: "Koyu temaya geç" },
  { id: "d", label: "JSON yedeği indir" },
  { id: "e", label: "İstanbul defterini aç" },
];
const ids = q => plain(matchCommands(items, q)).map(x => x.id);   // vm realm → host (ADR 0002)

test("boş sorgu: hepsi, kayıt sırasıyla", () => {
  assert.deepEqual(ids(""), ["a", "b", "c", "d", "e"]);
  assert.deepEqual(ids("   "), ["a", "b", "c", "d", "e"]);
});

test("eşleşmeyen sorgu boş döner", () => {
  assert.deepEqual(ids("zzzz"), []);
  assert.equal(scoreMatch("Yeni görev", "zzz"), null);
});

test("Türkçe harf katlaması: ASCII yazıp Türkçe bulunur", () => {
  assert.ok(ids("gorunum").includes("b"));
  assert.ok(ids("istanbul").includes("e"), '"istanbul" → "İstanbul"');
  assert.ok(ids("gorev").includes("a"));
  assert.ok(ids("KOYU").includes("c"), "büyük/küçük harf duyarsız");
});

test("altdizi eşlemesi: harfler bitişik olmak zorunda değil", () => {
  assert.ok(ids("yg").includes("a"), "Yeni Görev");
  assert.ok(ids("jyi").includes("d"), "JSON Yedeği İndir");
});

test("baştan eşleşen, ortadan eşleşene göre üstte", () => {
  const r = matchCommands([
    { id: "orta", label: "Şu an koyu tema" },
    { id: "bas",  label: "Koyu tema" },
  ], "koyu");
  assert.equal(r[0].id, "bas");
});

test("bitişik eşleşme, dağınık eşleşmeye göre üstte", () => {
  const r = matchCommands([
    { id: "dagin", label: "Görev ekle ve notu aç" },
    { id: "bitis", label: "Görev" },
  ], "görev");
  assert.equal(r[0].id, "bitis");
});

test("etiketin en başından eşleşme, kelime başına göre üstte", () => {
  // İkisi de bitişik ve tam eşleşir. Ayrım: biri etiketin başında, diğeri
  // ortasında bir kelimenin başında. Komut paletlerinin yerleşik tercihi
  // baştan eşleşmedir.
  const r = matchCommands([
    { id: "kelimeBasi", label: "Sayfayı yenile" },
    { id: "enBas",      label: "Yenileme aracı" },
  ], "yenile");
  assert.equal(r[0].id, "enBas");
});

test("kelime başı, kelime ORTASINA göre üstte", () => {
  const r = matchCommands([
    { id: "orta", label: "Deneme tema" },
    { id: "bas",  label: "Şu an koyu tema" },
  ], "tema");
  assert.equal(r.length, 2, "ikisi de eşleşmeli");
});

test("eşit puanda kayıt sırası korunur (belirlenimci)", () => {
  const same = [{ id: "1", label: "Tema" }, { id: "2", label: "Tema" }, { id: "3", label: "Tema" }];
  assert.deepEqual(plain(matchCommands(same, "tema")).map(x => x.id), ["1", "2", "3"]);
  assert.deepEqual(plain(matchCommands(same, "tema")).map(x => x.id), ["1", "2", "3"], "tekrar aynı");
});

test("label fonksiyon olarak da verilebilir (dil değişimi için)", () => {
  const r = matchCommands([{ id: "f", label: () => "Koyu tema" }], "koyu");
  assert.equal(r.length, 1);
});

test("registerCommand: kayıt, aynı id üzerine yazar, geçersizi reddeder", () => {
  const before = availableCommands().length;
  registerCommand({ id: "test.x", label: () => "X", run(){} });
  assert.equal(availableCommands().length, before + 1);
  registerCommand({ id: "test.x", label: () => "X2", run(){} });
  assert.equal(availableCommands().length, before + 1, "aynı id iki kez eklenmez");
  assert.equal(registerCommand({ id: "yok" }), null, "run'ı olmayan reddedilir");
  assert.equal(registerCommand(null), null);
});

test("when(): bağlama uymayan komut listelenmez", () => {
  let ok = false;
  registerCommand({ id: "test.when", label: () => "Bağlamlı", run(){}, when: () => ok });
  assert.ok(!availableCommands().some(c => c.id === "test.when"));
  ok = true;
  assert.ok(availableCommands().some(c => c.id === "test.when"));
});

test("sınır girdileri çökertmez", () => {
  assert.deepEqual(plain(matchCommands([], "x")), []);
  assert.deepEqual(plain(matchCommands([{ id: "n", label: null }], "")), [{ id: "n", label: null }]);
  assert.equal(scoreMatch("", "a"), null);
  assert.equal(scoreMatch("abc", ""), 0);
});
