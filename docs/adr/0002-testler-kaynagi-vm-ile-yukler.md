# ADR 0002: Testler kaynağı `vm` ile yükler; `src/` düz betik kalır

**Durum:** Kabul edildi (T1.3 ile uygulandı)
**Tarih:** 2026-09-20
**İlgili:** ADR 0001

## Bağlam

ADR 0001 kaynağı `src/` altına böldü ve `tools/build.mjs` onları tek bir
`index.html`'e gömüyor. Bu parçaların `node --test` altında da koşabilmesi
gerekiyordu (SPEC.md S2).

Alışılmış yol, `src/` dosyalarını ESM modülü yapmak (`export function foldTr`)
ve derlemede `export` anahtar kelimesini sökmektir.

## Karar

`src/` düz betik olarak kalır — `export` yok, `import` yok. `tools/build.mjs`
**yalnız birleştirir**, hiçbir dönüşüm yapmaz. Testler kaynağı `node:vm` ile
paylaşılan bir bağlamda çalıştırıp adları oradan alır (`tests/_load.mjs`).

## Gerekçe

Sökülen bir `export` masum görünür ama iki şeyi birden kaybettirir:

1. **Birebir-aynılık ölürdü.** Bugün `node tools/build.mjs --stdout | diff -
   index.html` boş çıkıyor ve bu, bölmenin hiçbir şey kaybetmediğinin kanıtı
   (SPEC.md S1). `export` sökmek satır içeriğini değiştirir; kanıt yerini
   "muhtemelen aynıdır"a bırakır.

2. **Test edilen metin, gönderilen metin olmaktan çıkardı.** `vm` yaklaşımında
   testler kaynağı *harfi harfine* çalıştırır. Dönüşümlü yaklaşımda test bir
   sürümü, kullanıcı başka bir sürümü çalıştırır — küçük bir fark, ama
   derleyicinin kendisi hata kaynağı hâline gelir.

Bedeli: `vm` bağlamına birkaç saplama enjekte etmek gerekiyor ve `const`
bildirimleri global nesneye düşmediği için adlar ayrı bir ifade betiğiyle
toplanıyor. İkisi de `tests/_load.mjs` içinde, on beş satırda çözülüyor.

## Saplama yüzeyi bir sınırdır, bir kolaylık değil

`tests/_load.mjs` yalnız `crypto`, `URLSearchParams`, `location` ve `console`
enjekte eder. Bu liste **bilerek** dar.

Bu kuralın ilk faydası hemen görüldü: `src/state/store.js` yüklenirken
`window.addEventListener("beforeunload", …)` çağırıyor — açılış anında,
koşulsuz. Saplama listesine `window` eklemek testi yeşile boyardı; onun yerine
dosya Node test kümesinin dışında bırakıldı ve bağlılık **kayda geçti**.

Bu, `store.js`'in kusuru değil: o kod tek dosyalık bir uygulama için yazıldı ve
orada tamamen doğru. Ama planın **T3.1**'i (depolama soyutlaması) tam olarak bu
bağlılığı çözüyor; ADR 0002 ona bir gerekçe daha ekliyor.

**Sonradan not (T3.1).** Bu tam olarak böyle sonuçlandı: `installStorageHooks()`
ayrıldı, `store.js` Node'da yüklenir hâle geldi ve normalleştiriciler için 15
test yazıldı. Saplama listesi büyümedi.

İkinci bir sınır da orada görüldü: `sanitizeHtml` DOM yokluğunda hata fırlatmaz,
**`""` döndürür**. Yani ona dayanan bir kodu DOM'suz ortamda sınamak yanlış bir
güven verir — test, göç hiç çalışmadan geçer. Böyle kod tarayıcı katmanında
sınanır (`tools/probe/behavior.mjs`).

Kural: saplama listesini genişletme isteği, "bu gerçekten saf mı, yoksa tarayıcı
katmanına mı ait?" sorusunun sorulması gerektiğinin işaretidir. Tarayıcıya
ihtiyacı olanı tarayıcıda sınarız — `tools/probe/verify.mjs` bunun için var.

## Sonuçlar

**Olumlu**
- S1 (birebir-aynılık) projenin kalıcı değişmezi olur, tek seferlik bir kanıt değil
- `tools/build.mjs` aptal kalır: dönüşüm yoksa derleyici hatası da yok
- Test edilen metin ile gönderilen metin aynı

**Olumsuz**
- `src/` dosyaları tek başına `import` edilemez; `tests/_load.mjs`'den geçilir
- Adlar elle listelenir (statik `import` ergonomisi yok)
- Dosyalar arası bağımlılık derleyici tarafından denetlenmez; sıra `index.html.tmpl`
  içinde elle tutulur

**Olumsuzların kabul edilme sebebi:** üçü de *geliştirici konforu*; kazanılan
şey *kanıt*. Bu takasta kanıt kazanır.
