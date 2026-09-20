/* src/core/util.js + src/core/sort.js — saf çekirdek.
   Bu iddialar tarayıcı gerektirmez; `?test=1` ekranındaki eşdeğerleri
   regresyon ağı olarak orada da durmaya devam eder (SPEC.md, test stratejisi). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";   // plain: vm realm → host (ADR 0002)

const {
  foldTr, clamp, numOr, ymd, parseYmd, daysBetween, bucketOf,
  csvEscape, CSV_DELIM, ts, mergeImport, sortTasks, uid, BUCKETS,
} = load(["core/util.js", "core/sort.js"], [
  "foldTr", "clamp", "numOr", "ymd", "parseYmd", "daysBetween", "bucketOf",
  "csvEscape", "CSV_DELIM", "ts", "mergeImport", "sortTasks", "uid", "BUCKETS",
]);

const T = "2026-05-10";
const mk = o => Object.assign({ id: "x", title: "t", done: false, dueDate: null, priority: "med", createdAt: "2026-01-01T00:00:00.000Z" }, o);

test("foldTr: Türkçe harf katlama", () => {
  assert.equal(foldTr("İstanbul"), "istanbul");
  assert.equal(foldTr("ISTANBUL"), "istanbul");
  assert.equal(foldTr("ıspanak"), "ispanak");
  assert.equal(foldTr("Sıkça Ödeme"), "sikca odeme");
  assert.equal(foldTr("ÇĞİÖŞÜ"), "cgiosu");
  assert.equal(foldTr("çğıöşü"), "cgiosu");
  assert.equal(foldTr(null), "");
  assert.equal(foldTr(undefined), "");
});

test("foldTr: aramanın asıl derdi — I/İ çifti", () => {
  // toLocaleLowerCase("tr") burada YANLIŞ sonuç verirdi: I→ı, İ→i eşlemesi
  // yüzünden "istanbul" araması "İstanbul"u bulamazdı.
  assert.ok(foldTr("İstanbul").includes(foldTr("istanbul")));
  assert.ok(foldTr("Sıkça").includes(foldTr("sık")));
  assert.ok(foldTr("IŞIK").includes(foldTr("ışık")));
});

test("foldTr: sabit nokta — f(f(x)) === f(x)", () => {
  for (const s of ["İstanbul", "ÇĞİÖŞÜ", "Sıkça Ödeme", "", "abc"]) {
    assert.equal(foldTr(foldTr(s)), foldTr(s));
  }
});

test("parseYmd: yerel saat, UTC değil", () => {
  // Date.parse("YYYY-MM-DD") UTC yorumlar ve negatif ofsetli saat dilimlerinde
  // günü bir geri kaydırır. parseYmd bu yüzden var.
  assert.equal(parseYmd("2026-03-01").getDate(), 1);
  assert.equal(parseYmd("2026-03-01").getMonth(), 2);
  assert.equal(parseYmd("2026-03-01").getFullYear(), 2026);
  assert.equal(parseYmd("olmaz"), null);
  assert.equal(parseYmd("14/02/2026"), null);
  assert.equal(parseYmd(""), null);
  assert.equal(parseYmd(null), null);
});

test("ymd ↔ parseYmd gidiş-dönüş", () => {
  for (const s of ["2026-01-01", "2026-02-28", "2026-12-31", "2026-03-29"]) {
    assert.equal(ymd(parseYmd(s)), s);
  }
});

test("daysBetween: sınırlar ve yön", () => {
  assert.equal(daysBetween("2026-05-10", "2026-05-10"), 0);
  assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
  assert.equal(daysBetween("2026-05-10", "2026-05-03"), -7);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);   // Avrupa DST hafta sonu
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);   // DST geri dönüşü
  assert.equal(daysBetween("2024-02-28", "2024-03-01"), 2);   // artık yıl
  assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);   // artık yıl değil
  assert.equal(daysBetween("olmaz", "2026-05-10"), null);
});

test("bucketOf: yedi kova, sınırları dahil", () => {
  assert.equal(bucketOf(mk({ done: true, dueDate: "2020-01-01" }), T), "completed");
  assert.equal(bucketOf(mk({}), T), "nodate");
  assert.equal(bucketOf(mk({ dueDate: "2026-05-09" }), T), "overdue");
  assert.equal(bucketOf(mk({ dueDate: "2026-05-10" }), T), "today");
  assert.equal(bucketOf(mk({ dueDate: "2026-05-11" }), T), "tomorrow");
  assert.equal(bucketOf(mk({ dueDate: "2026-05-12" }), T), "week");
  assert.equal(bucketOf(mk({ dueDate: "2026-05-17" }), T), "week");    // +7, dahil
  assert.equal(bucketOf(mk({ dueDate: "2026-05-18" }), T), "later");   // +8, hariç
  assert.equal(bucketOf(mk({ dueDate: "14/02/2026" }), T), "nodate");
});

test("bucketOf: her sonuç BUCKETS içinde olmalı", () => {
  const cases = ["2026-05-01", "2026-05-10", "2026-05-11", "2026-05-15", "2026-09-09", null, "bozuk"];
  for (const d of cases) assert.ok(BUCKETS.includes(bucketOf(mk({ dueDate: d }), T)));
  assert.ok(BUCKETS.includes(bucketOf(mk({ done: true }), T)));
});

test("csvEscape: Türkçe Excel'in beklediği kaçış", () => {
  assert.equal(csvEscape("merhaba"), "merhaba");
  assert.equal(csvEscape("a;b"), '"a;b"');
  assert.equal(csvEscape('de"me'), '"de""me"');
  assert.equal(csvEscape("a\nb"), '"a\nb"');
  assert.equal(csvEscape("a,b"), "a,b");       // ayırıcı ; olduğu için virgül serbest
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape(undefined), "");
  assert.equal(CSV_DELIM, ";");
});

test("mergeImport: daha yeni sürüm kazanır, girdi bozulmaz", () => {
  const cur = [
    { id: "a", title: "A", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", title: "B", updatedAt: "2026-06-01T00:00:00.000Z" },
  ];
  const inc = [
    { id: "a", title: "yeni A", updatedAt: "2026-06-01T00:00:00.000Z" },
    { id: "b", title: "eski B", updatedAt: "2026-01-01T00:00:00.000Z" },
    { id: "c", title: "C", updatedAt: "2026-06-01T00:00:00.000Z" },
  ];
  const m = mergeImport(cur, inc);
  assert.equal(m.tasks.length, 3);
  assert.equal(m.tasks.find(x => x.id === "a").title, "yeni A");
  assert.equal(m.tasks.find(x => x.id === "b").title, "B");
  assert.equal(m.tasks.find(x => x.id === "c").title, "C");
  assert.deepEqual([m.added, m.updated, m.kept], [1, 1, 1]);
  assert.equal(cur.length, 2, "girdi dizisi değiştirilmemeli");
  assert.equal(cur[0].title, "A", "girdi nesnesi değiştirilmemeli");
});

test("mergeImport: updatedAt yoksa gelen kazanamaz", () => {
  const r = mergeImport(
    [{ id: "x", title: "var", updatedAt: "2026-01-01T00:00:00.000Z" }],
    [{ id: "x", title: "yok" }],
  );
  assert.equal(r.tasks[0].title, "var");
});

test("sortTasks: tarihli önce, sonra öncelik, sonra oluşturma", () => {
  const list = [
    mk({ id: "1", dueDate: null, priority: "high" }),
    mk({ id: "2", dueDate: "2026-05-20", priority: "low" }),
    mk({ id: "3", dueDate: "2026-05-10", priority: "low" }),
    mk({ id: "4", dueDate: "2026-05-10", priority: "high" }),
  ];
  assert.deepEqual(plain(sortTasks(list)).map(t => t.id), ["4", "3", "2", "1"]);
});

test("sortTasks: girdiyi yerinde değiştirmez", () => {
  const list = [mk({ id: "b", dueDate: "2026-05-20" }), mk({ id: "a", dueDate: "2026-05-10" })];
  const before = list.map(t => t.id);
  sortTasks(list);
  assert.deepEqual(plain(list).map(t => t.id), before);
});

test("sortTasks: bilinmeyen öncelik sona düşer, çökmez", () => {
  const list = [
    mk({ id: "bozuk", dueDate: "2026-05-10", priority: "uydurma" }),
    mk({ id: "iyi", dueDate: "2026-05-10", priority: "high" }),
  ];
  assert.deepEqual(plain(sortTasks(list)).map(t => t.id), ["iyi", "bozuk"]);
});

test("clamp / numOr: sınır davranışı", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(11, 0, 10), 10);
  assert.equal(numOr(3, 9), 3);
  assert.equal(numOr("3", 9), 9);
  assert.equal(numOr(NaN, 9), 9);
  assert.equal(numOr(Infinity, 9), 9);
  assert.equal(numOr(undefined, 9), 9);
});

test("ts: bozuk tarih 0 döner, sıralamayı çökertmez", () => {
  assert.equal(ts("olmaz"), 0);
  assert.equal(ts(null), 0);
  assert.equal(ts(undefined), 0);
  assert.ok(ts("2026-01-01T00:00:00.000Z") > 0);
});

test("uid: benzersiz ve boş değil", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) { const u = uid(); assert.ok(u && u.length > 8); seen.add(u); }
  assert.equal(seen.size, 500);
});

test("sortTasks: kararlı — eşit anahtarlarda girdi sırası korunur", () => {
  // Süsle-sırala-soy'a geçerken kararlılık `a.i - b.i` ile AÇIKÇA korundu;
  // motorun kararlılığına güvenmek yerine sözleşme hâline getirildi.
  const same = ["x", "y", "z", "w"].map(id => mk({ id, dueDate: "2026-05-10",
    priority: "med", createdAt: "2026-01-01T00:00:00.000Z" }));
  assert.deepEqual(plain(sortTasks(same)).map(t => t.id), ["x", "y", "z", "w"]);
});

test("sortTasks: paralel dizi yazımı, süs-nesnesi yazımıyla BİREBİR aynı sırayı verir", () => {
  /* Süs nesnelerinden paralel dizilere geçişin davranışı değiştirmediğini
     ÖRNEKLE değil, ÖLÇÜTLE kanıtlar: burada eski yazımın bire bir kopyası
     referans olarak duruyor ve 400 rastgele girdide iki çıktı karşılaştırılıyor.
     Rastgelelik tohumlu, yani başarısızlık yeniden üretilebilir. */
  const PRIO = { high: 0, med: 1, low: 2 };
  const referans = list => {
    const dec = list.map((t, i) => ({
      t, i, hasDue: !!t.dueDate, due: t.dueDate || "",
      prio: Object.prototype.hasOwnProperty.call(PRIO, t.priority) ? PRIO[t.priority] : 3,
      born: Date.parse(t.createdAt) || 0,
    }));
    dec.sort((a, b) => {
      if (a.hasDue !== b.hasDue) return a.hasDue ? -1 : 1;
      if (a.hasDue && a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (a.prio !== b.prio) return a.prio - b.prio;
      if (a.born !== b.born) return a.born - b.born;
      return a.i - b.i;
    });
    return dec.map(d => d.t.id);
  };

  let tohum = 20260920;
  const rnd = n => { tohum = (tohum * 1103515245 + 12345) & 0x7fffffff; return tohum % n; };
  const prios = ["high", "med", "low", "belirsiz"];

  for (let durum = 0; durum < 400; durum++){
    const n = rnd(40);
    const list = Array.from({ length: n }, (_, i) => mk({
      id: "s" + i,
      dueDate: rnd(3) === 0 ? null : "2026-0" + (rnd(9) + 1) + "-" + String(rnd(28) + 1).padStart(2, "0"),
      priority: prios[rnd(4)],
      createdAt: "2026-01-" + String(rnd(28) + 1).padStart(2, "0") + "T00:00:00.000Z",
    }));
    assert.deepEqual(plain(sortTasks(list)).map(t => t.id), referans(list),
      `durum ${durum} (n=${n}) ayrıştı`);
  }
});

test("sortTasks: 5.000 öğe < 20 ms (Date.parse karşılaştırıcıda değil)", () => {
  const big = Array.from({ length: 5000 }, (_, i) => mk({
    id: "b" + i, dueDate: i % 7 ? "2026-05-" + String((i % 28) + 1).padStart(2, "0") : null,
    priority: ["low", "med", "high"][i % 3],
    createdAt: "2026-0" + ((i % 9) + 1) + "-01T00:00:00.000Z",
  }));
  const t0 = performance.now();
  const out = sortTasks(big);
  const ms = performance.now() - t0;
  assert.equal(plain(out).length, 5000);
  assert.ok(ms < 20, `beklenen < 20 ms, ölçülen ${ms.toFixed(1)} ms`);
});
