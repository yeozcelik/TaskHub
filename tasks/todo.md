# Görev Listesi: TaskHub Modernleştirme

Plan: `tasks/plan.md` · Harita: `CAPABILITY-MAP.md` · Şartname: `SPEC.md`

**Boyutlandırma notu — iki bilinçli istisna.** Kural, bir görevin ~5'ten fazla
dosyaya dokunmamasıdır. **T1.1** ve **T1.4** bu kuralı aşar, çünkü ikisi de tek bir
*mekanik* işlemdir: mevcut dosyayı satır sınırlarından bölmek. Bölünmüş parça sayısı
kadar dosya doğar ama **tek bir ikili doğrulaması** vardır — `diff` boş mu, değil mi.
Bunları beşerli parçalara ayırmak ara adımlarda derlenmeyen bir ağaç bırakırdı; bu,
kuralın korumaya çalıştığı şeyin tam tersidir. Başka hiçbir görev sınırı aşmaz.

**Tanım gereği bitmiş (her görev için geçerli standart eşik):**
`node tools/build.mjs --check` temiz · `node --test` yeşil, iddia sayısı gerilemedi ·
axe-core 4 genişlik × 2 tema 0 ihlal · yeni dizeler hem `tr` hem `en` · yeni aksiyon
komut paletinde.

---

## Faz 0 — Spike (hızlı başarısızlık)

### T0.1: `file://` + IndexedDB'yi Firefox ve Safari'de doğrula — ⛔ ENGELLENDİ

**Açıklama:** Chromium 141'de ölçüldü ve çalışıyor (`docs/olcumler/`). README güncel
Firefox'u da hedefliyor. Bu boşluk kapatılmadan `store` modülünün birincil yolu
seçilemez. Mevcut ölçüm koşumu (`tools/probe/run.mjs`) Firefox'u da sürecek şekilde
genişletilir; Safari elle ölçülür.

**Kabul ölçütleri:**
- [ ] Firefox'ta `file://` üzerinde IndexedDB yazma+okuma turu sonucu **kayıt altına
      alındı** (geçti ya da kaldı — ikisi de geçerli sonuç)
- [ ] Safari için aynısı, elle, sürüm notuyla
- [ ] `docs/olcumler/` altındaki kayıt her üç tarayıcıyı da içeriyor
- [ ] Sonuç `SPEC.md` "Açık sorular" #1'e işlendi

**Doğrulama:** `node tools/probe/run.mjs --browser <firefox>` çıktısı kayda eklenir.

**Durum:** ⛔ **Engellendi** — bu ortamda Firefox kurulamıyor
(`npx playwright install firefox` → `Download failure, code=1`; ağ politikası
Playwright CDN'ini engelliyor, iki deneme). Safari zaten Linux'ta yok.
**Kapatmak için:** Firefox'u olan bir makinede
`node tools/probe/run.mjs --browser $(which firefox)`.
Ayrıntı: `docs/olcumler/2026-09-20-*`.

**Bağımlılık:** Yok — **ilk iş budur.**
**Dosyalar:** `tools/probe/run.mjs`, `tools/probe/probe.html`, `docs/olcumler/*`, `SPEC.md`
**Boyut:** S

> **Kapı değil, bilgi.** Sonuç olumsuz çıkarsa plan değişmez; `store` soyutlaması
> zaten iki adaptörlü. Değişen tek şey hangi adaptörün varsayılan olduğu.

---

## Faz 1 — `build`: modüler kaynak, tek dosya çıktı

### T1.1: Gömücü betik + `src/` iskeleti, **birebir aynı** çıktı — ✅ BİTTİ

**Açıklama:** `index.html`, içeriği değiştirilmeden satır sınırlarından parçalara
bölünür; `tools/build.mjs` bu parçaları sırayla birleştirip aynı dosyayı üretir.
Bu görevde **hiçbir kod yeniden yazılmaz** — yalnızca yeri değişir.

**Kabul ölçütleri:**
- [x] `node tools/build.mjs --stdout | diff - index.html` **boş çıktı verdi**
      — SHA-256 `6679c64b…` her iki tarafta aynı
- [x] `build.mjs` yalnız `node:fs` ve `node:path` kullanıyor; `package.json` yok
- [x] `--check` bayat çıktıda kod 1 ile çıkıyor (kasıtlı bayatlatmayla sınandı)
- [x] `index.html` başında "ÜRETİLMİŞ DOSYA" başlığı var

**Sonuç:** `src/` 4 parça (`app.js` 4562, `styles/app.css` 600, `boot/guard.js` 38,
`index.html.tmpl` 43 satır). Derlenmiş dosya 244.1 KB, bütçenin %48.8'i.
Tarayıcıda **222/222 iddia geçiyor** (`node tools/probe/verify.mjs`).

> **Sıralama notu.** Başlık, birebir-aynılık kanıtlandıktan **sonra** ayrı bir adım
> olarak eklendi — başlık eklenmiş bir dosyaya karşı `diff` almak S1'i anlamsız
> kılardı. Kanıt zinciri: (1) bölünmüş parçalardan üretilen çıktı orijinalle
> birebir aynı, (2) sonra başlık eklendi, (3) başlık çıkarılınca SHA yine orijinal.

**Doğrulama:** `diff` boş. Derlenmiş dosya tarayıcıda açılır, `?test=1` 222/222 verir.

**Bağımlılık:** Yok
**Dosyalar:** `tools/build.mjs`, `src/index.html.tmpl`, `src/**` (bölünmüş parçalar), `index.html`
**Boyut:** M

> **R2'nin azaltımı budur.** `diff` boş değilse bu görev bitmemiştir. "Neredeyse aynı"
> diye bir sonuç yok.

### T1.2: Saf çekirdeği `src/core/` altına ayır — ✅ BİTTİ

**Açıklama:** DOM'a dokunmayan fonksiyonlar kendi modüllerine taşınır: `foldTr`,
`parseYmd`, `daysBetween`, `bucketOf`, `sortTasks`, `csvEscape`, `mergeImport`,
`mergeNotebooks`, `normalize*`, `boxesInReadingOrder`. Süzgeç ailesi
(`sanitizeHtml`, `presentationalToSemantic`, `normColor`, `normFontSize`,
`noteText`) ayrı bir modüle — `document.implementation` kullandığı için
"saf" değil "DOM'dan bağımsız girdi/çıktı" sınıfında; testte `jsdom` yerine
Node'un yerleşik `DOMParser`'ı yoksa tarayıcı testinde kalır ve bu **yazılı** olur.

**Kabul ölçütleri:**
- [ ] `src/core/*` içinde hiçbir dosya `document.` / `window.` / `localStorage`'a
      doğrudan dokunmaz (süzgeç modülü hariç, gerekçesi dosya başında yazılı)
- [ ] `grep` ile doğrulanan bu kural CI kontrolü olarak eklendi
- [ ] T1.1'in `diff` boşluğu **hâlâ geçerli**

**Doğrulama:** `node tools/build.mjs --stdout | diff - index.html` boş; `?test=1` 222/222.

**Bağımlılık:** T1.1
**Dosyalar:** `src/core/*.js` (≈5 dosya), `tools/build.mjs`
**Boyut:** M

### T1.3: 222 iddiayı `node --test` altına taşı — ✅ KISMEN (saf altküme)

**Açıklama:** `runTests()` içindeki iddialar `tests/*.test.js` dosyalarına taşınır.
Tarayıcıdaki `?test=1` ekranı **kaldırılmaz** — aynı modülleri çağırmaya devam eder,
gerçek tarayıcıdaki regresyon ağı olarak kalır.

**Kabul ölçütleri:**
- [ ] `node --test tests/` ≥ 222 iddia koşar, tamamı geçer
- [ ] `?test=1` hâlâ çalışır ve aynı sayıyı verir
- [ ] DOM gerektiren iddialar açıkça işaretli, hangi katmanda koştukları yazılı
- [ ] İddia sayısını düşüren değişiklik CI'da kırılır

**Doğrulama:** `node --test`; `node tools/probe/verify.mjs`.

**Sonuç — ve dürüst bir sınır.** `node --test` altında **17 test** koşuyor ve
saf çekirdeği (foldTr, parseYmd, daysBetween, bucketOf, csvEscape, mergeImport,
sortTasks, clamp, numOr, ts, uid) kapsıyor; port edilen iddiaların yanına DST,
artık yıl ve sabit nokta (`f(f(x)) === f(x)`) sınırları eklendi. Tarayıcıdaki
**222 iddia olduğu gibi duruyor** ve `tools/probe/verify.mjs` ile CI'da koşuyor.

**222'nin tamamı Node'a taşınmadı, taşınamaz da:**

| Ne | Nerede koşar | Neden |
|---|---|---|
| Saf çekirdek | `node --test` **ve** tarayıcı | Bağımlılığı yok |
| `sanitizeHtml`, `presentationalToSemantic`, `noteText` | yalnız tarayıcı | `document.implementation` gerektirir. Node'da koşturmak jsdom demekti; sıfır bağımlılık sözleşmesi bunu dışlıyor |
| `normalizeTask`, `normalizeNotePage` | yalnız tarayıcı | `src/state/store.js` **yüklenirken** `window.addEventListener("beforeunload", …)` çağırıyor |

Üçüncü satır bir bulgu: depolama modülü açılış anında koşulsuz olarak tarayıcıya
bağlanıyor. `window`'u saplamak testi yeşile boyardı; onun yerine dosya Node
kümesinin dışında bırakıldı ve bağlılık kayda geçti. **T3.1 (depolama
soyutlaması) tam olarak bunu çözüyor** — ADR 0002 ona bir gerekçe daha ekliyor.

> **Neden "kısmen".** Kabul ölçütü "≥222 iddia `node --test` altında" idi ve
> bu, ölçmeden önce yazılmış bir varsayımdı. Ölçünce görüldü ki iddiaların
> çoğunluğu DOM ayrıştırıcısına bağlı. Eşiği yeşil görünmek için düşürmek yerine
> gerçek yazıldı: **saf olan Node'a taşındı, olmayan tarayıcıda kaldı ve ikisi de
> CI'da koşuyor.** Toplam kapsama düşmedi — arttı (222 → 222 + 17).

**Bağımlılık:** T1.2
**Dosyalar:** `tests/*.test.js` (≈5 dosya), `src/index.html.tmpl`
**Boyut:** M

### T1.4: Stilleri katmanlara böl — ✅ BİTTİ

**Açıklama:** 600 satırlık `<style>` bloğu mevcut yorum başlıklarındaki sınırlardan
`src/styles/*.css` dosyalarına ayrılır (tokenlar, düzen, görevler, notlar, tuval,
yazdırma). Gömücü sırayla birleştirir.

**Kabul ölçütleri:**
- [ ] `diff` boş kalır
- [ ] Her dosya tek bir sorumluluğa karşılık gelir
- [ ] Tasarım tokenları tek dosyada toplanır

**Doğrulama:** `diff` boş; görsel karşılaştırma iki temada.

**Bağımlılık:** T1.1
**Dosyalar:** `src/styles/*.css` (≈6 dosya), `tools/build.mjs`
**Boyut:** S

### T1.5: CI kapıları — ✅ BİTTİ

**Açıklama:** GitHub Actions: derleme tazeliği, testler, saf-çekirdek kuralı,
i18n anahtar eşitliği, boyut bütçesi.

**Kabul ölçütleri:**
- [ ] `node tools/build.mjs --check` bayat çıktıda kırılır
- [ ] `node --test` kırmızıda kırılır
- [ ] `I18N.tr` ve `I18N.en` anahtar kümeleri farklıysa kırılır
- [ ] `index.html` > 500 KB ise kırılır (S10)
- [ ] `src/core/*` içinde `document.`/`window.` varsa kırılır

**Doğrulama:** Kasıtlı olarak bozulmuş bir dal ile her kapının kırıldığı gösterilir.

**Bağımlılık:** T1.3
**Dosyalar:** `.github/workflows/ci.yml`, `tools/build.mjs`, `tools/check-i18n.mjs`
**Boyut:** S

### ✅ Kontrol noktası — Faz 1
- [ ] S1: `diff` boş · S2: ≥222 iddia yeşil · S9: axe 0 ihlal · S10: ≤500 KB
- [ ] Beş CI kapısının **her biri** kasıtlı bozmayla sınandı
- [ ] Ürün yüzeyi değişmedi — kullanıcı hiçbir fark görmüyor
- [ ] **İnsan gözden geçirmesi, Faz 2 öncesi**

---

## Faz 2 — `render` + `capture` + `command`: algılanan modernlik

### T2.1: Anahtarlı uzlaştırıcı (saf çekirdek) — ✅ BİTTİ

**Açıklama:** `renderList()` bugün `box.textContent = ""` ile DOM'u tamamen yıkıp
yeniden kuruyor (`index.html:2137` civarı). Yerine anahtarlı bir uzlaştırıcı:
girdi olarak eski ve yeni sanal ağaç, çıktı olarak **yama listesi**. Bu görevde
DOM'a dokunulmaz — yalnız yamayı üreten saf fonksiyon ve testleri.

**Kabul ölçütleri:**
- [ ] `diffChildren(eski, yeni)` yama üretir: `insert` / `move` / `update` / `remove`
- [ ] Sırası değişen listede üretilen yama **O(değişen)**, O(toplam) değil
- [ ] Anahtar çakışması ve yinelenen anahtar tanımlı davranışa sahip (sessizce bozulmaz)
- [ ] Boş → dolu, dolu → boş, tamamen ters çevirme sınırlarının testi var

**Doğrulama:** `node --test` → `tests/list-diff.test.js`, **15 test**.

**Sonuç.** `src/core/list-diff.js`. En uzun artan altdizi (LIS) ile taşıma
sayısı **en aza** indiriliyor: 1.000 elemanda tek taşıma → **1 işlem**;
5.000 elemanda sondan başa taşıma → yine 1. Yinelenen anahtar sessizce
bozmak yerine hata veriyor.

En değerli test senaryo testi değil: **3.000 rastgele durumda yama gerçekten
uygulanıp** sonucun hedef listeye eşit olduğu doğrulanıyor. Tohumlu üretici
kullanıldı, başarısızlık yeniden üretilebilsin diye.

> **Yan bulgu (ADR 0002'nin tuzağı).** İlk koşumda en basit eşitlik testleri
> kaldı, 3.000 rastgele durum geçti. Sebep algoritma değildi: `vm` bağlamında
> üretilen nesnelerin prototipi host realm'inkiyle aynı olmadığı için
> `deepStrictEqual` reddediyordu. `tests/_load.mjs` artık `plain()` yardımcısını
> ve bu tuzağın açıklamasını taşıyor.

**Bağımlılık:** T1.3
**Dosyalar:** `src/core/dom-diff.js`, `tests/dom-diff.test.js`
**Boyut:** M

### T2.2: Görev listesini uzlaştırıcıya geçir — ✅ BİTTİ

**Açıklama:** `renderList()` ve `taskCard()` yamayı uygulayacak şekilde bağlanır.
**Kapsam yalnız görev listesi** — not tuvali dokunulmaz (plan, karar 3).

> **Kapsam ölçüldü.** `box.textContent = ""` tam yıkım deseni dosyada **beş yerde**
> geçiyor: `index.html:1971` (şeritler), `:2137` (görev listesi), `:2303`, `:2311`,
> `:2323` (yan panel, etiketler, alt görevler). Bu görev **yalnız `:2137`'yi**
> devralır — çizim sıcak yolu odur. Panel ve şeritler kullanıcı etkileşimi başına
> bir kez çizilir; onları da geçirmek kazanç değil, risk olurdu. Kalan dördü
> bilinçli olarak yerinde bırakılır.

**Kabul ölçütleri:**
- [ ] Arama kutusuna yazarken DOM'da eklenen düğüm sayısı O(değişen) (S4,
      `MutationObserver` ile sayılır)
- [ ] Görünür davranış aynı: gruplar, sıralama, tamamlananlar katlanması, boş durumlar
- [ ] **Odak korunur**: bir kartta odaklıyken filtre değişirse odak kaybolmaz
- [ ] Geri alma bildirimi ("Geri al") ve 8 sn'lik pencere aynen çalışır

**Doğrulama:** `node tools/probe/behavior.mjs` (**12/12**), `node tools/probe/perf.mjs`.

**Sonuç.** `renderList()` artık bölümleri ve kartları uzlaştırıyor. Çizim durumu
kabın üstünde (`box.__taskList`) duruyor: kap yeniden kurulunca durum onunla
gider, ayrı bir geçersizleştirme mekanizması gerekmiyor. Kart imzası dili ve
`today`'i de içeriyor — yoksa dil değişince kartlar sessizce bayat kalırdı.

> **Bulunan hata — ve nasıl bulunduğu.** Odak korunumu ilk sürümde kart
> yenilenirken yakalanıyordu. `behavior.mjs` taşıma senaryosunda kaldı:
> `insertBefore` taşınan düğümü belgeden anlık olarak koparıyor ve tarayıcı
> odağı düşürüyor, dolayısıyla kart yenilenirken bakmak **geç kalıyor**.
> Yakalama çizimin başına alındı. Birim testleri ve 222 iddia bu hatayı
> göremezdi: ikisi de DOM davranışını sınamıyor.
>
> Aynı yerde ikinci bir risk kilitlendi: odak listeden başka bir yere gittiyse
> (ör. arama kutusu) **geri çalınmıyor** — yalnız gerçekten kaybolduysa geri
> veriliyor.

**Bağımlılık:** T2.1
**Dosyalar:** `src/ui/task-list.js`, `src/ui/task-card.js`, `src/core/dom-diff.js`
**Boyut:** M

> **R3'ün azaltımı.** Odak korunumu bir kabul ölçütü, bir dilek değil.

### T2.3: Başarım bütçesini ölç ve kapıya bağla — ✅ ÖLÇÜLDÜ (S3 ikiye ayrıldı)

**Açıklama:** 5.000 görevlik sentetik veriyle arama tuşu başına çizim süresi ölçülür.

**Kabul ölçütleri:**
- [ ] 5.000 görevde tuş başına çizim **< 16 ms (p95)** (S3)
- [ ] Ölçüm geçiş öncesi/sonrası olarak kayda geçer (`docs/olcumler/`)
- [ ] Bütçe CI'da koşar

**Doğrulama:** `node tools/probe/perf.mjs`; CI kapısı.

**Sonuç — ve ölçütün değişmesi.** Ölçüm `docs/olcumler/2026-09-20-cizim-butcesi.md`.

| | Artımlı | Tam yıkım |
|---|---|---|
| Eklenen düğüm, medyan | **3** | 1006 |
| Küçük deltalı çizim p95 | **5,9 ms** | — |
| Toplu geçiş, en kötü | 493 ms | 1425 ms |

- **S4 ✅** medyanda **335 kat** az düğüm.
- **S3a ✅** normal yazmada p95 **5,9 ms**, bütçenin üçte biri.
- **S3b ⛔ AÇIK** toplu geçişte 493 ms.

S3b bir fark algoritması sorunu değil: uzlaştırıcı zaten en az işlemi üretiyor.
Darboğaz düğüm **inşası** — ölçülen **0,164 ms/kart**. Bu sayı tasarım
parametresini doğrudan veriyor: 16 ms'lik kareye **≈97 kart** sığar.

> **Eşik düşürülmedi.** S3b silinmedi, gevşetilmedi, "kabul edilebilir" ilan
> edilmedi. Ölçüm tek eşiğin iki ayrı fiziksel rejimi karıştırdığını gösterdi;
> ikisi de tutuluyor ve `perf.mjs` her koşumda güncel sayıyı basıyor.

**Bağımlılık:** T2.2
**Dosyalar:** `tools/probe/perf.mjs`, `tools/probe/chrome.mjs`, `.github/workflows/ci.yml`, `docs/olcumler/*`, `SPEC.md`
**Boyut:** S

### T2.3b: Liste pencereleme (sanallaştırma) — 🆕 ÖLÇÜMDEN DOĞDU

**Açıklama:** 5.000 kartı aynı anda DOM'a koymak yanlış tasarım. Yalnız görünür
alana yakın kartlar çizilir; kaydırdıkça pencere kayar. Linear ve Todoist'in
yaptığı da budur. Pencere boyutu tahmin değil **ölçümden** geliyor: 0,164 ms/kart
→ 16 ms'lik kareye ≈97 kart.

**Kabul ölçütleri:**
- [ ] S3b karşılanır: **her** çizim < 16 ms (5.000 görevde, filtre temizleme dahil)
- [ ] Kaydırma sırasında kare düşmez; `IntersectionObserver` kullanılır (ölçüldü: `file://` üzerinde mevcut)
- [ ] Klavyeyle gezinme penceresiz gibi çalışır: `Tab` ve ok tuşları henüz çizilmemiş karta ulaşabilir
- [ ] `Ctrl+F` / tarayıcı içi arama sınırlaması **açıkça belgelenir** (çizilmemiş kart bulunamaz — dürüst sınır)
- [ ] Ekran okuyucu için toplam sayı duyurulur (`aria-setsize` / `aria-posinset`)
- [ ] Yazdırma yolu pencerelenmez: `Ctrl+P` tüm görevleri basmalı

**Doğrulama:** `node tools/probe/perf.mjs` (S3b kapısı aktif edilir); `behavior.mjs`
genişletilir; axe taraması.

**Bağımlılık:** T2.2
**Dosyalar:** `src/ui/app.js`, `src/core/window.js`, `tests/window.test.js`, `tools/probe/perf.mjs`
**Boyut:** M

### T2.4: Doğal dil yakalama ayrıştırıcısı (saf çekirdek)

**Açıklama:** *Todoist yasası.* "yarın 15:00 !yüksek #iş toplantıya hazırlan" tek
satırdan tarih, saat, öncelik ve etiketi ayırır. Türkçe **ve** İngilizce.
Saf fonksiyon, TDD ile — kırmızı/yeşil/düzenle.

**Kabul ölçütleri:**
- [ ] TR: "bugün", "yarın", "pazartesi", "3 güne", "15 mart", "haftaya" tanınır
- [ ] EN: "today", "tomorrow", "monday", "in 3 days", "mar 15", "next week" tanınır
- [ ] `!yüksek`/`!p1`, `#etiket` çıkarılır ve kalan metin **temiz başlık** olur
- [ ] Belirsiz girdide **tahmin yapılmaz** — tarih `null` döner, metin bozulmaz
- [ ] Tarih aritmetiği yerel saatle (mevcut `parseYmd` sözleşmesi korunur)
- [ ] `f(f(x))` başlık üzerinde kararlı (ikinci geçiş bir şey koparmaz)

**Doğrulama:** `node --test tests/parse-capture.test.js`, ≥40 vaka, TR ve EN.

**Bağımlılık:** T1.3
**Dosyalar:** `src/core/parse-capture.js`, `tests/parse-capture.test.js`
**Boyut:** M

### T2.5: Ayrıştırıcıyı hızlı ekleme kutusuna bağla

**Açıklama:** Yazarken tanınan parçalar kutunun altında çip olarak gösterilir;
Enter'a basınca görev yapılandırılmış hâlde düşer. **Yeni form açılmaz** (Todoist yasası).

**Kabul ölçütleri:**
- [ ] Canlı önizleme `aria-live="polite"` ile duyurulur
- [ ] Çip tıklanarak reddedilebilir; reddedilen parça başlıkta düz metin kalır
- [ ] Ayrıştırıcı hiçbir şey tanımazsa arayüz **bugünkü hâliyle aynı** görünür
- [ ] Varsayılan ekrana kalıcı kontrol eklenmedi (S8)

**Doğrulama:** Elle sınama TR+EN; axe taraması; S8 elle sayım.

**Bağımlılık:** T2.4
**Dosyalar:** `src/ui/quick-add.js`, `src/styles/tasks.css`, `src/core/i18n.js`
**Boyut:** M

### T2.6: Komut kayıt defteri + `Ctrl/Cmd+K` paleti

**Açıklama:** *Linear yasası.* Merkezî komut kayıt defteri ve onu açan palet.
Eşleme Türkçe harf katlamalı (mevcut `foldTr` yeniden kullanılır — "istanbul"
"İstanbul"u bulmalı).

**Kabul ölçütleri:**
- [ ] `Ctrl+K` / `Cmd+K` açar, `Esc` kapatır, ok tuşları gezinir, Enter çalıştırır
- [ ] Eşleme `foldTr` üzerinden; Türkçe harflere duyarsız
- [ ] Odak tuzağı doğru: açıkken Tab paletin dışına çıkmaz, kapanınca odak geri döner
- [ ] `role="dialog"` + `aria-modal`, arkadaki içerik `inert`
- [ ] Yazma alanındayken (`isTyping`) kısayol çakışmaz
- [ ] Kayıt defteri **veri**: yeni komut eklemek arayüz koduna dokunmayı gerektirmez

**Doğrulama:** `node --test tests/commands.test.js` (kayıt defteri + eşleme saf);
elle klavye sınaması; axe.

**Bağımlılık:** T2.2
**Dosyalar:** `src/core/commands.js`, `src/ui/palette.js`, `tests/commands.test.js`, `src/styles/palette.css`
**Boyut:** M

### T2.7: Mevcut aksiyonları komut olarak kaydet

**Açıklama:** Bugün yalnız düğmeyle ulaşılan her aksiyon (tema, dil, dışa aktarma,
içe aktarma, filtre temizleme, görünüm değiştirme, defter/sayfa işlemleri) kayıt
defterine girer.

**Kabul ölçütleri:**
- [ ] S6: aksiyon envanteri ile kayıtlı komut sayısı **eşleşir**; fark CI'da kırılır
- [ ] Her komutun iki dilde adı var
- [ ] Hiçbir düğüm kaldırılmadı — palet bir **ek yol**, bir ikame değil

**Doğrulama:** `node --test tests/command-coverage.test.js`.

**Bağımlılık:** T2.6
**Dosyalar:** `src/core/commands.js`, `src/ui/*.js`, `tests/command-coverage.test.js`
**Boyut:** M

### ✅ Kontrol noktası — Faz 2
- [ ] S3 (<16 ms) · S4 (O(değişen)) · S6 (klavye kapsaması) · S7 (ayrıştırma) karşılandı
- [ ] S8: varsayılan ekranda kalıcı kontrol sayısı **artmadı** — sayıldı ve yazıldı
- [ ] S9 axe 0 ihlal · S2 iddia sayısı gerilemedi
- [ ] Odak davranışı elle sınandı: liste, panel, palet
- [ ] **İnsan gözden geçirmesi, Faz 3 öncesi**

---

## Faz 3 — `store` + `views` + `repeat`: yetenek

### T3.1: Depolama soyutlaması + localStorage adaptörü

**Açıklama:** Bugün `localStorage.` doğrudan çağrıları koda dağılmış durumda (9 yer, ölçüldü). Hepsi
asenkron bir arayüzün arkasına alınır; ilk adaptör mevcut `localStorage` davranışını
**birebir** korur. Bu görevde depolama teknolojisi **değişmez** — yalnız arayüz doğar.

**Kabul ölçütleri:**
- [ ] `localStorage` doğrudan çağrısı yalnız adaptör dosyasında kalır (CI kuralı)
- [ ] Mevcut `probeStorage()` uyarı şeridi davranışı korunur (`?nostorage=1` çalışır)
- [ ] Kayıt zamanlaması (`scheduleSave`) ve notların **ayrı anahtarda** tutulması korunur
- [ ] Kullanıcı hiçbir fark görmez

**Doğrulama:** `node --test tests/store.test.js` (sahte adaptörle); `?nostorage=1`.

**Bağımlılık:** T1.3
**Dosyalar:** `src/core/store.js`, `src/core/store-localstorage.js`, `tests/store.test.js`
**Boyut:** M

### T3.2: IndexedDB adaptörü + geçiş

**Açıklama:** Ölçüldü: `file://` üzerinde IndexedDB çalışıyor, ~151 GiB kota
(`docs/olcumler/`). İkinci adaptör yazılır; açılışta mevcut `localStorage` verisi
**bir kez** taşınır. T0.1'in sonucu hangi adaptörün varsayılan olduğunu belirler.

**Kabul ölçütleri:**
- [ ] Geçiş **atomiktir**: yarım taşınmış durum diske yazılmaz
- [ ] Geçiş **geri alınabilir**: `localStorage` kaydı taşımadan sonra bir sürüm daha korunur
- [ ] IndexedDB açılamazsa **sessizce** localStorage'a düşer ve bunu kullanıcıya söyler
- [ ] `QuotaExceededError` yakalanır, mevcut uyarı şeridi yolundan bildirilir (R6)
- [ ] S11: v1 `localStorage` ve v1 JSON yedeği kayıpsız yüklenir — fikstürle sınanır

**Doğrulama:** `node --test tests/store-migration.test.js`; `tools/probe` ile gerçek
tarayıcıda geçiş turu; eski fikstürle geri yükleme.

**Bağımlılık:** T3.1, T0.1
**Dosyalar:** `src/core/store-idb.js`, `src/core/store.js`, `tests/store-migration.test.js`, `tests/fixtures/v1-*.json`
**Boyut:** M

### T3.3: Depolama göstergesini gerçek kotaya bağla

**Açıklama:** Gösterge bugün sabit `STORAGE_BUDGET = 5 MB` varsayımına dayanıyor.
`navigator.storage.estimate()` varsa gerçek değer kullanılır.

**Kabul ölçütleri:**
- [ ] S5: not+resim için > 50 MB kullanılabilir olduğu gösterilir
- [ ] `estimate()` yoksa mevcut varsayıma düşer
- [ ] %80 uyarısı ve %95 resim kilidi **gerçek** kotaya göre hesaplanır

**Doğrulama:** `node --test tests/storage-meter.test.js`; tarayıcıda elle.

**Bağımlılık:** T3.2
**Dosyalar:** `src/ui/storage-meter.js`, `src/core/store.js`, `tests/storage-meter.test.js`
**Boyut:** S

### T3.4: Pano (kanban) görünümü

**Açıklama:** *Notion yasası: hiçbir görünüm veriye sahip değil.* Pano, aynı
`state.tasks` üzerine bir izdüşümdür; yeni bir depo açmaz. Sütunlar önce önceliğe
göre (`SPEC.md` açık soru #2).

**Kabul ölçütleri:**
- [ ] Pano ve liste **aynı veriyi** okur; birinde yapılan değişiklik diğerinde görünür
- [ ] Filtreler ve arama panoda da geçerli
- [ ] Klavyeyle gezinilebilir; sütunlar ve kartlar erişilebilirlik ağacında adlı
- [ ] 5.000 görevde açılış < 100 ms
- [ ] Görünüm seçimi `Ctrl+K` üzerinden ulaşılabilir (S6)

**Doğrulama:** `node --test tests/views.test.js` (izdüşüm saf); axe; başarım ölçümü.

**Bağımlılık:** T2.2
**Dosyalar:** `src/ui/view-board.js`, `src/core/projections.js`, `tests/views.test.js`, `src/styles/board.css`
**Boyut:** M

### T3.5: Takvim (ay) görünümü

**Açıklama:** Aynı izdüşüm sözleşmesi. Ay ızgarası; tarihsiz görevler ayrı bir şeritte
(gizlenmez — gizlemek veriyi kaybetmek gibi görünürdü).

**Kabul ölçütleri:**
- [ ] Ay sınırları **yerel saatle** hesaplanır (mevcut `parseYmd` sözleşmesi)
- [ ] Hafta başlangıcı dile göre (TR pazartesi, EN pazar) — `Intl` ile
- [ ] Tarihsiz görevler ayrı, görünür bir bölümde
- [ ] Klavyeyle gün gün gezinilir; seçili gün duyurulur
- [ ] Gece yarısı tazelenmesi (mevcut `scheduleMidnight`) takvimde de geçerli

**Doğrulama:** `node --test tests/calendar.test.js` (ay ızgarası saf, DST sınırları
dahil); axe.

**Bağımlılık:** T3.4
**Dosyalar:** `src/ui/view-calendar.js`, `src/core/calendar.js`, `tests/calendar.test.js`, `src/styles/calendar.css`
**Boyut:** M

> **DST tuzağı.** Ay ızgarası gün ekleyerek kurulursa yaz saati geçişinde bir gün
> yinelenir veya atlanır. Test bunu kapsamak zorunda.

### T3.6: Tekrar kuralı modeli (saf çekirdek)

**Açıklama:** RRULE'un küçük, açıkça sınırlı bir alt kümesi: günlük / haftalık /
aylık, aralık (`her 2 haftada`), hafta günleri (`pzt, çar`). "Her ayın son iş günü"
**kapsam dışı** ve bu yazılı.

**Kabul ölçütleri:**
- [ ] `nextOccurrence(rule, from)` saf; yerel saatle çalışır
- [ ] Ay sonu taşması tanımlı: 31 Ocak + 1 ay → 28/29 Şubat (sessizce Mart'a kaymaz)
- [ ] DST geçişleri sınanmış
- [ ] Sonsuz döngü imkânsız: kural ilerlemiyorsa **hata verir**, dönmez
- [ ] Desteklenmeyen kural açıkça reddedilir — sessizce yanlış yorumlanmaz

**Doğrulama:** `node --test tests/recurrence.test.js`, ≥30 vaka, ay sonu ve DST dahil.

**Bağımlılık:** T1.3
**Dosyalar:** `src/core/recurrence.js`, `tests/recurrence.test.js`
**Boyut:** M

### T3.7: Tekrarlayan görev üretimi + arayüz

**Açıklama:** Tekrarlayan görev tamamlanınca bir sonraki örnek üretilir. Giriş
`capture` üzerinden ("her pazartesi") **ve** görev panelinden.

**Kabul ölçütleri:**
- [ ] Tamamlanan tekrarlı görev bir sonraki örneği üretir; geçmiş örnek korunur
- [ ] Uygulama günlerce kapalı kalırsa **yığılma olmaz** — tek bir sonraki örnek
- [ ] `SCHEMA_VERSION` artışı ve geçiş yolu yazılı (sınır: "önce sor")
- [ ] Eski (tekrarsız) görevler etkilenmez; S11 korunur
- [ ] `capture` "her pazartesi" / "every monday" ifadesini tanır

**Doğrulama:** `node --test tests/recurrence-tasks.test.js`; eski fikstürle geri yükleme.

**Bağımlılık:** T3.6, T3.2, T2.5
**Dosyalar:** `src/core/task-ops.js`, `src/ui/panel.js`, `src/core/parse-capture.js`, `tests/recurrence-tasks.test.js`
**Boyut:** M

### ✅ Kontrol noktası — Faz 3
- [ ] S5 (>50 MB) · S11 (eski veri okunur) karşılandı — **fikstürle kanıtlandı**
- [ ] Geçiş bir kez daha temiz kurulumda ve dolu kurulumda sınandı
- [ ] Pano ve takvim aynı veriyi okuyor — izdüşüm sözleşmesi ihlal edilmedi
- [ ] S8: varsayılan ekran hâlâ sakin
- [ ] **İnsan gözden geçirmesi, Faz 4 öncesi**

---

## Faz 4 — `select` + `link`: güç

### T4.1: Çoklu seçim ve aralık seçimi

**Kabul ölçütleri:**
- [ ] `Ctrl/Cmd+tık` tekil ekler, `Shift+tık` ve `Shift+ok` aralık seçer
- [ ] Seçim sayısı `aria-live` ile duyurulur
- [ ] Seçim yokken arayüz **bugünkü hâliyle aynı** (S8 — araç çubuğu ancak seçimle belirir)
- [ ] `Esc` seçimi temizler

**Doğrulama:** `node --test tests/selection.test.js` (aralık mantığı saf); axe; elle klavye.

**Bağımlılık:** T2.2
**Dosyalar:** `src/core/selection.js`, `src/ui/task-list.js`, `tests/selection.test.js`
**Boyut:** M

### T4.2: Toplu işlemler + geri alma

**Kabul ölçütleri:**
- [ ] Toplu tamamla / öncelik / etiket / son tarih / sil
- [ ] **Tek geri alma adımı** tüm toplu işlemi geri alır (yarım geri alma yok)
- [ ] Mevcut 8 sn'lik "Geri al" bildirimi yolu kullanılır
- [ ] Her toplu işlem komut paletinde (S6)

**Doğrulama:** `node --test tests/bulk-ops.test.js`; elle geri alma sınaması.

**Bağımlılık:** T4.1
**Dosyalar:** `src/core/task-ops.js`, `src/ui/bulk-bar.js`, `tests/bulk-ops.test.js`
**Boyut:** M

### T4.3: `[[sayfa]]` bağlantı ayrıştırma (saf çekirdek)

**Açıklama:** *Obsidian yasası.* Mevcut `sourceNoteId` alanı üzerine kurulur —
yeni bir bağlantı deposu açılmaz.

**Kabul ölçütleri:**
- [ ] `[[Sayfa adı]]` görev başlığında ve not kutusunda tanınır
- [ ] Eşleme Türkçe harf katlamalı (`foldTr`)
- [ ] Var olmayan sayfaya bağlantı **kırık değil, davet**: tıklayınca sayfayı açar
- [ ] Çıktı süzgeçten geçer — bağlantı yeni bir enjeksiyon yüzeyi açmaz
- [ ] `f(f(x)) === f(x)`

**Doğrulama:** `node --test tests/links.test.js`; süzgeç testleri genişletilir.

**Bağımlılık:** T3.2
**Dosyalar:** `src/core/links.js`, `src/core/sanitize.js`, `tests/links.test.js`
**Boyut:** M

> **Güvenlik.** Yeni bir ayrıştırılmış sözdizimi yeni bir saldırı yüzeyidir.
> Mevcut izin listesi süzgeci bu yoldan **atlanamaz**; test bunu iddia eder.

### T4.4: Geri-bağlantı paneli

**Kabul ölçütleri:**
- [ ] Bir sayfa açıkken ona bağlanan görev ve sayfalar listelenir
- [ ] 5.000 görev + 500 sayfada hesaplama < 50 ms
- [ ] Bağlantı yoksa panel **yer kaplamaz** (S8)

**Doğrulama:** `node --test tests/backlinks.test.js`; başarım ölçümü; axe.

**Bağımlılık:** T4.3
**Dosyalar:** `src/ui/backlinks.js`, `src/core/links.js`, `tests/backlinks.test.js`
**Boyut:** S

### ✅ Kontrol noktası — Faz 4
- [ ] Toplu işlemler tek adımda geri alınıyor
- [ ] Bağlantı sözdizimi süzgeci atlamıyor — **güvenlik testi yeşil**
- [ ] S8 hâlâ geçerli · S9 axe 0 ihlal
- [ ] **İnsan gözden geçirmesi, Faz 5 öncesi**

---

## Faz 5 — `motion`: cila

> Kasten en sona konuldu. **Kesilebilir olan budur** — işlevsellik olmadan cila
> anlamsızdır, cila olmadan işlevsellik değil.

### T5.1: View Transitions + `prefers-reduced-motion`

**Açıklama:** Ölçüldü: `document.startViewTransition` `file://` üzerinde mevcut.
İlerici geliştirme — desteklenmeyen tarayıcıda hiçbir şey kırılmaz.

**Kabul ölçütleri:**
- [ ] Görünüm geçişleri (liste ↔ pano ↔ takvim) animasyonlu
- [ ] `startViewTransition` yoksa **anında geçiş**, hata yok
- [ ] `prefers-reduced-motion: reduce` animasyonu **tamamen** kapatır
- [ ] Animasyon sırasında odak ve ekran okuyucu duyurusu bozulmaz

**Doğrulama:** İki ayarda elle sınama; API'si kaldırılmış sahte ortamda sınama; axe.

**Bağımlılık:** T3.5
**Dosyalar:** `src/ui/transitions.js`, `src/styles/motion.css`, `src/ui/view-*.js`
**Boyut:** S

### T5.2: Sürükle-bırak yeniden sıralama

**Kabul ölçütleri:**
- [ ] Görevler liste ve panoda sürüklenerek taşınır
- [ ] **Klavye eşdeğeri var** (mevcut sayfa sıralamasındaki `Alt+↑/↓` deseni)
- [ ] Sürükleme sırasında ekran okuyucuya durum bildirilir
- [ ] Dokunmatikte çalışır (Pointer Events — tuvalde zaten kullanılan desen)
- [ ] Arama/filtre açıkken sıralama **kapalı** — görünen sıra gerçek sıra olmadığı
      için yanıltırdı (mevcut sayfa listesi kuralıyla tutarlı)

**Doğrulama:** Fare, klavye, dokunmatik ile elle sınama; axe.

**Bağımlılık:** T5.1
**Dosyalar:** `src/ui/drag-reorder.js`, `src/core/task-ops.js`, `src/styles/motion.css`
**Boyut:** M

### ✅ Kontrol noktası — Bitiş
- [ ] S1–S11 **tamamı** karşılandı ve ölçümleri `docs/olcumler/` altında
- [ ] `README.md` güncellendi: derleme adımı, yeni kısayollar, yeni görünümler
- [ ] `CAPABILITY-MAP.md` "kapsam dışı" listesi gerçeği yansıtıyor
- [ ] Her modülün `SPEC-<id>.md` dosyası uygulanana uygun
- [ ] **Bitiş gözden geçirmesi**
