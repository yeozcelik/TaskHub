#!/usr/bin/env node
/* src/core/ saf kalmalı: DOM'a, pencereye, depolamaya dokunamaz.

   Bu kural bir üslup tercihi değil, testedilebilirliğin dayanağıdır. core/
   içindeki her şey `node --test` altında, tarayıcı olmadan koşabiliyor
   (tests/_load.mjs). İlk `document.` çağrısı o özelliği sessizce yok eder. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");
const CORE = join(SRC, "core");
const FORBIDDEN = /\b(document|window|localStorage|sessionStorage|indexedDB|navigator|location|alert|fetch)\b/;

/* İKİNCİ KURAL: depolamaya dokunmanın tek yeri adaptördür.
   `localStorage` koda dağıldığında IndexedDB'ye geçiş (T3.2) imkânsızlaşır ve
   her çağrı yeri ayrı bir hata yolu açar. Adaptör bu yüzden var; kural onu
   savunur. T3.2 eklendiğinde adapter-idb.js de bu listeye girer. */
const STORAGE_RE = /\b(localStorage|sessionStorage|indexedDB)\b/;
const STORAGE_ALLOWED = new Set(["state/adapter-local.js"]);

/* Yorumları boşlukla değiştirir, SATIR NUMARALARINI korur.
   Gerekçe: bu dosyaların yorumları depolamadan bahsediyor ve bahsetmeleri de
   doğru. Ham metinde arama yapan bir kural, kendi belgelerini ihlal sayar —
   ilk koşumda tam olarak bu oldu, dördü dört yanlış pozitif.
   Dize içeriği KASTEN soyulmuyor: `localStorage` bir dizede geçiyorsa da
   bakmaya değer. */
function stripComments(src){
  let out = "", i = 0, n = src.length;
  while (i < n){
    const c = src[i], d = src[i + 1];
    if (c === "/" && d === "/"){
      while (i < n && src[i] !== "\n"){ out += " "; i++; }
    } else if (c === "/" && d === "*"){
      out += "  "; i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")){ out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
    } else if (c === '"' || c === "'" || c === "`"){
      const q = c; out += c; i++;
      while (i < n && src[i] !== q){
        if (src[i] === "\\"){ out += src[i] + (src[i + 1] || ""); i += 2; continue; }
        out += src[i]; i++;
      }
      out += src[i] || ""; i++;
    } else { out += c; i++; }
  }
  return out;
}

function walk(dir, rel = ""){
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })){
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), r));
    else if (e.name.endsWith(".js")) out.push(r);
  }
  return out;
}

let bad = 0;
for (const name of readdirSync(CORE).filter(f => f.endsWith(".js"))){
  const raw = readFileSync(join(CORE, name), "utf8");
  const code = stripComments(raw).split("\n");
  const shown = raw.split("\n");
  code.forEach((line, i) => {
    if (FORBIDDEN.test(line)){
      console.error(`check-purity: src/core/${name}:${i + 1}  ${shown[i].trim()}`);
      bad++;
    }
  });
}
if (bad){
  console.error(`\ncheck-purity: ${bad} ihlal. src/core/ tarayıcıya dokunamaz.`);
  console.error("Tarayıcıya ihtiyacı olan kod src/html/, src/state/ veya src/ui/ altına aittir.");
  process.exit(1);
}

let leaks = 0;
for (const rel of walk(SRC)){
  if (STORAGE_ALLOWED.has(rel)) continue;
  const raw = readFileSync(join(SRC, rel), "utf8");
  const code = stripComments(raw).split("\n");
  const shown = raw.split("\n");
  code.forEach((line, i) => {
    if (STORAGE_RE.test(line)){
      console.error(`check-purity: src/${rel}:${i + 1}  ${shown[i].trim()}`);
      leaks++;
    }
  });
}
if (leaks){
  console.error(`\ncheck-purity: ${leaks} depolama sızıntısı.`);
  console.error(`Depolamaya yalnız şu dosyalar dokunabilir: ${[...STORAGE_ALLOWED].join(", ")}`);
  process.exit(1);
}

console.log("check-purity: src/core/ temiz · depolama yalnız adaptörde");
