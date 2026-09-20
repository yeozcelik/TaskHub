/* Kaynağı OLDUĞU GİBİ yükler ve içindeki adları döndürür.

   Neden vm, neden ESM export değil: src/ altındaki dosyalar düz betik olarak
   kalır ve `tools/build.mjs` yalnız birleştirme yapar. Böylece gönderilen
   index.html, kaynak parçalarının BİREBİR birleşimi olmayı sürdürür (SPEC.md S1)
   ve burada test edilen metin, tarayıcıda çalışan metnin tam olarak kendisidir —
   derleme sırasında sökülen bir `export` anahtar kelimesi yok. Gerekçe:
   docs/adr/0002-testler-kaynagi-vm-ile-yukler.md

   Saplama yüzeyi BİLEREK dar tutulmuştur. Buraya bir şey eklemek istiyorsan
   dur ve sor: test ettiğin şey gerçekten saf mı, yoksa tarayıcı katmanına mı
   ait? Genişleyen saplama listesi "tarayıcıyı taklit ediyoruz" demektir ve o
   iş `?test=1` ekranının (tools/probe/verify.mjs) işidir. */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

const STUBS = () => ({
  crypto,                       // uid() için — Node yerleşiği
  URLSearchParams,              // store.js açılışta ?test=1 vb. okur
  location: { search: "" },     // aynı sebep; test kipi kapalı varsayılır
  console,
});

/** Verilen kaynak dosyalarını tek bir bağlamda sırayla çalıştırır ve
 *  istenen adları döndürür. `const` bildirimleri global nesneye düşmediği
 *  için adlar ayrı bir ifade betiğiyle toplanır. */
export function load(files, names){
  const ctx = createContext(STUBS());
  for (const f of files){
    runInContext(readFileSync(join(SRC, f), "utf8"), ctx, { filename: `src/${f}` });
  }
  return runInContext(`({ ${names.join(", ")} })`, ctx, { filename: "<extract>" });
}
