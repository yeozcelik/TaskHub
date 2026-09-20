/* src/core/selection.js — çoklu seçimin saf çekirdeği. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./_load.mjs";

const { rangeBetween, nextSelection, pruneSelection, stepKey } =
  load(["core/selection.js"], ["rangeBetween", "nextSelection", "pruneSelection", "stepKey"]);

const K = ["a", "b", "c", "d", "e"];
const setOf = s => [...s].sort();

test("rangeBetween: yön fark etmez", () => {
  assert.deepEqual(plain(rangeBetween(K, "b", "d")), ["b", "c", "d"]);
  assert.deepEqual(plain(rangeBetween(K, "d", "b")), ["b", "c", "d"], "aşağıdan yukarı aynı küme");
});

test("rangeBetween: tek öğe ve uçlar", () => {
  assert.deepEqual(plain(rangeBetween(K, "c", "c")), ["c"]);
  assert.deepEqual(plain(rangeBetween(K, "a", "e")), K);
});

test("rangeBetween: listede olmayan anahtar boş döner", () => {
  assert.deepEqual(plain(rangeBetween(K, "a", "yok")), []);
  assert.deepEqual(plain(rangeBetween(K, "yok", "a")), []);
  assert.deepEqual(plain(rangeBetween([], "a", "b")), []);
});

test("nextSelection: replace önceki seçimi siler", () => {
  assert.deepEqual(setOf(nextSelection(new Set(["x", "y"]), ["a"], "replace")), ["a"]);
});

test("nextSelection: add ekler, remove çıkarır", () => {
  assert.deepEqual(setOf(nextSelection(new Set(["a"]), ["b", "c"], "add")), ["a", "b", "c"]);
  assert.deepEqual(setOf(nextSelection(new Set(["a", "b"]), ["b"], "remove")), ["a"]);
});

test("nextSelection: toggle her anahtarı ayrı ayrı çevirir", () => {
  assert.deepEqual(setOf(nextSelection(new Set(["a"]), ["a", "b"], "toggle")), ["b"]);
  assert.deepEqual(setOf(nextSelection(new Set(), ["a", "a"], "toggle")), [],
    "aynı anahtar iki kez → eklenir sonra silinir");
});

test("nextSelection: GİRDİ KÜMESİ DEĞİŞTİRİLMEZ", () => {
  const before = new Set(["a", "b"]);
  nextSelection(before, ["c"], "add");
  assert.deepEqual(setOf(before), ["a", "b"]);
});

test("pruneSelection: görünmeyen seçim düşer", () => {
  // "3 görev seçili" yazıp iki tane göstermek, toplu silmeyi görünmeyene uygular.
  assert.deepEqual(setOf(pruneSelection(new Set(["a", "b", "z"]), ["a", "b"])), ["a", "b"]);
  assert.deepEqual(setOf(pruneSelection(new Set(["a"]), [])), []);
  assert.deepEqual(setOf(pruneSelection(new Set(), ["a"])), []);
});

test("stepKey: uçlarda SARMAZ", () => {
  assert.equal(stepKey(K, "a", -1), "a", "başta yukarı basmak başta bırakır");
  assert.equal(stepKey(K, "e", 1), "e", "sonda aşağı basmak sonda bırakır");
  assert.equal(stepKey(K, "b", 1), "c");
  assert.equal(stepKey(K, "b", -1), "a");
});

test("stepKey: odak listede yoksa uca gider", () => {
  assert.equal(stepKey(K, "yok", 1), "a");
  assert.equal(stepKey(K, "yok", -1), "e");
  assert.equal(stepKey([], "a", 1), null);
});
