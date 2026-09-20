/* src/core/links.js — [[sayfa]] bağlantıları.
   Bu dosya HTML ÜRETMEZ; ürettiği tek şey metin aralıkları ve adlar. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const { extractLinks, splitByLinks, linkKey, buildLinkIndex, backlinksFor, findPageByName } =
  load(["core/util.js", "core/links.js"],
       ["extractLinks", "splitByLinks", "linkKey", "buildLinkIndex", "backlinksFor", "findPageByName"]);

const names = t => plain(extractLinks(t)).map(l => l.name);

test("temel çıkarma", () => {
  assert.deepEqual(names("bak [[Toplantı]] notuna"), ["Toplantı"]);
  assert.deepEqual(names("[[a]] ve [[b]]"), ["a", "b"]);
  assert.deepEqual(names("bağlantı yok"), []);
});

test("bozuk sözdizimi bağlantı üretmez", () => {
  assert.deepEqual(names("[[]]"), []);
  assert.deepEqual(names("[[   ]]"), []);
  assert.deepEqual(names("[tek]"), []);
  assert.deepEqual(names("[[açık"), []);
  assert.deepEqual(names("[[a\nb]]"), [], "satır sonu geçmez");
  assert.deepEqual(names("[[" + "x".repeat(200) + "]]"), [], "aşırı uzun ad reddedilir");
});

test("iç içe parantez kabul edilmez", () => {
  assert.deepEqual(names("[[a [[b]]"), ["b"]);
});

test("ad kırpılır, konumlar doğru", () => {
  // Elle sayılmış bir indeks yerine İLİŞKİ: dilim ham metni vermeli.
  const src = "önce [[  Ad  ]] sonra";
  const l = plain(extractLinks(src));
  assert.equal(l[0].name, "Ad", "ad kırpılır");
  assert.equal(l[0].raw, "[[  Ad  ]]", "ham metin kırpılmaz");
  assert.equal(src.slice(l[0].start, l[0].end), l[0].raw, "konumlar ham metni işaret eder");
  assert.equal(src.slice(0, l[0].start), "önce ");
});

test("linkKey: Türkçe harf katlamalı, boşluk sadeleşir", () => {
  assert.equal(linkKey("İstanbul"), linkKey("istanbul"));
  assert.equal(linkKey("İstanbul"), linkKey("ISTANBUL"));
  assert.equal(linkKey("  Toplantı   Notu "), linkKey("toplanti notu"));
  assert.equal(linkKey(null), "");
  assert.equal(linkKey(undefined), "");
});

test("splitByLinks: metin ve bağlantı parçalarına ayırır", () => {
  assert.deepEqual(plain(splitByLinks("bak [[X]] sonuna")), [
    { type: "text", text: "bak " },
    { type: "link", text: "X", key: "x" },
    { type: "text", text: " sonuna" },
  ]);
  assert.deepEqual(plain(splitByLinks("[[A]][[B]]")).map(p => p.text), ["A", "B"]);
  assert.deepEqual(plain(splitByLinks("düz")), [{ type: "text", text: "düz" }]);
  assert.deepEqual(plain(splitByLinks("")), []);
});

test("splitByLinks: parçalar birleşince ÖZGÜN metni verir (bağlantı işareti hariç)", () => {
  for (const src of ["a [[B]] c", "[[X]]", "hiç yok", "[[a]] [[b]] [[c]]"]){
    const joined = plain(splitByLinks(src)).map(p => p.type === "link" ? "[[" + p.text + "]]" : p.text).join("");
    // Ad kırpıldığı için birebir değil; içerik kaybı olmadığını sınıyoruz.
    assert.equal(joined.replace(/\s+/g, ""), src.replace(/\s+/g, ""), src);
  }
});

test("GÜVENLİK: bağlantı adı HTML olarak yorumlanmaz, ham metin döner", () => {
  const l = plain(extractLinks('[[<img src=x onerror=alert(1)>]]'));
  assert.equal(l.length, 1);
  assert.equal(l[0].name, "<img src=x onerror=alert(1)>", "ham metin — arayüz bunu textContent yapar");
  // Bu dosya hiçbir yerde HTML üretmiyor: çıktıda < > kaçışı YOK çünkü HTML YOK.
  assert.ok(!JSON.stringify(plain(splitByLinks("[[<b>x</b>]]"))).includes("&lt;"));
});

test("SABİT NOKTA: f(f(x)) === f(x)", () => {
  for (const src of ["a [[B]] c", "[[X]] [[Y]]", "düz metin", "[[a [[b]]"]){
    const once = plain(splitByLinks(src));
    const rebuilt = once.map(p => p.type === "link" ? "[[" + p.text + "]]" : p.text).join("");
    assert.deepEqual(plain(splitByLinks(rebuilt)).map(p => [p.type, p.text]),
      once.map(p => [p.type, p.text]), src);
  }
});

/* ------------------------------ indeks ------------------------------ */

const TASKS = [
  { id: "t1", title: "bak [[Toplantı]]" },
  { id: "t2", title: "yine [[toplanti]] ve [[Fikirler]]" },
  { id: "t3", title: "bağlantısız" },
  { id: "t4", title: "[[Toplantı]] [[Toplantı]]" },
];
const NB = [{ id: "nb1", pages: [
  { id: "p1", title: "Toplantı", boxes: [] },
  { id: "p2", title: "Günlük", boxes: [] },
]}];
const TEXT = p => p.id === "p2" ? "şuraya bak [[Toplantı]]" : "";

test("buildLinkIndex: görevler ve sayfalar indekslenir", () => {
  const ix = buildLinkIndex(TASKS, NB, TEXT);
  const b = backlinksFor(ix, "Toplantı");
  assert.deepEqual(plain(b.tasks).map(x => x.id), ["t1", "t2", "t4"]);
  assert.deepEqual(plain(b.pages).map(x => x.page.id), ["p2"]);
});

test("buildLinkIndex: aynı görev bir sayfayı BİR KEZ sayar", () => {
  const ix = buildLinkIndex(TASKS, NB, TEXT);
  assert.equal(backlinksFor(ix, "Toplantı").tasks.filter(x => x.id === "t4").length, 1);
});

test("buildLinkIndex: eşleştirme harf katlamalı", () => {
  const ix = buildLinkIndex(TASKS, NB, TEXT);
  assert.equal(backlinksFor(ix, "toplanti").tasks.length, 3);
  assert.equal(backlinksFor(ix, "TOPLANTI").tasks.length, 3);
});

test("backlinksFor: olmayan sayfa KIRIK değil, boş", () => {
  const ix = buildLinkIndex(TASKS, NB, TEXT);
  const b = backlinksFor(ix, "Hiç Yazılmamış");
  assert.deepEqual([plain(b.tasks).length, plain(b.pages).length], [0, 0]);
  // "Fikirler" sayfası YOK ama ona bağlantı VAR — davet.
  assert.equal(backlinksFor(ix, "Fikirler").tasks.length, 1);
});

test("buildLinkIndex: boş/eksik girdi çökertmez", () => {
  assert.equal(backlinksFor(buildLinkIndex(null, null, null), "x").tasks.length, 0);
  assert.equal(backlinksFor(buildLinkIndex([], [{ id: "n" }], () => ""), "x").pages.length, 0);
});

test("findPageByName: harf katlamalı bulur, yoksa null", () => {
  assert.equal(plain(findPageByName(NB, "toplanti")).page.id, "p1");
  assert.equal(plain(findPageByName(NB, "TOPLANTI")).page.id, "p1");
  assert.equal(findPageByName(NB, "yok"), null);
  assert.equal(findPageByName(NB, ""), null);
  assert.equal(findPageByName(null, "x"), null);
});

test("BAŞARIM: 5.000 görev + 500 sayfa indeksi < 50 ms", () => {
  const tasks = Array.from({ length: 5000 }, (_, i) => ({ id: "t" + i, title: "görev [[Sayfa" + (i % 50) + "]] " + i }));
  const nb = [{ id: "n", pages: Array.from({ length: 500 }, (_, i) => ({ id: "p" + i, title: "Sayfa" + i })) }];
  const text = p => "gövde [[Sayfa" + (Number(p.id.slice(1)) % 20) + "]]";
  const t0 = performance.now();
  const ix = buildLinkIndex(tasks, nb, text);
  const ms = performance.now() - t0;
  assert.ok(backlinksFor(ix, "Sayfa1").tasks.length > 0);
  assert.ok(ms < 50, `beklenen < 50 ms, ölçülen ${ms.toFixed(1)} ms`);
});
