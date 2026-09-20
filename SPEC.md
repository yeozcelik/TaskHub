# Şartname: TaskHub Modernleştirme (üst düzey)

> Kapsam: bu belge **girişimin tamamını** tanımlar — hedef, kısıtlar, başarı ölçütleri,
> sınırlar. Modül başına ayrıntılı şartnameler (`SPEC-build.md`, `SPEC-render.md`, …)
> `CAPABILITY-MAP.md` onaylandıktan sonra, bağımlılık sırasına göre yazılır.

## Amaç

TaskHub bugün çalışan, erişilebilir, iyi belgelenmiş bir uygulama. Sorun kalite değil,
**tavan**: tek dosya 5.229 satıra ulaştı, çizim her seferinde DOM'u tamamen yıkıyor,
depolama ~5 MB'ta duruyor ve klavyeden yalnız üç kısayol var. "Modernleştirme" bu
tavanları kaldırmak demek — mevcut ürünü yeniden yazmak değil.

**Kullanıcı:** çevrimdışı çalışan, kurulum yapamayan veya yapmak istemeyen, verisini
kendi diskinde tutmak isteyen kişi. Bu kullanıcı değişmiyor.

**Başarı neye benziyor:** aynı çift tıklama, aynı tek dosya, aynı gizlilik — ama
5.000 görevde akıcı, `Ctrl+K` ile her şeye ulaşılabilir, tarihini yazarak giren,
panoda ve takvimde de bakabilen bir uygulama.

## Kısıtlar (pazarlığa kapalı)

1. **Gönderilen artefakt tek bir `index.html`'dir.** Harici betik, font, ikon, CDN yok.
2. **`file://` üzerinde çalışır.** Sunucu, kurulum, ağ yok.
3. **Veri kullanıcının diskinde kalır.** Telemetri yok, uzak çağrı yok.
4. **Mevcut veri kaybolmaz.** Eski `localStorage` kayıtları ve eski JSON yedekleri
   okunmaya devam eder (`normalizeTask` / `normalizeNotePage` yolu korunur).
5. **Erişilebilirlik gerilemez.** Dört genişlik × iki temada axe-core WCAG 2.1 A+AA
   sıfır ihlal; bu bir hedef değil, bir eşik.
6. **İki dil korunur.** Yeni her dize hem `tr` hem `en` için `I18N`'e girer.

### Kısıt 1 ile derleme adımı nasıl bağdaşıyor

README'nin gerekçesi doğru: *"`file://` protokolünde modül yüklemeleri ve `fetch`
çağrıları CORS'a takılır."* Bu gerekçe **çalışma zamanında** ayrı dosya yüklemeye
karşıdır. Kaynağı modüler tutup derleme anında tek dosyaya gömmek bu gerekçeye
değmez: gönderilen artefakt hâlâ kendine yeten tek bir HTML dosyasıdır ve repoda
derlenmiş hâliyle durur. Kullanıcı hiçbir şey kurmaz. **Node yalnız katkı verene
gerekir, çalıştırana değil.**

## Teknoloji

- Dil: ES2022 JavaScript, tip yok (JSDoc ile sözleşme notları)
- Bağımlılık: **sıfır** — ne çalışma zamanında ne derlemede (`node:` yerleşikleri hariç)
- Test: `node --test` (Node ≥ 20 yerleşiği), artı tarayıcıda `?test=1` ekranı korunur
- Derleme: `tools/build.mjs`, yalnız `node:fs` / `node:path` kullanır
- Tarayıcı tabanı: güncel Chrome/Edge/Firefox/Safari. Boot nöbetçisi korunur.

## Komutlar

```
Derle:        node tools/build.mjs                 # src/ → index.html
Doğrula:      node tools/build.mjs --check         # index.html güncel mi (CI kapısı)
Test:         node --test                       # tests/*.test.js taranır
Tek test:     node --test tests/core-util.test.js
Tarayıcı test: index.html?test=1
Boyut bütçesi: node tools/build.mjs --budget
Çekirdek saflığı: node tools/check-purity.mjs
i18n eşitliği: node tools/check-i18n.mjs
Tarayıcı testi: node tools/probe/verify.mjs      # ?test=1 iddia setini koşar
Yetenek ölçümü: node tools/probe/run.mjs
```

## Proje yapısı

```
index.html              → DERLENMİŞ ÇIKTI. Elle düzenlenmez. Repoda durur.
src/
  index.html.tmpl       → iskelet; <!--@inline ... --> yönergeleri, sıra buradadır
  preamble.js           → "use strict" ve dosya başlığı
  styles/*.css          → yedi stil katmanı, dosya sırasıyla
  core/                 → SAF: DOM'a dokunmaz, Node'da test edilir (check-purity)
  i18n/strings.js       → I18N sözlüğü ve t()
  html/sanitize.js      → DOM ayrıştırıcısına ihtiyaç duyar → tarayıcıda sınanır
  state/store.js        → depolama (T3.1 bunu soyutlayacak)
  ui/app.js             → arayüz; sonraki fazlarda bölünecek
tests/
  _load.mjs             → kaynağı vm ile yükleyen test yükleyicisi (ADR 0002)
  *.test.js             → node --test dosyaları
tools/
  build.mjs             → gömücü (yalnız birleştirir, dönüştürmez)
  check-purity.mjs      → src/core/ tarayıcıya dokunuyor mu
  check-i18n.mjs        → iki dil eşit mi
  probe/                → tarayıcı koşumu: verify (iddialar) + run (yetenek)
.github/workflows/ci.yml → altı kapı
tasks/plan.md           → uygulama planı
tasks/todo.md           → görev listesi
docs/adr/               → mimari karar kayıtları
docs/olcumler/          → ölçüm kayıtları (iddia değil, veri)
CAPABILITY-MAP.md       → modül haritası (kapı)
```

## Kod biçemi

Mevcut biçem korunur — bu bir yeniden yazma değil. Yorumlar Türkçe, adlar İngilizce,
saf fonksiyonlar DOM'dan ayrı:

```js
/* ---------------------------------------------------------------- tarih kovası */
// Kova sınırları yerel saatle hesaplanır: Date.parse("YYYY-MM-DD") UTC yorumlayıp
// günü kaydırır, o yüzden parseYmd kullanılır.
export function bucketOf(task, todayY){
  if (task.done) return "completed";
  if (!task.dueDate) return "nodate";
  const d = daysBetween(todayY, task.dueDate);
  if (d === null) return "nodate";
  return d < 0 ? "overdue" : d === 0 ? "today" : d === 1 ? "tomorrow" : d <= 7 ? "week" : "later";
}
```

Kurallar: `src/core/*` hiçbir zaman `document`'a dokunmaz — testedilebilirliğin
tamamı buna dayanıyor. DOM kuran her şey `src/ui/*` altında.

## Test stratejisi

| Katman | Nerede | Neyi kanıtlar |
|---|---|---|
| Birim (saf) | `tests/*.test.js`, `node --test` | Ayrıştırma, kovalama, sıralama, süzgeç, birleştirme, tekrar kuralları |
| Kayıt (golden) | `tests/build.test.js` | `build.mjs` çıktısı beklenen dosyayla birebir |
| Tarayıcı içi | `index.html?test=1` | Aynı saf modüller, gerçek tarayıcıda (regresyon ağı olarak korunur) |
| Erişilebilirlik | axe-core koşumu, 4 genişlik × 2 tema | WCAG 2.1 A+AA sıfır ihlal |
| Başarım | `tests/perf.test.js` + tarayıcı ölçümü | Aşağıdaki bütçeler |

**Mevcut 222 iddia kaybedilmez**; `node --test` altına taşınır ve `?test=1` ekranı
aynı modülleri çağırmaya devam eder. İddia sayısının **azalması** CI hatasıdır.

## Sınırlar

**Her zaman:**
- `src/core/*` saf kalır; yeni mantık önce burada, testiyle birlikte yazılır
- Yeni her dize `I18N`'in her iki diline eklenir
- Her yeni aksiyon komut paletine kaydolur (Linear yasası)
- Değişiklik `node tools/build.mjs --check` ve `node --test` yeşilken gönderilir

**Önce sor:**
- Varsayılan görünüme kalıcı bir kontrol eklemek (Things yasası vetosu)
- Depolanan şemayı değiştirmek (geçiş yolu gerektirir)
- `SCHEMA_VERSION` artırmak
- Not tuvalinin çizim/geri alma yoluna dokunmak

**Asla:**
- `index.html`'i elle düzenlemek (derlenmiş çıktıdır)
- Çalışma zamanına bağımlılık, CDN, font, uzak çağrı eklemek
- Yeşil kalmak için test silmek, atlamak ya da iddia zayıflatmak
- Eski veriyi okunamaz bırakan bir değişiklik göndermek
- Erişilebilirlik ihlali ile göndermek

## Başarı ölçütleri (ölçülebilir, yanlışlanabilir)

| # | Ölçüt | Eşik | Nasıl ölçülür |
|---|---|---|---|
| S1 | Derleme geri dönüşlü | `node tools/build.mjs --stdout` çıktısı `index.html` ile **birebir aynı** | `diff` |
| S2 | Test sayısı gerilemez | ≥ 222 iddia, tamamı geçer | `node --test` |
| S3a | Büyük listede yazma | 5.000 görevde **küçük deltalı** çizim **< 16 ms** (p95) | `node tools/probe/perf.mjs` |
| S3b | Büyük listede toplu geçiş | **her** çizim < 16 ms | aynı koşum — **AÇIK**, pencereleme bekliyor (T2.3b) |
| S4 | Çizimde DOM yıkımı | Arama filtresi değişince **eklenen düğüm sayısı O(değişen)**, O(toplam) değil | MutationObserver sayımı |
| S5 | Depolama tavanı | Not+resim için **> 50 MB** kullanılabilir | `node tools/probe/migration.mjs` — 60 MB yazılıp geri okunarak ✅ |
| S6 | Klavye kapsaması | Her kullanıcı aksiyonu `Ctrl+K` üzerinden ulaşılabilir | komut kayıt defteri sayımı vs. aksiyon envanteri |
| S7 | Yakalama ayrıştırma | "yarın 15:00 !yüksek #iş" → doğru tarih/öncelik/etiket, TR ve EN | birim testi |
| S8 | Varsayılan ekran sakin kalır | Kalıcı arayüz **envanteri** (üst çubuk, kenar çubuğu grupları, ana alan) spec'te adlarıyla yazılı ve birebir doğrulanır | `node tools/probe/behavior.mjs` |
| S9 | Erişilebilirlik | 4 genişlik × 2 tema × **8 durum**, WCAG 2.1 A+AA **0 ihlal** | `node tools/probe/a11y.mjs` — **karşılandı** |
| S10 | Dosya boyutu bütçesi | Derlenmiş `index.html` **≤ 500 KB** | `build.mjs --budget` |
| S11 | Eski veri okunur | v1 `localStorage` ve v1 JSON yedeği kayıpsız yüklenir | birim testi + fikstür |

## Açık sorular

1. **Firefox'ta `file://` + IndexedDB çalışıyor mu?** Chromium 141'de doğrulandı
   (bkz. `docs/olcumler/`). Firefox bu ortamda yok. **Faz 0 spike'ı bunu kapatır.**
   Kapanmazsa `store` modülü IndexedDB'yi yalnız desteklendiğinde kullanır,
   localStorage kalıcı geri düşme olur — plan buna göre yazıldı.
2. Pano görünümünde sütunlar neye göre? Öncelik mi, durum mu, etiket mi? (Varsayım:
   önce öncelik, sonra kullanıcı seçimi.)
3. Tekrar kuralları ne kadar geniş? (Varsayım: RRULE'un küçük bir alt kümesi —
   günlük/haftalık/aylık + aralık + hafta günleri. "Her ayın son iş günü" kapsam dışı.)
4. `[[sayfa]]` bağlantıları görevden nota mı, iki yönlü mü? (Varsayım: iki yönlü,
   mevcut `sourceNoteId` alanı üzerine kurulur.)

Bu varsayımlar **şimdi düzeltilmezse** planda yazdıkları gibi uygulanır.


## Ölçümün değiştirdiği ölçüt: S3

S3 tek bir eşik olarak yazılmıştı: "tuş başına < 16 ms". Ölçüldüğünde (bkz.
`docs/olcumler/2026-09-20-cizim-butcesi.md`) bu eşiğin iki ayrı rejimi
karıştırdığı görüldü ve **S3a / S3b** olarak ayrıldı.

Bu bir eşik gevşetmesi **değildir**: S3b silinmedi, "kabul edilebilir" ilan
edilmedi, sayısı da yumuşatılmadı. Açık bir kapı olarak duruyor ve her koşumda
güncel değeri basılıyor. Ayrım, ölçümün ortaya çıkardığı fiziksel gerçeği
kayda geçirir: küçük delta bir *uzlaştırma* problemi (çözüldü), toplu geçiş bir
*inşa hacmi* problemi (pencereleme gerekir, T2.3b).


## S9 kapandı (T2.8)

Aşağıdaki bölüm, S9'un neden geçici olarak taban kilidine çevrildiğini anlatıyor
ve tarihsel kayıt olarak duruyor. **T2.8 ile borç kapandı:** 64 taramada
(4 genişlik × 2 tema × 8 durum) WCAG 2.1 A+AA ihlali **sıfır**, taban dosyası
boş. Kapı artık "yeni ihlal yok" değil, **"hiç ihlal yok"** diyor.

## Ölçümün değiştirdiği ölçüt: S9 (tarihsel)

S9 "0 ihlal" olarak yazılmıştı — README'nin hedefinden devralınarak, ölçülmeden.
Ölçüldüğünde (`docs/olcumler/2026-09-20-erisilebilirlik.md`) tutmadığı görüldü:
axe-core 4.13 ile WCAG 2.1 A+AA taramasında üç kural ihlal ediliyor.

**Bu ihlaller devralınmıştır.** Değiştirilmemiş özgün `index.html` aynı koşumdan
geçirildiğinde aynı kuralları daha fazla kombinasyonda ihlal ediyor (12'ye 9).

Eşik gevşetilmedi, ama "sıfır" diye de yazılamazdı. Kapı artık **taban kilidi**:
bilinen ihlaller adlarıyla `docs/olcumler/a11y-baseline.json` içinde, listede
olmayan her yeni ihlal CI'yı kırıyor. Sıfır hâlâ hedef ve **T2.8** onu kapatıyor.


## Ölçümün değiştirdiği ölçüt: S8

S8 "kalıcı kontrol sayısı artmaz" olarak yazılmıştı. Ölçüldüğünde sayının
**veriye bağlı** olduğu görüldü: kenar çubuğundaki düğme sayısı etiket
sayısıyla, ana alandaki "tamamlananları katla" başlığı tamamlanmış görev
olup olmamasıyla değişiyor. Veriye bağlı bir sayı kapı olamaz.

S8 artık **adlandırılmış envanter** ve CI'da birebir doğrulanıyor:

- **Üst çubuk:** `tab, tab, q, themeBtn, btn, btn, btn, expCsv`
- **Kenar çubuğu grupları:** `Görünüm, Durum, Öncelik, Etiketler`
- **Ana alan (kalıcı):** `quick, btn` — yalnız hızlı ekleme satırı

Kart düğmeleri, etiket süzgeçleri, katlama başlıkları ve şerit eylemleri
envantere girmez: bunlar içeriktir, iskelet değil.

Bu bir gevşetme değil, güçlendirmedir: eskiden "elle sayım, gözden geçirmede"
idi, şimdi CI kapısı. Yeni bir kalıcı kontrol eklemek bu listeyi düzenlemeyi
gerektirir — sessizce büyüyen arayüz tam olarak S8'in engellemeye çalıştığı
şeydi ve artık engelleniyor.
