# ADR 0001: Modüler kaynak, tek dosya çıktı

**Durum:** Önerildi — `CAPABILITY-MAP.md` onayına bağlı
**Tarih:** 2026-09-20

## Bağlam

`index.html` 5.229 satır / 249 KB. Tek dosya olması bir kaza değil, bir karar:
README bunu açıkça gerekçelendiriyor — *"`file://` protokolünde modül yüklemeleri ve
`fetch` çağrıları CORS'a takılır."* Bu gerekçe teknik olarak **doğrudur**: `file://`
üzerinde `<script type="module">` ve `fetch` başarısız olur.

Ama dosya artık iki maliyet üretiyor:

1. Saf fonksiyonlar (`sanitizeHtml`, `bucketOf`, `foldTr`, `mergeImport`, …) yalnız
   tarayıcıda, `?test=1` ekranından sınanabiliyor. CI'da koşturulamıyorlar.
2. 5.229 satırlık tek dosyada değişiklik yapmak, değiştirilmeyen bölümleri de
   bağlama almayı gerektiriyor.

## Karar

Kaynağı `src/` altında modüllere böl. Derleme anında sıfır bağımlılıklı bir betik
(`tools/build.mjs`, yalnız `node:fs`/`node:path`) hepsini **tek bir `index.html`**
içine gömer. Derlenmiş dosya repoda durur.

## Gerekçe — kısıt neden bozulmuyor

README'nin gerekçesi **çalışma zamanıyla** ilgilidir. Derleme anında gömme, çalışma
zamanında hiçbir şey yüklemez:

| | Önce | Sonra |
|---|---|---|
| Kullanıcının indirdiği | `index.html` | `index.html` |
| Çalışma zamanı isteği | yok | yok |
| `file://` üzerinde | çalışır | çalışır |
| Bağımlılık | sıfır | sıfır |
| Katkı verenin ihtiyacı | metin düzenleyici | metin düzenleyici + Node |

Kullanıcı sözleşmesi bit düzeyinde aynı kalır. Değişen tek şey **katkı vermenin**
önkoşulu.

## Sonuçlar

**Olumlu**
- Saf fonksiyonlar `node --test` ile CI'da koşar
- 5.229 satır, sorumluluğuna göre okunabilir dosyalara ayrılır
- Boyut ve tazelik CI kapısı haline gelir

**Olumsuz**
- Katkı verene Node gerekir (çalıştırana değil)
- `index.html` üretilmiş dosya olur; elle düzenlenirse derlemede kaybolur
- Kaynak ile çıktı ayrışabilir

**Azaltım**
- `node tools/build.mjs --check` CI'da çalışır; çıktı güncel değilse **derleme kırılır**
- `index.html`'in başına "ÜRETİLMİŞ DOSYA — elle düzenleme" başlığı konur
- İlk sürümde `--stdout` çıktısı mevcut `index.html` ile **birebir aynı** olmak
  zorundadır (S1). Bu, bölmenin davranışı koruduğunun kanıtıdır — iddia değil, `diff`.

## Değerlendirilip elenen seçenekler

- **Mutlak tek dosya (derleme yok).** Kısıtı en saf hâliyle korur ama iki maliyeti
  de çözmez; dosya büyümeye devam eder.
- **Tam serbestlik (paketleyici + çatı + PWA).** En geniş alan, ama kurucu sözleşmeyi
  (çevrimdışı, kurulumsuz, sunucusuz) kırar. Kullanıcı tanımıyla çelişir.
