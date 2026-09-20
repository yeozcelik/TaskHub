/* src/core/list-diff.js — anahtarlı liste uzlaştırma.
   En değerli test en alttaki: rastgele üretilmiş binlerce durumda yamayı
   GERÇEKTEN uygulayıp sonucun hedef listeye eşit olduğunu doğrular. Tek tek
   senaryo yazmak benim hayal gücümle sınırlı; rastgele arama değil. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const { diffChildren, diffList } = load(["core/list-diff.js"], ["diffChildren", "diffList"]);

/** Yamayı bir diziye uygular. DOM'un yapacağının birebir aynısı:
 *  taşınan/eklenen düğüm önce koparılır, sonra `before`ın önüne konur. */
function applyOps(oldKeys, ops){
  let a = oldKeys.slice();
  for (const op of ops){
    if (op.type === "update") continue;
    a = a.filter(k => k !== op.key);
    if (op.type === "remove") continue;
    if (op.before === null) a.push(op.key);
    else {
      const at = a.indexOf(op.before);
      assert.notEqual(at, -1, `before anahtarı listede yok: ${op.before}`);
      a.splice(at, 0, op.key);
    }
  }
  return a;
}

const count = (ops, type) => ops.filter(o => o.type === type).length;

test("aynı liste → boş yama", () => {
  assert.deepEqual(plain(diffChildren(["a", "b", "c"], ["a", "b", "c"])), []);
});

test("boş → boş", () => assert.deepEqual(plain(diffChildren([], [])), []));

test("boş → dolu: hepsi insert, uygulanınca hedefe eşit", () => {
  const ops = diffChildren([], ["a", "b", "c"]);
  assert.equal(count(ops, "insert"), 3);
  assert.equal(count(ops, "move"), 0);
  assert.deepEqual(applyOps([], ops), ["a", "b", "c"]);
});

test("dolu → boş: hepsi remove", () => {
  const ops = diffChildren(["a", "b", "c"], []);
  assert.equal(count(ops, "remove"), 3);
  assert.deepEqual(applyOps(["a", "b", "c"], ops), []);
});

test("sona ekleme tek işlem, before null", () => {
  const ops = diffChildren(["a", "b"], ["a", "b", "c"]);
  assert.equal(ops.length, 1);
  assert.deepEqual(plain(ops[0]), { type: "insert", key: "c", before: null });
});

test("başa ekleme tek işlem, mevcutlar taşınmaz", () => {
  const ops = diffChildren(["a", "b"], ["z", "a", "b"]);
  assert.equal(ops.length, 1);
  assert.deepEqual(plain(ops[0]), { type: "insert", key: "z", before: "a" });
  assert.equal(count(ops, "move"), 0, "var olan kartlar yerinden oynamamalı");
});

test("ortadan silme tek işlem", () => {
  const ops = diffChildren(["a", "b", "c"], ["a", "c"]);
  assert.deepEqual(plain(ops), [{ type: "remove", key: "b" }]);
});

test("tam ters çevirme: taşıma sayısı en az (n-1)", () => {
  const oldK = ["a", "b", "c", "d"], newK = ["d", "c", "b", "a"];
  const ops = diffChildren(oldK, newK);
  assert.equal(count(ops, "move"), 3);     // |LIS| = 1 → 4-1 = 3
  assert.deepEqual(applyOps(oldK, ops), newK);
});

test("1.000 elemanda tek taşıma → yama ≤ 3 işlem", () => {
  const oldK = Array.from({ length: 1000 }, (_, i) => "k" + i);
  const newK = oldK.slice();
  newK.unshift(newK.splice(500, 1)[0]);       // 500. eleman başa
  const ops = diffChildren(oldK, newK);
  assert.ok(ops.length <= 3, `beklenen ≤3, gelen ${ops.length}`);
  assert.deepEqual(applyOps(oldK, ops), newK);
});

test("5.000 elemanda sondan başa taşıma da O(değişen) kalır", () => {
  const oldK = Array.from({ length: 5000 }, (_, i) => "k" + i);
  const newK = oldK.slice();
  newK.unshift(newK.pop());
  const ops = diffChildren(oldK, newK);
  assert.ok(ops.length <= 3, `beklenen ≤3, gelen ${ops.length}`);
  assert.deepEqual(applyOps(oldK, ops), newK);
});

test("yinelenen anahtar sessizce bozmaz, hata verir", () => {
  assert.throws(() => diffChildren(["a", "a"], ["a"]), /yinelenen anahtar: a/);
  assert.throws(() => diffChildren(["a"], ["a", "a"]), /yinelenen anahtar: a/);
});

test("diffList: yalnız değişen eleman update alır", () => {
  const eq = (x, y) => x.v === y.v;
  const key = x => x.id;
  const oldI = [{ id: "a", v: 1 }, { id: "b", v: 1 }, { id: "c", v: 1 }];
  const newI = [{ id: "a", v: 1 }, { id: "b", v: 2 }, { id: "c", v: 1 }];
  const ops = diffList(oldI, newI, key, eq);
  assert.deepEqual(plain(ops), [{ type: "update", key: "b", item: { id: "b", v: 2 } }]);
});

test("diffList: taşınmak ve değişmek bağımsızdır", () => {
  const eq = (x, y) => x.v === y.v;
  const key = x => x.id;
  const oldI = [{ id: "a", v: 1 }, { id: "b", v: 1 }];
  const newI = [{ id: "b", v: 9 }, { id: "a", v: 1 }];
  const ops = diffList(oldI, newI, key, eq);
  assert.equal(count(ops, "move"), 1);
  assert.equal(count(ops, "update"), 1);
  assert.equal(ops.find(o => o.type === "update").key, "b");
});

test("diffList: yeni eleman update almaz (insert zaten taşıyor)", () => {
  const ops = diffList([], [{ id: "a", v: 1 }], x => x.id, () => false);
  assert.equal(count(ops, "update"), 0);
  assert.equal(count(ops, "insert"), 1);
});

test("ÖZELLİK: rastgele 3.000 durumda yama hedefi tam olarak üretir", () => {
  // Tohumlu üretici — başarısızlık yeniden üretilebilsin diye.
  let seed = 0x2f6e2b1;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = n => Math.floor(rnd() * n);

  for (let t = 0; t < 3000; t++){
    const alphabet = Array.from({ length: 1 + pick(14) }, (_, i) => "k" + i);
    const subset = () => {
      const s = alphabet.filter(() => rnd() < 0.7);
      for (let i = s.length - 1; i > 0; i--){ const j = pick(i + 1); [s[i], s[j]] = [s[j], s[i]]; }
      return s;
    };
    const oldK = subset(), newK = subset();
    const ops = diffChildren(oldK, newK);
    assert.deepEqual(applyOps(oldK, ops), newK,
      `durum ${t}\n  eski: ${JSON.stringify(oldK)}\n  yeni: ${JSON.stringify(newK)}\n  yama: ${JSON.stringify(ops)}`);
    // Yapısal işlem sayısı hiçbir zaman "hepsini baştan kur"dan kötü olamaz.
    assert.ok(count(ops, "move") + count(ops, "insert") <= newK.length);
  }
});
