/* src/core/recurrence.js — tekrar kuralları.
   İki söz: desteklenmeyen kural SESSİZCE YANLIŞ YORUMLANMAZ, ve ilerlemeyen
   bir kural sonsuza kadar dönmez — hata verir. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const { normalizeRule, nextOccurrence, describeRule, weekStartOf, monthlyAt, firstOccurrence } =
  load(["core/util.js", "core/recurrence.js"],
       ["normalizeRule", "nextOccurrence", "describeRule", "weekStartOf", "monthlyAt", "firstOccurrence"]);

const R = (o) => Object.assign({ freq: "daily", interval: 1, anchor: "2026-05-10" }, o);

/* ------------------------------- doğrulama ------------------------------ */

test("normalizeRule: geçerli kural oturur", () => {
  assert.deepEqual(plain(normalizeRule(R({}))),
    { freq: "daily", interval: 1, byDay: null, anchor: "2026-05-10" });
});

test("normalizeRule: çöp ve bilinmeyen frekans reddedilir", () => {
  for (const bad of [null, undefined, 5, "daily", [], {}, R({ freq: "yearly" }), R({ freq: "" })])
    assert.equal(normalizeRule(bad), null);
});

test("normalizeRule: ilerlemeyen aralık reddedilir (sonsuz döngü olurdu)", () => {
  for (const n of [0, -1, -12, 0.5, NaN, Infinity, null, undefined, "abc", {}])
    assert.equal(normalizeRule(R({ interval: n })), null, "interval=" + JSON.stringify(n));
  assert.ok(normalizeRule(R({ interval: 365 })));
  assert.equal(normalizeRule(R({ interval: 366 })), null, "üst sınır var");
  // Sayısal dize BELİRSİZ DEĞİL: JSON'dan gelen "3" reddedilmez, sayıya çevrilir.
  assert.equal(plain(normalizeRule(R({ interval: "3" }))).interval, 3);
});

test("normalizeRule: bozuk çapa reddedilir", () => {
  for (const a of [null, "", "14/02/2026", "olmaz", 20260510])
    assert.equal(normalizeRule(R({ anchor: a })), null);
});

test("normalizeRule: byDay temizlenir, bozuğu kuralın tamamını düşürür", () => {
  assert.deepEqual(plain(normalizeRule(R({ freq: "weekly", byDay: [3, 1, 1, 5] }))).byDay, [1, 3, 5]);
  assert.deepEqual(plain(normalizeRule(R({ freq: "weekly", byDay: [] }))).byDay, null);
  for (const bad of [[7], [-1], [1.5], ["pzt"], [null]])
    assert.equal(normalizeRule(R({ freq: "weekly", byDay: bad })), null, JSON.stringify(bad));
});

test("SESSİZCE YORUMLAMA YOK: byDay yanlış frekansta verilirse kural düşer", () => {
  // Kullanıcı bir şey kastetmiş ve biz onu uygulamıyoruz. Yok saymak, yanlış
  // bir tekrar takvimi üretip sessizce yaşatmak demek olurdu.
  assert.equal(normalizeRule(R({ freq: "daily", byDay: [1] })), null);
  assert.equal(normalizeRule(R({ freq: "monthly", byDay: [1] })), null);
  assert.ok(normalizeRule(R({ freq: "daily", byDay: [] })), "boş dizi zararsız");
});

/* --------------------------------- günlük ------------------------------- */

test("günlük: aralık 1", () => {
  assert.equal(nextOccurrence(R({}), "2026-05-10"), "2026-05-11");
  assert.equal(nextOccurrence(R({}), "2026-05-11"), "2026-05-12");
});

test("günlük: aralık n, çapadan sayılır (sürüklenme yok)", () => {
  const r = R({ interval: 3 });
  assert.equal(nextOccurrence(r, "2026-05-10"), "2026-05-13");
  assert.equal(nextOccurrence(r, "2026-05-13"), "2026-05-16");
  assert.equal(nextOccurrence(r, "2026-05-14"), "2026-05-16", "aradaki gün seriye uymaz");
  assert.equal(nextOccurrence(r, "2026-05-15"), "2026-05-16");
});

test("günlük: ay ve yıl sınırı", () => {
  assert.equal(nextOccurrence(R({ anchor: "2026-01-31" }), "2026-01-31"), "2026-02-01");
  assert.equal(nextOccurrence(R({ anchor: "2026-12-31" }), "2026-12-31"), "2027-01-01");
});

test("günlük: DST geçişi günü yinelemez, atlamaz", () => {
  // Avrupa: 2026-03-29 ileri, 2026-10-25 geri.
  assert.equal(nextOccurrence(R({ anchor: "2026-03-28" }), "2026-03-28"), "2026-03-29");
  assert.equal(nextOccurrence(R({ anchor: "2026-03-28" }), "2026-03-29"), "2026-03-30");
  assert.equal(nextOccurrence(R({ anchor: "2026-10-24" }), "2026-10-24"), "2026-10-25");
  assert.equal(nextOccurrence(R({ anchor: "2026-10-24" }), "2026-10-25"), "2026-10-26");
  // 7 günlük adım DST haftasında da tam 7 gün olmalı
  assert.equal(nextOccurrence(R({ interval: 7, anchor: "2026-03-25" }), "2026-03-25"), "2026-04-01");
  assert.equal(nextOccurrence(R({ interval: 7, anchor: "2026-10-21" }), "2026-10-21"), "2026-10-28");
});

/* -------------------------------- haftalık ------------------------------ */

test("haftalık: byDay yoksa çapanın günü", () => {
  // 2026-05-10 pazar
  const r = R({ freq: "weekly" });
  assert.equal(nextOccurrence(r, "2026-05-10"), "2026-05-17");
  assert.equal(nextOccurrence(r, "2026-05-12"), "2026-05-17");
});

test("haftalık: birden çok gün", () => {
  const r = R({ freq: "weekly", byDay: [1, 3], anchor: "2026-05-11" });   // pzt, çar
  assert.equal(nextOccurrence(r, "2026-05-11"), "2026-05-13");
  assert.equal(nextOccurrence(r, "2026-05-13"), "2026-05-18");
  assert.equal(nextOccurrence(r, "2026-05-14"), "2026-05-18");
});

test("haftalık: aralık 2 — ara hafta atlanır", () => {
  const r = R({ freq: "weekly", interval: 2, byDay: [1], anchor: "2026-05-11" });
  assert.equal(nextOccurrence(r, "2026-05-11"), "2026-05-25");
  assert.equal(nextOccurrence(r, "2026-05-25"), "2026-06-08");
  assert.equal(nextOccurrence(r, "2026-05-18"), "2026-05-25", "ara haftadan bakınca da doğru");
});

test("haftalık: aralık ISO haftasına göre, dile göre DEĞİL", () => {
  // Kural veridir: kullanıcı dili değiştirince tekrar takvimi kaymamalı.
  assert.equal(weekStartOf("2026-05-10"), "2026-05-04", "pazar → o haftanın pazartesisi");
  assert.equal(weekStartOf("2026-05-11"), "2026-05-11", "pazartesi kendisi");
});

test("haftalık: yıl sınırını geçer", () => {
  const r = R({ freq: "weekly", byDay: [4], anchor: "2026-12-24" });      // perşembe
  assert.equal(nextOccurrence(r, "2026-12-31"), "2027-01-07");
});

/* --------------------------------- aylık -------------------------------- */

test("aylık: normal ay", () => {
  const r = R({ freq: "monthly", anchor: "2026-05-15" });
  assert.equal(nextOccurrence(r, "2026-05-15"), "2026-06-15");
  assert.equal(nextOccurrence(r, "2026-06-20"), "2026-07-15");
});

test("AY SONU: 31 Ocak + 1 ay = 28 Şubat, Mart'a KAYMAZ", () => {
  const r = R({ freq: "monthly", anchor: "2026-01-31" });
  assert.equal(nextOccurrence(r, "2026-01-31"), "2026-02-28");
  assert.equal(nextOccurrence(r, "2028-01-31"), "2028-02-29", "artık yılda 29");
});

test("AY SONU: kırpma ÇAPAYI bozmaz — 31'i geri gelir", () => {
  // Kırpılmış sonuçtan zincirlemek 28 Mart verirdi ve "31'i" kalıcı kaybolurdu.
  const r = R({ freq: "monthly", anchor: "2026-01-31" });
  assert.equal(nextOccurrence(r, "2026-02-28"), "2026-03-31");
  assert.equal(nextOccurrence(r, "2026-03-31"), "2026-04-30", "nisan 30 çeker");
  assert.equal(nextOccurrence(r, "2026-04-30"), "2026-05-31", "mayısta yine 31");
});

test("AY SONU: 30'u da kırpılır ama geri gelir", () => {
  const r = R({ freq: "monthly", anchor: "2026-01-30" });
  assert.equal(nextOccurrence(r, "2026-01-30"), "2026-02-28");
  assert.equal(nextOccurrence(r, "2026-02-28"), "2026-03-30");
});

test("aylık: aralık n ve yıl sınırı", () => {
  const r = R({ freq: "monthly", interval: 3, anchor: "2026-11-15" });
  assert.equal(nextOccurrence(r, "2026-11-15"), "2027-02-15");
  assert.equal(nextOccurrence(r, "2027-02-15"), "2027-05-15");
});

test("monthlyAt: kırpma doğrudan sınanır", () => {
  assert.equal(monthlyAt("2026-01-31", 1, 1), "2026-02-28");
  assert.equal(monthlyAt("2026-01-31", 2, 1), "2026-03-31");
  assert.equal(monthlyAt("2028-01-31", 1, 1), "2028-02-29");
  assert.equal(monthlyAt("2026-01-15", 12, 1), "2027-01-15");
});

/* ------------------------------ genel kurallar -------------------------- */

test("seri başlamadıysa ilk tekrar çapanın kendisidir", () => {
  const r = R({ anchor: "2026-06-01" });
  assert.equal(nextOccurrence(r, "2026-05-10"), "2026-06-01");
});

test("HER SONUÇ from'dan KESİNLİKLE SONRA — 500 rastgele durumda", () => {
  let seed = 0x51f3a7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = a => a[Math.floor(rnd() * a.length)];
  for (let i = 0; i < 500; i++){
    const freq = pick(["daily", "weekly", "monthly"]);
    const rule = {
      freq, interval: 1 + Math.floor(rnd() * 6),
      anchor: "2026-0" + (1 + Math.floor(rnd() * 9)) + "-" + String(1 + Math.floor(rnd() * 28)).padStart(2, "0"),
      byDay: freq === "weekly" && rnd() < 0.5 ? [Math.floor(rnd() * 7)] : undefined,
    };
    const from = "2026-0" + (1 + Math.floor(rnd() * 9)) + "-" + String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
    const out = nextOccurrence(rule, from);
    assert.ok(out, `null döndü: ${JSON.stringify(rule)} from=${from}`);
    assert.ok(out > from, `ilerlemedi: ${JSON.stringify(rule)} from=${from} → ${out}`);
  }
});

test("sınır girdileri: bozuk from null döner, çökertmez", () => {
  assert.equal(nextOccurrence(R({}), "olmaz"), null);
  assert.equal(nextOccurrence(R({}), null), null);
  assert.equal(nextOccurrence(null, "2026-05-10"), null);
});

test("describeRule: metin değil, i18n anahtarı döner", () => {
  assert.deepEqual(plain(describeRule(R({}))), { key: "rec_daily", interval: 1, days: null });
  assert.deepEqual(plain(describeRule(R({ freq: "weekly", byDay: [1, 5] }))),
    { key: "rec_weekly_days", interval: 1, days: [1, 5] });
  assert.deepEqual(plain(describeRule(R({ freq: "monthly", interval: 2 }))),
    { key: "rec_monthly", interval: 2, days: null });
  assert.equal(describeRule({ freq: "yearly" }), null);
});

test("ÇAPA KURALA UYMAYABİLİR: salı kurulan 'her pazartesi' salıyı döndürmez", () => {
  // 2026-05-12 salı. Kural pazartesi. Seri 2026-05-18'de (pazartesi) başlamalı.
  const r = { freq: "weekly", interval: 1, byDay: [1], anchor: "2026-05-12" };
  assert.equal(nextOccurrence(r, "2026-05-01"), "2026-05-18");
  assert.equal(nextOccurrence(r, "2026-05-12"), "2026-05-18");
});

test("günlük/aylıkta çapa tanımı gereği uyar", () => {
  assert.equal(nextOccurrence(R({ anchor: "2026-06-01" }), "2026-05-01"), "2026-06-01");
  assert.equal(nextOccurrence(R({ freq: "monthly", anchor: "2026-06-15" }), "2026-05-01"), "2026-06-15");
});

test("firstOccurrence: bugün uyuyorsa BUGÜN, uymuyorsa ilk uyan gün", () => {
  // 2026-05-11 pazartesi
  assert.equal(firstOccurrence({ freq: "weekly", interval: 1, byDay: [1], anchor: "2026-05-11" }, "2026-05-11"),
    "2026-05-11", "bugün pazartesiyse bugün");
  assert.equal(firstOccurrence({ freq: "weekly", interval: 1, byDay: [1], anchor: "2026-05-12" }, "2026-05-12"),
    "2026-05-18", "salıysa gelecek pazartesi");
  assert.equal(firstOccurrence(R({ anchor: "2026-05-10" }), "2026-05-10"), "2026-05-10");
  assert.equal(firstOccurrence(null, "2026-05-10"), null);
});
