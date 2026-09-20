/* src/core/projections.js — görünümlerin saf izdüşümleri.
   Notion yasası: hiçbir görünüm veriye sahip değil. Bu dosya o yasanın
   uygulanabilir hâli; hepsi girdi→çıktı, DOM yok. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const { listGroups, boardGroups, monthGrid, tasksByDate, BOARD_COLUMNS } =
  load(["core/util.js", "core/sort.js", "core/projections.js"],
       ["listGroups", "boardGroups", "monthGrid", "tasksByDate", "BOARD_COLUMNS"]);

const T = "2026-05-10";
let n = 0;
const mk = o => Object.assign({
  id: "t" + (++n), title: "g" + n, done: false, dueDate: null, priority: "med",
  tags: [], subtasks: [], createdAt: "2026-01-0" + ((n % 9) + 1) + "T00:00:00.000Z",
}, o);

test("listGroups: boş kova döndürmez, sıra BUCKETS'a uyar", () => {
  const g = plain(listGroups([
    mk({ dueDate: "2026-05-01" }), mk({ dueDate: "2026-05-10" }), mk({ done: true }),
  ], T));
  assert.deepEqual(g.map(x => x.key), ["overdue", "today", "completed"]);
  assert.ok(g.every(x => x.items.length > 0));
});

test("listGroups: boş girdi boş dizi", () => assert.deepEqual(plain(listGroups([], T)), []));

test("boardGroups: üç öncelik sütunu HER ZAMAN var (boş olsa bile)", () => {
  const g = plain(boardGroups([mk({ priority: "high" })]));
  assert.deepEqual(g.map(x => x.key), ["high", "med", "low"]);
  assert.equal(g[0].items.length, 1);
  assert.equal(g[1].items.length, 0, "boş sütun kaybolmaz — pano sütunları sabittir");
});

test("boardGroups: tamamlananlar ayrı sütuna düşer, önceliğe göre dağılmaz", () => {
  const g = plain(boardGroups([
    mk({ priority: "high", done: true }), mk({ priority: "low" }),
  ]));
  assert.deepEqual(g.map(x => x.key), ["high", "med", "low", "completed"]);
  assert.equal(g[0].items.length, 0, "tamamlanmış yüksek öncelikli görev high sütununda DEĞİL");
  assert.equal(g[3].items.length, 1);
});

test("boardGroups: tamamlanan yoksa o sütun hiç çizilmez", () => {
  assert.equal(plain(boardGroups([mk({})])).length, 3);
});

test("boardGroups: bilinmeyen öncelik orta sütuna düşer, kaybolmaz", () => {
  const g = plain(boardGroups([mk({ priority: "uydurma" })]));
  const total = g.reduce((a, c) => a + c.items.length, 0);
  assert.equal(total, 1, "görev hiçbir sütunda yoksa kullanıcı onu kaybeder");
  assert.equal(g[1].items.length, 1);
});

test("monthGrid: her zaman tam haftalar", () => {
  for (let m = 0; m < 12; m++){
    for (const ws of [0, 1]){
      const w = plain(monthGrid(2026, m, ws));
      assert.ok(w.every(row => row.length === 7), `2026-${m} ws=${ws}`);
    }
  }
});

test("monthGrid: hafta başlangıcı dile göre çalışır", () => {
  const pzt = plain(monthGrid(2026, 4, 1))[0][0];   // Mayıs 2026, pazartesi başlangıç
  const paz = plain(monthGrid(2026, 4, 0))[0][0];   // pazar başlangıç
  assert.equal(new Date(pzt.ymd + "T12:00:00").getDay(), 1);
  assert.equal(new Date(paz.ymd + "T12:00:00").getDay(), 0);
});

test("monthGrid: ayın her günü TAM BİR KEZ geçer", () => {
  for (let m = 0; m < 12; m++){
    const days = plain(monthGrid(2026, m, 1)).flat().filter(c => c.inMonth).map(c => c.ymd);
    const expected = new Date(2026, m + 1, 0).getDate();
    assert.equal(days.length, expected, `ay ${m + 1}: gün sayısı`);
    assert.equal(new Set(days).size, expected, `ay ${m + 1}: yinelenen gün yok`);
  }
});

test("monthGrid: DST geçiş ayları gün yinelemez, atlamaz", () => {
  // Avrupa: mart son pazar ileri, ekim son pazar geri.
  for (const [y, m] of [[2026, 2], [2026, 9], [2027, 2], [2027, 9], [2025, 2], [2025, 9]]){
    const days = plain(monthGrid(y, m, 1)).flat().filter(c => c.inMonth).map(c => c.ymd);
    const expected = new Date(y, m + 1, 0).getDate();
    assert.equal(days.length, expected, `${y}-${m + 1} gün sayısı`);
    assert.equal(new Set(days).size, expected, `${y}-${m + 1} yinelenen gün`);
  }
});

test("monthGrid: artık yıl şubatı", () => {
  const d2028 = plain(monthGrid(2028, 1, 1)).flat().filter(c => c.inMonth);
  assert.equal(d2028.length, 29);
  const d2026 = plain(monthGrid(2026, 1, 1)).flat().filter(c => c.inMonth);
  assert.equal(d2026.length, 28);
});

test("monthGrid: hücreler kesintisiz ardışık günler", () => {
  const cells = plain(monthGrid(2026, 2, 1)).flat();
  for (let i = 1; i < cells.length; i++){
    const a = new Date(cells[i - 1].ymd + "T12:00:00"), b = new Date(cells[i].ymd + "T12:00:00");
    assert.equal(Math.round((b - a) / 86400000), 1, `${cells[i - 1].ymd} → ${cells[i].ymd}`);
  }
});

test("monthGrid: yıl sınırı", () => {
  const ara = plain(monthGrid(2026, 11, 1)).flat();
  assert.ok(ara.some(c => c.ymd.startsWith("2027-01")), "aralık ızgarası ocağa taşar");
  const oca = plain(monthGrid(2026, 0, 1)).flat();
  assert.ok(oca.some(c => c.ymd.startsWith("2025-12")), "ocak ızgarası aralıktan başlar");
});

test("tasksByDate: tarihsizler GİZLENMEZ, ayrı döner", () => {
  const r = plain(tasksByDate([
    mk({ dueDate: "2026-05-10" }), mk({ dueDate: "2026-05-10" }), mk({}),
  ]));
  assert.equal(r.undated.length, 1, "takvimde görünmeyen görev kaybolmuş görevdir");
  assert.equal(Object.keys(r.map).length, 0, "Map plain() ile düz nesneye dönmez");
});

test("tasksByDate: aynı günün görevleri sıralı", () => {
  const hi = mk({ dueDate: "2026-05-10", priority: "high" });
  const lo = mk({ dueDate: "2026-05-10", priority: "low" });
  const r = tasksByDate([lo, hi]);
  assert.deepEqual(plain(r.map.get("2026-05-10")).map(x => x.priority), ["high", "low"]);
});
