/* src/core/parse-capture.js — doğal dille yakalama.
   Ayrıştırıcının iki sözü var ve ikisi de burada sınanıyor:
   TAHMİN YOK (emin olunmayana dokunulmaz) ve SESSİZ KAYIP YOK. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const { parseCapture } = load(["core/util.js", "core/parse-capture.js"], ["parseCapture"]);

const T = "2026-05-10";                       // pazar
const tr = s => plain(parseCapture(s, { today: T, lang: "tr" }));
const en = s => plain(parseCapture(s, { today: T, lang: "en" }));

test("bugünün gerçekten pazar olduğu (diğer testlerin dayanağı)", () => {
  assert.equal(new Date(2026, 4, 10).getDay(), 0);
});

test("TR — göreli gün sözcükleri", () => {
  assert.equal(tr("bugün rapor").dueDate, "2026-05-10");
  assert.equal(tr("yarın rapor").dueDate, "2026-05-11");
  assert.equal(tr("öbür gün rapor").dueDate, "2026-05-12");
  assert.equal(tr("öbürgün rapor").dueDate, "2026-05-12");
  assert.equal(tr("haftaya rapor").dueDate, "2026-05-17");
  assert.equal(tr("gelecek hafta rapor").dueDate, "2026-05-17");
});

test("TR — sayılı göreli ifadeler", () => {
  assert.equal(tr("3 güne fatura").dueDate, "2026-05-13");
  assert.equal(tr("3 gün sonra fatura").dueDate, "2026-05-13");
  assert.equal(tr("1 güne fatura").dueDate, "2026-05-11");
  assert.equal(tr("2 hafta sonra fatura").dueDate, "2026-05-24");
});

test("TR — hafta günleri, en yakın geliş (bugün dahil)", () => {
  assert.equal(tr("pazar toplantı").dueDate, "2026-05-10", "bugün pazar → bugün");
  assert.equal(tr("pazartesi toplantı").dueDate, "2026-05-11");
  assert.equal(tr("cuma toplantı").dueDate, "2026-05-15");
  assert.equal(tr("cumartesi toplantı").dueDate, "2026-05-16");
  assert.equal(tr("çarşamba toplantı").dueDate, "2026-05-13");
  assert.equal(tr("perşembe toplantı").dueDate, "2026-05-14");
  assert.equal(tr("salı toplantı").dueDate, "2026-05-12");
});

test("TR — ay adı ve sayısal tarih", () => {
  assert.equal(tr("15 mayıs sunum").dueDate, "2026-05-15");
  assert.equal(tr("15 Mayıs 2027 sunum").dueDate, "2027-05-15");
  assert.equal(tr("01.06.2026 sunum").dueDate, "2026-06-01");
  assert.equal(tr("2026-12-31 yılsonu").dueDate, "2026-12-31");
});

test("TR — geçmişte kalan ay/gün gelecek yıla kayar", () => {
  assert.equal(tr("15 mart vergi").dueDate, "2027-03-15", "mart geçti → gelecek yıl");
  assert.equal(tr("15 haziran tatil").dueDate, "2026-06-15", "haziran gelecek → bu yıl");
});

test("TR — ASCII yazımı da tanınır (klavyesiz kullanıcı)", () => {
  assert.equal(tr("yarin rapor").dueDate, "2026-05-11");
  assert.equal(tr("bugun rapor").dueDate, "2026-05-10");
  assert.equal(tr("carsamba toplanti").dueDate, "2026-05-13");
  assert.equal(tr("persembe toplanti").dueDate, "2026-05-14");
});

test("EN — göreli ve mutlak", () => {
  assert.equal(en("today report").dueDate, "2026-05-10");
  assert.equal(en("tomorrow report").dueDate, "2026-05-11");
  assert.equal(en("day after tomorrow report").dueDate, "2026-05-12");
  assert.equal(en("next week report").dueDate, "2026-05-17");
  assert.equal(en("in 3 days invoice").dueDate, "2026-05-13");
  assert.equal(en("in 1 day invoice").dueDate, "2026-05-11");
  assert.equal(en("in 2 weeks invoice").dueDate, "2026-05-24");
});

test("EN — hafta günleri ve aylar, kısaltmalar dahil", () => {
  assert.equal(en("monday standup").dueDate, "2026-05-11");
  assert.equal(en("fri retro").dueDate, "2026-05-15");
  assert.equal(en("sunday rest").dueDate, "2026-05-10");
  assert.equal(en("june 15 holiday").dueDate, "2026-06-15");
  assert.equal(en("jun 15 holiday").dueDate, "2026-06-15");
  assert.equal(en("15 june holiday").dueDate, "2026-06-15");
});

test("öncelik: üç kademe, iki dil, p-kodları", () => {
  assert.equal(tr("rapor !yüksek").priority, "high");
  assert.equal(tr("rapor !yuksek").priority, "high");
  assert.equal(tr("rapor !orta").priority, "med");
  assert.equal(tr("rapor !düşük").priority, "low");
  assert.equal(tr("rapor !p1").priority, "high");
  assert.equal(tr("rapor !p2").priority, "med");
  assert.equal(tr("rapor !p3").priority, "low");
  assert.equal(en("report !high").priority, "high");
  assert.equal(en("report !low").priority, "low");
  assert.equal(en("report !urgent").priority, "high");
});

test("etiket: birden çok, Türkçe harfli, temiz başlık", () => {
  const r = tr("rapor #iş #önemli #proje-x");
  assert.deepEqual(r.tags, ["iş", "önemli", "proje-x"]);
  assert.equal(r.title, "rapor");
});

test("tam cümle: tarih + öncelik + etiket birlikte", () => {
  const r = tr("yarın rapor yaz !yüksek #iş");
  assert.equal(r.title, "rapor yaz");
  assert.equal(r.dueDate, "2026-05-11");
  assert.equal(r.priority, "high");
  assert.deepEqual(r.tags, ["iş"]);
});

test("SPEC S7: 'yarın 15:00 !yüksek #iş' → doğru tarih/öncelik/etiket", () => {
  const r = tr("yarın 15:00 toplantı !yüksek #iş");
  assert.equal(r.dueDate, "2026-05-11");
  assert.equal(r.priority, "high");
  assert.deepEqual(r.tags, ["iş"]);
});

test("SESSİZ KAYIP YOK: saat uygulanamaz, raporlanır ve başlıkta kalır", () => {
  const r = tr("yarın 15:00 toplantı");
  assert.equal(r.unsupported.length, 1);
  assert.equal(r.unsupported[0].kind, "time");
  assert.equal(r.unsupported[0].text, "15:00");
  assert.ok(r.title.includes("15:00"), "saat başlıktan sessizce silinmemeli");
});

test("TAHMİN YOK: tanınmayan girdi hiç değiştirilmez", () => {
  const r = tr("sadece düz bir görev metni");
  assert.equal(r.title, "sadece düz bir görev metni");
  assert.equal(r.dueDate, null);
  assert.equal(r.priority, null);
  assert.deepEqual(r.tags, []);
});

test("TAHMİN YOK: tarih sözcüğü başka kelimenin içindeyse dokunulmaz", () => {
  assert.equal(tr("bugünkü gazeteyi al").dueDate, null);
  assert.equal(tr("bugünkü gazeteyi al").title, "bugünkü gazeteyi al");
  assert.equal(tr("3 martı kutla").dueDate, null, "'martı' ay adı değildir");
  assert.equal(en("mondays are hard").dueDate, null);
});

test("TAHMİN YOK: olmayan takvim günü tarih üretmez", () => {
  assert.equal(tr("31 şubat rapor").dueDate, null);
  assert.equal(tr("32 mayıs rapor").dueDate, null);
  assert.equal(tr("31.02.2026 rapor").dueDate, null);
});

test("TAHMİN YOK: bugün verilmezse tarih üretilmez, metin bozulmaz", () => {
  const r = plain(parseCapture("yarın rapor", { lang: "tr" }));
  assert.equal(r.dueDate, null);
  assert.equal(r.title, "yarın rapor");
});

test("bir görevin tek son tarihi vardır — METİNDE ilk gelen kazanır", () => {
  const r = tr("yarın bugün rapor");
  assert.equal(r.dueDate, "2026-05-11", "kural sırası değil, metindeki sıra");
  const dates = r.matches.filter(m => m.kind === "date");
  assert.equal(dates.filter(m => m.applied).length, 1, "tek tarih uygulanır");
  assert.equal(dates.length, 2, "yok sayılan tarih de raporlanır, sessizce kaybolmaz");
  assert.equal(r.title, "rapor", "ikisi de başlıktan çıkar — yoksa sabit nokta bozulur");
});

test("en uzun eşleşme kazanır: 'day after tomorrow' içindeki 'tomorrow' yutulmaz", () => {
  const r = en("day after tomorrow report");
  assert.equal(r.dueDate, "2026-05-12");
  assert.equal(r.title, "report");
});

test("fazladan öncelik de raporlanır", () => {
  const r = tr("rapor !p1 !p3");
  assert.equal(r.priority, "high");
  const prios = r.matches.filter(m => m.kind === "priority");
  assert.equal(prios.filter(m => m.applied).length, 1);
  assert.equal(prios.length, 2);
});

test("SABİT NOKTA: ayrıştırıcı kendi çıktısına uygulandığında değişmez", () => {
  const cases = [
    "yarın 15:00 rapor yaz !yüksek #iş", "haftaya sunum #proje", "3 güne fatura öde",
    "sadece düz metin", "bugün yarın iki tarih", "rapor !p1 !p3 #a #b", "",
  ];
  for (const c of cases){
    const once = tr(c);
    const twice = tr(once.title);
    assert.equal(twice.title, once.title, `kararsız: ${JSON.stringify(c)}`);
  }
});

test("sınır girdileri çökertmez", () => {
  for (const bad of [null, undefined, 123, {}, []]){
    const r = plain(parseCapture(bad, { today: T, lang: "tr" }));
    assert.equal(r.title, "");
    assert.equal(r.dueDate, null);
  }
  assert.equal(plain(parseCapture("rapor")).title, "rapor", "opts olmadan da çalışmalı");
  assert.equal(tr("   ").title, "");
});

test("başlık boşlukları toplanır, kırpılır", () => {
  assert.equal(tr("yarın    rapor   yaz").title, "rapor yaz");
  assert.equal(tr("#iş rapor").title, "rapor");
  assert.equal(tr("rapor #iş").title, "rapor");
});

test("matches: arayüzün çip çizebilmesi için ham metin de dönüyor", () => {
  const r = tr("yarın rapor !yüksek #iş");
  const kinds = r.matches.map(m => m.kind).sort();
  assert.deepEqual(kinds, ["date", "priority", "tag"]);
  assert.equal(r.matches.find(m => m.kind === "date").text, "yarın");
  assert.equal(r.matches.find(m => m.kind === "priority").text, "!yüksek");
  assert.equal(r.matches.find(m => m.kind === "tag").text, "#iş");
});

test("ay sonu taşması: 31 Ocak + 1 ay diye bir kural YOK, doğrudan tarih var", () => {
  assert.equal(tr("31 ocak rapor").dueDate, "2027-01-31");
  assert.equal(tr("29 şubat 2028 artık gün").dueDate, "2028-02-29");
  assert.equal(tr("29 şubat 2027 yok böyle gün").dueDate, null);
});

test("ignore: reddedilen eşleşme uygulanmaz ve metin YERİNDE kalır", () => {
  const raw = "yarın rapor yaz !yüksek #iş";
  const r = plain(parseCapture(raw, { today: T, lang: "tr", ignore: ["yarın"] }));
  assert.equal(r.dueDate, null, "reddedilen tarih uygulanmaz");
  assert.equal(r.title, "yarın rapor yaz", "metin özgün konumunda kalır");
  assert.equal(r.priority, "high", "diğer eşleşmeler etkilenmez");
  assert.deepEqual(r.tags, ["iş"]);
});

test("ignore: her tür reddedilebilir", () => {
  const raw = "yarın rapor !p1 #iş";
  assert.equal(plain(parseCapture(raw, { today: T, lang: "tr", ignore: ["!p1"] })).priority, null);
  assert.deepEqual(plain(parseCapture(raw, { today: T, lang: "tr", ignore: ["#iş"] })).tags, []);
  const all = plain(parseCapture(raw, { today: T, lang: "tr", ignore: ["yarın", "!p1", "#iş"] }));
  assert.equal(all.title, raw, "hepsi reddedilince girdi hiç dokunulmamış olur");
});

test("ignore: tanınmayan metin verilmesi zararsızdır", () => {
  const r = plain(parseCapture("yarın rapor", { today: T, lang: "tr", ignore: ["olmayan"] }));
  assert.equal(r.dueDate, "2026-05-11");
});

test("matches metindeki sırayla döner (çipler soldan sağa okunsun)", () => {
  const r = tr("yarın rapor yaz !p1 #iş");
  assert.deepEqual(r.matches.map(m => m.kind), ["date", "priority", "tag"]);
  const r2 = tr("#iş !p1 rapor yarın");
  assert.deepEqual(r2.matches.map(m => m.kind), ["tag", "priority", "date"]);
  for (const m of r.matches) assert.equal(typeof m.start, "number");
});
