#!/usr/bin/env node
/* =========================================================================
   TaskHub gömücü — src/ altındaki parçaları tek bir index.html'e birleştirir.

   Sıfır bağımlılık: yalnız node: yerleşikleri. package.json yok, npm yok.

   Neden derleme adımı var: README'nin gerekçesi ("file:// üzerinde modül
   yüklemeleri ve fetch CORS'a takılır") ÇALIŞMA ZAMANIYLA ilgilidir ve
   doğrudur. Derleme anında gömmek o gerekçeye değmez — gönderilen artefakt
   hâlâ kendine yeten tek bir HTML dosyasıdır. Ayrıntı: docs/adr/0001.
   ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const TEMPLATE = join(SRC, "index.html.tmpl");
const OUTPUT = join(ROOT, "index.html");

const SIZE_BUDGET = 500 * 1024;   // SPEC.md S10
const DIRECTIVE = /^<!--@inline (.+?) -->$/;

/* Bir parçayı oku ve TEK bir sondaki satır sonunu at.
   Şablon satırları "\n" ile birleştirildiği için, parça da sondaki "\n"i
   taşırsa her gömme noktasında fazladan bir boş satır doğardı. */
function readChunk(rel){
  const path = join(SRC, rel);
  let text;
  try { text = readFileSync(path, "utf8"); }
  catch { fail(`Parça bulunamadı: src/${rel}`); }
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

function fail(msg){ console.error("build: " + msg); process.exit(1); }

function build(){
  let tmpl;
  try { tmpl = readFileSync(TEMPLATE, "utf8"); }
  catch { fail("Şablon bulunamadı: src/index.html.tmpl"); }

  const out = [];
  let inlined = 0;
  for (const line of tmpl.split("\n")){
    const m = DIRECTIVE.exec(line);
    if (m){ out.push(readChunk(m[1])); inlined++; }
    else out.push(line);
  }
  if (!inlined) fail("Şablonda hiç @inline yönergesi yok — bu bir hata olmalı.");
  return out.join("\n");
}

const argv = process.argv.slice(2);
const html = build();
const bytes = Buffer.byteLength(html, "utf8");

if (argv.includes("--stdout")){
  process.stdout.write(html);

} else if (argv.includes("--check")){
  let current;
  try { current = readFileSync(OUTPUT, "utf8"); }
  catch { fail("index.html yok. `node tools/build.mjs` ile üret."); }
  if (current !== html){
    console.error("build: index.html BAYAT — src/ ile eşleşmiyor.");
    console.error("       `node tools/build.mjs` çalıştırıp sonucu gönderin.");
    process.exit(1);
  }
  console.log(`build: index.html güncel (${(bytes/1024).toFixed(1)} KB)`);

} else if (argv.includes("--budget")){
  const pct = (bytes / SIZE_BUDGET * 100).toFixed(1);
  console.log(`build: ${(bytes/1024).toFixed(1)} KB / ${SIZE_BUDGET/1024} KB bütçe (%${pct})`);
  if (bytes > SIZE_BUDGET){
    console.error("build: BOYUT BÜTÇESİ AŞILDI (SPEC.md S10)");
    process.exit(1);
  }

} else {
  writeFileSync(OUTPUT, html);
  console.log(`build: index.html yazıldı (${(bytes/1024).toFixed(1)} KB)`);
}
