#!/usr/bin/env node
/* src/core/ saf kalmalı: DOM'a, pencereye, depolamaya dokunamaz.

   Bu kural bir üslup tercihi değil, testedilebilirliğin dayanağıdır. core/
   içindeki her şey `node --test` altında, tarayıcı olmadan koşabiliyor
   (tests/_load.mjs). İlk `document.` çağrısı o özelliği sessizce yok eder. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "core");
const FORBIDDEN = /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|location|alert|fetch)\b/;

let bad = 0;
for (const name of readdirSync(CORE).filter(f => f.endsWith(".js"))){
  const lines = readFileSync(join(CORE, name), "utf8").split("\n");
  lines.forEach((line, i) => {
    if (FORBIDDEN.test(line)){
      console.error(`check-purity: src/core/${name}:${i + 1}  ${line.trim()}`);
      bad++;
    }
  });
}
if (bad){
  console.error(`\ncheck-purity: ${bad} ihlal. src/core/ tarayıcıya dokunamaz.`);
  console.error("Tarayıcıya ihtiyacı olan kod src/html/, src/state/ veya src/ui/ altına aittir.");
  process.exit(1);
}
console.log("check-purity: src/core/ temiz");
