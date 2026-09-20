#!/usr/bin/env node
/* İki dil eşit olmalı. Tek dilde kalmış bir anahtar, diğer dilde ham anahtar
   adının ekrana basılması demektir — sessiz ve çirkin bir hata. */
import { load } from "../tests/_load.mjs";

const { I18N } = load(["i18n/strings.js"], ["I18N"]);
const langs = Object.keys(I18N);
if (langs.length < 2){ console.error("check-i18n: en az iki dil bekleniyordu"); process.exit(1); }

const keysOf = l => new Set(Object.keys(I18N[l]));
const [a, b] = langs;
const ka = keysOf(a), kb = keysOf(b);
const onlyA = [...ka].filter(k => !kb.has(k));
const onlyB = [...kb].filter(k => !ka.has(k));

if (onlyA.length || onlyB.length){
  if (onlyA.length) console.error(`check-i18n: yalnız "${a}" içinde: ${onlyA.join(", ")}`);
  if (onlyB.length) console.error(`check-i18n: yalnız "${b}" içinde: ${onlyB.join(", ")}`);
  process.exit(1);
}
console.log(`check-i18n: ${langs.join("/")} eşit (${ka.size} anahtar)`);
