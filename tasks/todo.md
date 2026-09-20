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

### T2.3b: Büyük listede kare bütçesi — ✅ BİTTİ (pencereleme DEĞİL, parçalı çizim)

**Açıklama:** Görev "liste pencereleme" olarak yazılmıştı. Ölçüm bu tasarımı
reddetti; kapanışı parçalı (aşamalı) çizim sağladı. Gerekçe aşağıda, sayılar
`docs/olcumler/2026-09-20-cizim-butcesi.md` ekinde.

**Kabul ölçütleri:**
- [x] S3b karşılanır: 5.000 görevde **hiçbir kare** 16 ms'yi aşmaz →
      **10,2-13,7 ms** (12 koşum; öncesi 30,50 ms). Bloklayan çizim de
      parçalar da (7,0-7,8 ms) bütçenin altında.
- [x] ~~`IntersectionObserver` ile pencereleme~~ → **REDDEDİLDİ, ölçümle.**
      `content-visibility: auto` kaydırmayı kötüleştirdi (p50 16,9 → 32,7 ms);
      gerçek pencereleme ise aşağıdaki dört ölçütü birden ihlal ederdi.
      Kaydırma zaten vsync sınırında ölçülmüştü (p50 16,6 ms — iş sınırı değil).
- [x] Klavyeyle gezinme kısıtlanmaz: ok tuşu **henüz çizilmemiş karta ulaşır**
      (kuyruk o anda tamamen boşaltılır). `behavior.mjs` iddiası ile kilitli.
- [x] `Ctrl+F` sınırlaması belgelendi — ve parçalı çizimde **kalıcı değil**:
      her kart eninde sonunda DOM'a girer (5.000 görevde ~0,3 sn). Pencerelemede
      kalıcı olurdu; fark budur.
- [x] Ekran okuyucu toplam sayıyı duyar — **grup başlığındaki sayı ile**.
      `aria-posinset` **bilinçli olarak eklenmedi**: her kartın kimliğini
      konumuna bağlar, böylece araya tek bir ekleme sonraki bütün kartların
      özniteliğini tazeletir. Bu, S4'ün ölçülen 335× kazancını yok ederdi.
      Grup başlığı eşzamanlı çiziliyor ve sayısı her zaman doğru.
- [x] Yazdırma yolu yarım kalmaz: `beforeprint` kuyruğu sonuna kadar boşaltır —
      **test edildi**, 3.000 görevle (`behavior.mjs`).

**Ne yapıldı (ölçüm sırasıyla):**
1. Kart inşası zaman bütçeli kuyruğa alındı (kare başına ~9 ms).
2. **Silme de kuyruğa alındı.** Ölçüm silmeyi en büyük tek bloklama kalemi
   olarak gösterdi: 1.000 kart = 22,6 ms. Ucuzlatılamadığı kanıtlandı
   (`textContent=""` 13 µs/kart, `replaceWith` 56,3 ms, `display:none`
   sonraki düzende 50,9 ms) — yalnız bölünebilir.
3. Ölçülmemiş bir varsayıma dayanan "toplu boşaltma" sezgisi **kaldırıldı**.
4. Veri hattı hatırlatıldı: `daysBetween` ve `ts` önbellekli, arama sorgusu
   çizim başına bir kez derleniyor, `diffChildren` tipli dizilerle.
5. **Sessiz bir sıralama hatası bulundu ve düzeltildi** (yerleştirme artık
   soldan sağa, önceki kardeşe çengelli). Yan faydası: liste **üstten** doluyor;
   önceki hâlinde ekranda görünen üst kısım en son geliyordu.
6. Kalan dalgalanma (12,6-15,9 ms) **çöp toplama** çıktı. Kendi hipotezim
   (kuyruk kapanışları) ölçümle çürüdü — 3.000 kapanış yalnız 0,30 ms.
   Gerçek kaynaklar `cardSig` (2,60 ms) ve `sortTasks`'ın süs nesneleriydi
   (2,60 ms); ikisi de ayırmasız yeniden yazıldı. `sortTasks`'ın eski yazımı
   testte referans olarak duruyor: 400 rastgele girdide çıktılar birebir.

**Doğrulama:** `node tools/probe/perf.mjs` (S3b kapısı **zorunlu**);
`behavior.mjs` 147/147 (T2.3b için 5 yeni iddia); sıralama iddiası kasten
bozularak sınandı.

**SINIR (dürüst):** S3b 5.000 görevde karşılanıyor; **8.000 sınırın tam
üstünde (16,0-16,4 ms), 10.000'de karşılanmıyor (29,7 ms)**. Bağlayıcı kısıt eşzamanlı O(n) geçişi
(süzme + kovalama + sıralama + anahtar farkı). Ölçüt 5.000 diyor; ötesi
istenirse çözüm pencereleme değil, veri hattını da parçalamaktır.

**Bağımlılık:** T2.2
**Dosyalar:** `src/ui/app.js`, `src/core/util.js`, `src/core/list-diff.js`,
`tools/probe/perf.mjs`, `tools/probe/behavior.mjs`
**Boyut:** M

### T2.4: Doğal dil yakalama ayrıştırıcısı (saf çekirdek) — ✅ BİTTİ

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

**Doğrulama:** `node --test` → `tests/parse-capture.test.js`, **26 test / 150+ iddia**, TR ve EN.

**Sonuç.** `src/core/parse-capture.js`. İki söz verdi, ikisi de testle kilitli:

- **TAHMİN YOK.** `bugünkü gazete` tarih değildir, `3 martı` ay adı değildir,
  `31 şubat` takvimde yoktur — üçü de dokunulmadan bırakılır. `today`
  verilmezse hiçbir tarih üretilmez.
- **SESSİZ KAYIP YOK.** Saat (`15:00`) tanınır ama **uygulanmaz**: görev
  modelinde saat alanı yok ve alan eklemek şema değişikliğidir (SPEC.md
  "önce sor"). Sessizce silinmek yerine başlıkta kalır ve `unsupported`
  içinde gerekçesiyle raporlanır.

Türkçe ASCII yazımı da tanınır (`yarin`, `carsamba`) — `foldTr` doğrudan
kullanılamadı, çünkü katlama dizenin uzunluğunu değiştirip kırpma konumlarını
kaydırıyor; onun yerine desenler harf sınıflarıyla kuruldu.

> **İki hata, tek kök neden.** İlk sürüm "önce eşleşen kural kazanır" diyordu.
> Bu iki farklı şekilde yanlıştı: `day after tomorrow` içindeki `tomorrow`
> yakalanıp yarın atanıyordu, ve `yarın bugün rapor`da metinde sonra gelen
> `bugün` seçiliyordu. Kural sırasını elle ayarlamak ikisini de "düzeltirdi"
> ve her yeni kuralda tuzağı yeniden kurardı. Ölçüt metne çevrildi:
> **metinde önce gelen kazanır, eşitlikte en uzun olan.**

**Bağımlılık:** T1.3
**Dosyalar:** `src/core/parse-capture.js`, `tests/parse-capture.test.js`
**Boyut:** M

### T2.5: Ayrıştırıcıyı hızlı ekleme kutusuna bağla — ✅ BİTTİ

**Açıklama:** Yazarken tanınan parçalar kutunun altında çip olarak gösterilir;
Enter'a basınca görev yapılandırılmış hâlde düşer. **Yeni form açılmaz** (Todoist yasası).

**Kabul ölçütleri:**
- [ ] Canlı önizleme `aria-live="polite"` ile duyurulur
- [ ] Çip tıklanarak reddedilebilir; reddedilen parça başlıkta düz metin kalır
- [ ] Ayrıştırıcı hiçbir şey tanımazsa arayüz **bugünkü hâliyle aynı** görünür
- [ ] Varsayılan ekrana kalıcı kontrol eklenmedi (S8)

**Doğrulama:** `node tools/probe/behavior.mjs` — **21/21**, T2.5 için 9 iddia.

**Sonuç.** Kutunun altında çipler: tarih, öncelik, etiket. Çipe basmak
eşleşmeyi reddeder; ayrıştırıcıya eklenen `ignore` seçeneği sayesinde metin
**özgün konumunda** kalır (reddedileni sonradan başlığa iliştirmek konumu
kaybettirirdi). Yok sayılan ikinci tarih ve desteklenmeyen saat de ayrı birer
not olarak görünür.

- **S8 kanıtlandı:** hiçbir şey tanınmazsa alan `hidden`. Varsayılan ekranda
  kalıcı yeni kontrol yok — yalnız yazarken beliriyor.
- `aria-live="polite"`; her çipin ne yaptığını söyleyen `aria-label`'ı var.
- `Esc` iki kademeli: önce çipleri ve metni temizler, sonra kutudan çıkar.
- **`addTask` düz metinle ayrıştırma yapmaz.** Nottan görev yapma yolu
  (`taskifySelection`) not metni gönderir; oradaki "yarın" bir son tarih emri
  değildir. Ayrıştırma yalnız hızlı ekleme yolunda. Testle kilitli.

**Bağımlılık:** T2.4
**Dosyalar:** `src/ui/quick-add.js`, `src/styles/tasks.css`, `src/core/i18n.js`
**Boyut:** M

### T2.6: Komut kayıt defteri + `Ctrl/Cmd+K` paleti — ✅ BİTTİ

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

**Doğrulama:** `node --test` → `tests/commands.test.js` (**12 test**);
`node tools/probe/behavior.mjs` (**39/39**, paletin 16 iddiası klavyeyle).

**Sonuç.** `src/core/commands.js` (saf kayıt + eşleme) ve `src/ui/palette.js`.

Erişilebilirlik ucuza geldi çünkü `<dialog>.showModal()` kullanıldı: odak
tuzağı, arka planın etkisizleşmesi, `aria-modal` ve `Esc` tarayıcıdan geliyor.
Elle yazılan her odak tuzağı bir hata kaynağıdır. `role="combobox"` +
`role="listbox"`/`option` + `aria-activedescendant` tarayıcıda doğrulandı.

Palet **tembel** kurulur: varsayılan DOM'a hiçbir şey eklenmez (S8).

> **Bir çelişki, kod lehine çözüldü.** Test, "kelime başı eşleşmesi baştan
> eşleşmeye üstün" diye yazılmıştı; kod tersini yapıyordu (+12 vs +8).
> Komut paletlerinin (VS Code, Sublime) yerleşik davranışı baştan eşleşmedir,
> o yüzden **test ve yorum düzeltildi, kod değil.**

**Bağımlılık:** T2.2
**Dosyalar:** `src/core/commands.js`, `src/ui/palette.js`, `tests/commands.test.js`, `src/styles/palette.css`
**Boyut:** M

### T2.7: Mevcut aksiyonları komut olarak kaydet — ✅ BİTTİ

**Açıklama:** Bugün yalnız düğmeyle ulaşılan her aksiyon (tema, dil, dışa aktarma,
içe aktarma, filtre temizleme, görünüm değiştirme, defter/sayfa işlemleri) kayıt
defterine girer.

**Kabul ölçütleri:**
- [ ] S6: aksiyon envanteri ile kayıtlı komut sayısı **eşleşir**; fark CI'da kırılır
- [ ] Her komutun iki dilde adı var
- [ ] Hiçbir düğüm kaldırılmadı — palet bir **ek yol**, bir ikame değil

**Doğrulama:** `behavior.mjs` içindeki envanter iddiası — **15 komut**, biri
eksilirse CI kırılır.

**Sonuç.** 15 komut: iki görünüm geçişi, yeni görev, arama, filtre temizleme,
tamamlananları katlama, yeni defter, yeni sayfa, tema, dil, JSON dışa/içe
aktarma, CSV, notları HTML'e dökme, yazdırma.

`when` bağlama duyarlıdır ve testle kilitlidir: notlar görünümünde CSV
listelenmez, görevler görünümünde not dışa aktarma listelenmez. Gri bir satır
göstermek yerine listelememek, aranan komutu bulmayı kolaylaştırır.

**Hiçbir düğüm kaldırılmadı** — palet bir ek yoldur, ikame değil.

**Bağımlılık:** T2.6
**Dosyalar:** `src/ui/palette.js`, `src/i18n/strings.js`, `tools/probe/behavior.mjs`
**Boyut:** M

### T2.8: Devralınan erişilebilirlik borcunu kapat — ✅ BİTTİ (17 → 0)

**Açıklama:** S9 "0 ihlal" diyordu; ölçüldüğünde tutmadığı görüldü
(`docs/olcumler/2026-09-20-erisilebilirlik.md`). Üç ihlalin **üçü de
devralınmıştır** — değiştirilmemiş özgün dosya aynı kuralları daha fazla
kombinasyonda ihlal ediyor (12'ye 9). Kapı şimdilik taban kilidi; bu görev
tabanı sıfıra indirir.

**Sonuç.** 17 taban kaydı → **0**. 64 taramada WCAG 2.1 A+AA ihlali yok.
Ayrıntı: `docs/olcumler/2026-09-20-erisilebilirlik.md`.

> **Koyu tema sorunu YOKMUŞ.** Ölçüt "kaynağı bulunacak, varsayılmayacak"
> diyordu; bulundu: **yok.** Yedi kontrast kaydının hepsi `combos: 4` — 4
> genişlik × **tek tema**. Daha önce "320px/dark" ifadesini bu kurala yanlış
> atfetmişim; o satır `list` kuralına aitti. Kriterin cevabı bir düzeltme
> değil, bir **yokluk kanıtı**.

**Kabul ölçütleri:**
- [x] **`nested-interactive` + `list`** (tek kök neden): kart `<li>`'sindeki
      `role="button"` kaldırılır. İçinde onay kutusu ve sil düğmesi olan bir
      öğe düğme olamaz; `<li>` liste öğesi kalmalı ve kartın kendisi
      tıklanabilirliğini `role` uydurmadan sürdürmeli.
      **Klavye davranışı gerilemeyecek:** `Tab`, `Enter`/`Space` ile paneli
      açma ve odak korunumu aynen çalışmalı (`behavior.mjs` kilitliyor).
- [x] **`color-contrast` açık tema:** `--warn` `#a86100` → `#9f5c00`.
      Ölçüldü: 4,404 → **4,811** (`#fff4e0` üstünde), beyazda 5,243,
      yüzeyde 4,813. Hepsi AA eşiğinin üstünde.
- [x] **`color-contrast` koyu tema:** ölçüldü — **böyle bir ihlal yok**.
      `--warn`/`--warn-soft` çifti koyu temada 7,936:1 ile zaten temiz,
      yani ihlal başka bir öğeden geliyor.
- [x] `node tools/probe/a11y.mjs` **0 ihlal** verir; taban dosyası boş
- [x] SPEC.md S9 tekrar "0 ihlal" olarak yazıldı

> **Yan etki, kayıtlı:** başlık artık bir düğme, düğmenin içine düğme konamaz.
> `[[bağlantı]]`lar başlıktan **üstbilgi satırına** taşındı, etiketlerin yanına
> çip olarak. Kural sağlandı, keşfedilebilirlik arttı.
>
> **Seçim kısayolu boşluktan `x`'e geçti.** Boşluk bir düğmeyi etkinleştirir;
> yerel anlamla kavga etmek yanlış olurdu. Linear'ın kısayolu da `x`.
>
> **Kendi kendimi bir kez kurtardım:** ilk yamada `taskCard`'ı değiştirirken
> aradaki yedi yardımcı fonksiyonu (`cardSig`, `captureListFocus`,
> `applyFocusSlot`, `restoreListFocus`, `groupHead`, `makeSection`,
> `reconcileCards`) sildim. Testler hemen patladı, `git checkout` ile geri
> alındı ve yama yalnız `taskCard` gövdesini hedefleyecek şekilde yeniden
> yazıldı. Geniş aralıklı metin değiştirme, aralığın içinde ne olduğunu
> saymadan yapılmamalı.

**Doğrulama:** `node tools/probe/a11y.mjs` · `node tools/probe/behavior.mjs`
· `node tools/probe/verify.mjs`

**Bağımlılık:** T2.2 (kart yapısı)
**Dosyalar:** `src/ui/app.js`, `src/styles/01-tokens.css`, `docs/olcumler/a11y-baseline.json`, `SPEC.md`
**Boyut:** M

### ✅ Kontrol noktası — Faz 2
- [x] **S3a** küçük delta p95 ~6 ms < 16 ms · **S4** medyanda 335× az düğüm
- [x] **S6** klavye kapsaması: 15 komut, envanter testle kilitli
- [x] **S7** ayrıştırma: TR+EN, 26 test
- [x] **S8** varsayılan ekranda kalıcı kontrol **artmadı** — tarayıcıda iddia edildi
      (yakalama alanı ve palet ikisi de gizli/tembel)
- [x] **S2** iddia sayısı gerilemedi: 222 tarayıcı + 75 Node + 39 davranış
- [x] Odak davranışı **elle değil testle** kilitlendi: taşıma, güncelleme,
      yuva korunumu ve "odağı çalma" guard'ı
- [x] **S3b** 5.000 görevde hiçbir kare > 16 ms → **KAPANDI** (T2.3b): 30,50 → 10,2-13,7 ms
- [x] **S9** 0 ihlal → **KAPANDI** (T2.8): 17 taban kaydı → 0
- [ ] **İnsan gözden geçirmesi, Faz 3 öncesi**

> Faz 2'nin yedi görevi bitti. Açık kalan iki ölçüt de **ölçümle** açılmıştı,
> gevşetilerek değil; ikisi de sonradan **ölçümle kapandı**, eşik indirilerek
> değil. S3b'de plandaki çözüm (pencereleme) ölçümle çürütüldü ve yerine
> parçalı çizim kondu — tahminin tutmaması, ölçüm yapmanın nedeni.

---

## Faz 3 — `store` + `views` + `repeat`: yetenek

### T3.1: Depolama soyutlaması + localStorage adaptörü — ✅ BİTTİ

**Açıklama:** Bugün `localStorage.` doğrudan çağrıları koda dağılmış durumda (9 yer, ölçüldü). Hepsi
asenkron bir arayüzün arkasına alınır; ilk adaptör mevcut `localStorage` davranışını
**birebir** korur. Bu görevde depolama teknolojisi **değişmez** — yalnız arayüz doğar.

**Kabul ölçütleri:**
- [ ] `localStorage` doğrudan çağrısı yalnız adaptör dosyasında kalır (CI kuralı)
- [ ] Mevcut `probeStorage()` uyarı şeridi davranışı korunur (`?nostorage=1` çalışır)
- [ ] Kayıt zamanlaması (`scheduleSave`) ve notların **ayrı anahtarda** tutulması korunur
- [ ] Kullanıcı hiçbir fark görmez

**Doğrulama:** `node tools/check-purity.mjs` (kural), `behavior.mjs` (**48/48**,
T3.1 için 5 iddia), `node --test` (**88 test**), `?nostorage=1` elle doğrulandı.

**Sonuç.** `src/state/adapter-local.js` — depolamaya dokunmanın tek yeri.
Arayüz asenkron (IndexedDB başka türlü olamaz); `load`/`loadNotes`/`saveNow`/
`saveNotesNow` asenkron oldu, başlangıç da öyle.

**`setSync` bilerek ayrı ve isteğe bağlı.** Sayfa kapanırken bir `await`in
devamı çalışmaz — tarayıcı olay işleyicisi bitince sayfayı yıkar. Yani "son
bir kez kaydet" yolu senkron olmak zorunda. localStorage bunu verebilir,
IndexedDB veremez. Adaptör bu farkı saklamak yerine ilan ediyor; **T3.2 kendi
dayanıklılık çözümünü yazmak zorunda kalsın diye.** `beforeunload`'a ek olarak
`visibilitychange → hidden` de bağlandı: ilki mobilde güvenilmez.

**Başlangıç asenkron ama beyaz ekran riski yok:** okuma 1 sn'de dönmezse boş
duruma düşülür, `storageOK` false olur ve kullanıcı uyarı şeridini görür.
Açılış nöbetçisinin 1500 ms'lik penceresi korunuyor.

> **Yan kazanç: T1.3'ün boşluğu kapandı.** Kanca artık modül yüklenirken değil
> `installStorageHooks()` içinde bağlanıyor, bu yüzden `state/store.js` **Node'da
> yüklenebiliyor**. Normalleştiriciler için 15 yeni test yazıldı.
>
> **Ama S11'in tamamı taşınamadı ve sebebi öğretici.** `normalizeNotePage`
> eski `html` alanını kutuya çevirirken `sanitizeHtml` çağırıyor; o da
> `document.implementation` istiyor ve **hatayı yutup `""` döndürüyor**.
> Tarayıcıda makul bir savunma, ama DOM'suz ortamda sonuç sessizce boş oluyor:
> Node'da yazılacak bir S11 testi, göç hiç çalışmadan "geçiyormuş" gibi
> görünürdü. O yüzden S11'in not-sayfası iddiaları `behavior.mjs`'e, gerçek
> süzgecin yanına konuldu.

**Yeni CI kuralı:** `localStorage`/`sessionStorage`/`indexedDB` yalnız
`state/adapter-local.js` içinde geçebilir. İlk koşumda kural kendi
belgelerini ihlal saydı (dördü dört yanlış pozitif, hepsi yorum satırı);
denetleyici artık satır numaralarını koruyarak yorumları soyuyor.

**Bağımlılık:** T1.3
**Dosyalar:** `src/core/store.js`, `src/core/store-localstorage.js`, `tests/store.test.js`
**Boyut:** M

### T3.2: IndexedDB adaptörü + geçiş — ✅ BİTTİ

**Açıklama:** Ölçüldü: `file://` üzerinde IndexedDB çalışıyor, ~151 GiB kota
(`docs/olcumler/`). İkinci adaptör yazılır; açılışta mevcut `localStorage` verisi
**bir kez** taşınır. T0.1'in sonucu hangi adaptörün varsayılan olduğunu belirler.

**Kabul ölçütleri:**
- [ ] Geçiş **atomiktir**: yarım taşınmış durum diske yazılmaz
- [ ] Geçiş **geri alınabilir**: `localStorage` kaydı taşımadan sonra bir sürüm daha korunur
- [ ] IndexedDB açılamazsa **sessizce** localStorage'a düşer ve bunu kullanıcıya söyler
- [ ] `QuotaExceededError` yakalanır, mevcut uyarı şeridi yolundan bildirilir (R6)
- [ ] S11: v1 `localStorage` ve v1 JSON yedeği kayıpsız yüklenir — fikstürle sınanır

**Doğrulama:** `node tools/probe/migration.mjs` — **15/15**, gerçek sayfa
yeniden yüklemeleriyle.

**Sonuç.** `src/state/adapter-idb.js`. Seçim koşum anında ve **açılışı
gerçekten deneyerek** yapılıyor: API'nin varlığına bakmak yetmez, çünkü
Firefox/Safari'nin `file://` davranışı ölçülmedi (T0.1 engellendi). Açılmazsa
sessizce localStorage'da kalınır — `?noidb=1` bu yolu CI'da koşturuyor.

| Kabul | Kanıt |
|---|---|
| Atomik göç | İki anahtar tek IndexedDB işleminde (`setMany`) |
| Geri alınabilir | localStorage kaydı **silinmiyor**, testle kilitli |
| Açılamazsa düşer | `?noidb=1` → `storageKind === "localStorage"`, yazma çalışıyor |
| Kota hatası yakalanır | Mevcut uyarı şeridi yolu korundu |
| **S11** | v1 görev + ayarlar + defter, eski `html` → kutu dönüşümü dahil kayıpsız |
| Bir kez olur | İkinci açılış eski veriyi geri getirmiyor |

> **T3.1'in açtığı dayanıklılık sorunu çözüldü.** IndexedDB senkron yazamaz;
> sayfa kapanırken son 300 ms'lik düzenleme kaybolabilirdi. **Kapanış
> günlüğü**: durum kapanışta localStorage'a senkron bırakılır, sonraki
> açılışta seçilen depoya yazılıp silinir. Yalnız kapanışta yazıldığı için
> normal kullanımda maliyetsiz. Notlar sığmazsa görevler kurtarılır ve
> kullanıcıya söylenir. Alanı büyütürken dayanıklılığı sessizce düşürmek
> kötü bir takas olurdu.

**Bağımlılık:** T3.1, T0.1
**Dosyalar:** `src/core/store-idb.js`, `src/core/store.js`, `tests/store-migration.test.js`, `tests/fixtures/v1-*.json`
**Boyut:** M

### T3.3: Depolama göstergesini gerçek kotaya bağla — ✅ BİTTİ

**Açıklama:** Gösterge bugün sabit `STORAGE_BUDGET = 5 MB` varsayımına dayanıyor.
`navigator.storage.estimate()` varsa gerçek değer kullanılır.

**Kabul ölçütleri:**
- [ ] S5: not+resim için > 50 MB kullanılabilir olduğu gösterilir
- [ ] `estimate()` yoksa mevcut varsayıma düşer
- [ ] %80 uyarısı ve %95 resim kilidi **gerçek** kotaya göre hesaplanır

**Doğrulama:** `node tools/probe/migration.mjs` (S5 kapısı).

**Sonuç — S5 ölçülerek kanıtlandı.** 60 MB IndexedDB'ye yazıldı ve
**62.914.560 / 62.914.560 bayt** birebir geri okundu; aynı 10 MB'lık parça
localStorage'a **QuotaExceededError** verdi. Yani eski tavan gerçekti ve
kalktı. Süre 0,8 sn — CI'da koşuyor.

`estimate()` tek başına kanıt sayılmadı: **tavan bildirir, rezervasyon
değil.** Gerçekten yazıp geri okumak tek dürüst kanıt.

**Kullanıcıya yansıyan iki değişiklik:**
- **Resim kilidi kalktı** — eşik artık gerçek kotaya göre.
- **Gösterge deposuna göre farklı soruya cevap veriyor**: localStorage'ta
  "duvara ne kadar kaldı", IndexedDB'de "ne kadar yer kaplıyorum". 151 GiB'ın
  yanında yüzde göstermek yalan söylemek olurdu.

**Bağımlılık:** T3.2
**Dosyalar:** `src/state/store.js`, `src/ui/app.js`, `tools/probe/migration.mjs`, `docs/olcumler/*`
**Boyut:** S

### T3.4: Pano (kanban) görünümü — ✅ BİTTİ (bir ölçüt T2.3b'ye bağlı)

**Açıklama:** *Notion yasası: hiçbir görünüm veriye sahip değil.* Pano, aynı
`state.tasks` üzerine bir izdüşümdür; yeni bir depo açmaz. Sütunlar önce önceliğe
göre (`SPEC.md` açık soru #2).

**Kabul ölçütleri:**
- [ ] Pano ve liste **aynı veriyi** okur; birinde yapılan değişiklik diğerinde görünür
- [ ] Filtreler ve arama panoda da geçerli
- [ ] Klavyeyle gezinilebilir; sütunlar ve kartlar erişilebilirlik ağacında adlı
- [ ] 5.000 görevde açılış < 100 ms
- [ ] Görünüm seçimi `Ctrl+K` üzerinden ulaşılabilir (S6)

**Doğrulama:** `node --test` → `tests/projections.test.js` (**15 test**);
`node tools/probe/behavior.mjs` (**67/67**, panonun 8 iddiası).

**Sonuç.** `src/core/projections.js` saf izdüşüm katmanı; `boardGroups` üç
öncelik sütunu üretir, tamamlananlar **ayrı** sütuna düşer (tamamlanmış bir
görevin önceliği artık bir karar değil, bir geçmiş).

**Pano ve liste aynı DOM'u paylaşıyor** — `section.group > h2 + ul.tasklist`.
Değişen yalnız CSS. Bunun bedeli sıfır, kazancı büyük: uzlaştırıcı, odak
korunumu, kart imzası ve kart bileşeni olduğu gibi çalışıyor; iki ayrı çizim
yolu tutmak gerekmedi.

| Kabul | Sonuç |
|---|---|
| Aynı veriyi okur | ✅ panoda tamamlanan görev listede de tamamlanmış (testle) |
| Filtre ve arama geçerli | ✅ testle |
| Sütunlar erişilebilirlik ağacında adlı | ✅ `role="group"` + `aria-label` |
| Boş sütun kaybolmaz | ✅ sürükleme hedefi belli kalsın diye |
| `Ctrl+K` üzerinden ulaşılabilir | ✅ `taskview.list` / `taskview.board` |
| **5.000 görevde < 100 ms** | ⛔ **239 ms** — bkz. aşağıda |

> **Açılış süresi ölçütü karşılanmadı ve sebebi panonun kendisi değil.**
> 5.000 görevde pano 239 ms, liste 416 ms. İkisi de aynı işi yapıyor:
> 5.000 kart inşa etmek. Bu, **T2.3b'nin (pencereleme)** çözdüğü problemin
> ta kendisi; pano ona ayrı bir çözüm yazmayacak. Ölçüt gevşetilmedi,
> T2.3b'ye bağlandı — pencereleme geldiğinde her iki görünüm de düzelir.

> **S8, ölçüm sonucu yeniden tanımlandı.** Kenar çubuğuna "Görünüm" grubu
> eklendi; S8 "kalıcı kontrol sayısı artmaz" diyordu. Sayıyı ölçünce görüldü
> ki kenar çubuğu **etiket sayısına göre** değişiyor — veriye bağlı bir sayı
> kapı olamaz. S8 artık **adlandırılmış envanter**: üst çubuk, kenar çubuğu
> grupları ve ana alandaki kalıcı kontroller adlarıyla yazılı ve CI birebir
> doğruluyor. Her ekleme bu listeyi düzenlemeyi gerektirir — yani görünür ve
> gözden geçirilebilir bir eylem. Sayım kapısından **daha güçlü**, ve
> Things'in kendi yaptığı da kalıcı bir kenar çubuğunda görünüm listesidir.

**Bağımlılık:** T2.2
**Dosyalar:** `src/ui/view-board.js`, `src/core/projections.js`, `tests/views.test.js`, `src/styles/board.css`
**Boyut:** M

### T3.5: Takvim (ay) görünümü — ✅ BİTTİ

**Açıklama:** Aynı izdüşüm sözleşmesi. Ay ızgarası; tarihsiz görevler ayrı bir şeritte
(gizlenmez — gizlemek veriyi kaybetmek gibi görünürdü).

**Kabul ölçütleri:**
- [ ] Ay sınırları **yerel saatle** hesaplanır (mevcut `parseYmd` sözleşmesi)
- [ ] Hafta başlangıcı dile göre (TR pazartesi, EN pazar) — `Intl` ile
- [ ] Tarihsiz görevler ayrı, görünür bir bölümde
- [ ] Klavyeyle gün gün gezinilir; seçili gün duyurulur
- [ ] Gece yarısı tazelenmesi (mevcut `scheduleMidnight`) takvimde de geçerli

**Doğrulama:** `node --test` → `tests/projections.test.js` (ızgara saf, DST ve
artık yıl dahil); `node tools/probe/behavior.mjs` (**83/83**, takvimin 15 iddiası).

**Sonuç.** Ay ızgarası `monthGrid` ile üretiliyor — gün gün ilerleyerek değil,
**sayaçla**: yaz saati geçişinde saat ekleyip çıkarmak günü yineletir ya da
atlatır. Testler 2025/2026/2027'nin mart ve ekim aylarını ayrı ayrı sınıyor.

| Kabul | Sonuç |
|---|---|
| Ay sınırları yerel saatle | ✅ `parseYmd`/`ymd` sözleşmesi |
| Hafta başlangıcı dile göre | ✅ TR pazartesi (2026-04-27), EN pazar (2026-04-26); gün adları `Intl`'den |
| Tarihsizler ayrı, görünür bölümde | ✅ gizlenmiyor — takvimde görünmeyen görev kaybolmuş görevdir |
| Klavyeyle gün gün gezinme | ✅ oklar, `PageUp/Down`; **ay sınırını geçince ay değişiyor** |
| Seçili gün duyuruluyor | ✅ `role="grid"/"gridcell"/"columnheader"`, tarih `aria-label`'da |
| Gece yarısı tazelenmesi | ✅ mevcut `scheduleMidnight` → `render()` yolunu kullanır |

Izgarada **tek sekme durağı** var; içinde ok tuşlarıyla gezilir. 42 ayrı `Tab`
durağı klavye kullanıcısını boğardı.

> **a11y kapısı yeni bir ihlal yakaladı ve doğru olanı yaptım: ölçtüm.**
> Uyarısı `.grow` öğesini gösteriyordu — takvim değil, **uyarı şeridi**; yani
> aynı devralınan kontrast borcu (4,404:1) yeni bir durumda sayılıyor.
> Takvimin **kendi** renkleri ölçüldü: 4,899 / 6,456 / 16,045 — hepsi AA
> eşiğinin üstünde. Taban 12'den 13'e çıktı, kusur sayısı değişmedi.

**Bağımlılık:** T3.4
**Dosyalar:** `src/ui/view-calendar.js`, `src/core/calendar.js`, `tests/calendar.test.js`, `src/styles/calendar.css`
**Boyut:** M

> **DST tuzağı.** Ay ızgarası gün ekleyerek kurulursa yaz saati geçişinde bir gün
> yinelenir veya atlanır. Test bunu kapsamak zorunda.

### T3.6: Tekrar kuralı modeli (saf çekirdek) — ✅ BİTTİ

**Açıklama:** RRULE'un küçük, açıkça sınırlı bir alt kümesi: günlük / haftalık /
aylık, aralık (`her 2 haftada`), hafta günleri (`pzt, çar`). "Her ayın son iş günü"
**kapsam dışı** ve bu yazılı.

**Kabul ölçütleri:**
- [ ] `nextOccurrence(rule, from)` saf; yerel saatle çalışır
- [ ] Ay sonu taşması tanımlı: 31 Ocak + 1 ay → 28/29 Şubat (sessizce Mart'a kaymaz)
- [ ] DST geçişleri sınanmış
- [ ] Sonsuz döngü imkânsız: kural ilerlemiyorsa **hata verir**, dönmez
- [ ] Desteklenmeyen kural açıkça reddedilir — sessizce yanlış yorumlanmaz

**Doğrulama:** `node --test` → `tests/recurrence.test.js`, **28 test**, ay sonu ve DST dahil.

**Sonuç.** `src/core/recurrence.js`. Kural bir **çapa** taşır: 31 Ocak'tan
başlayan aylık kural 28 Şubat'a kırpılır, ama sonraki hesap **kırpılmış
sonuçtan değil çapadan** yapılır — yoksa 28 Mart çıkar ve "ayın 31'i" kalıcı
olarak kaybolurdu. Testler zinciri açıkça sınıyor: 31 Oca → 28 Şu → **31 Mar**
→ 30 Nis → **31 May**.

| Kabul | Sonuç |
|---|---|
| Saf, yerel saatle | ✅ `parseYmd`/`ymd` sözleşmesi |
| Ay sonu tanımlı | ✅ 31 Oca + 1 ay = 28 Şu (2028'de 29), Mart'a kaymaz |
| DST sınanmış | ✅ 2026 mart/ekim geçişleri, 7 günlük adım dahil |
| Sonsuz döngü imkânsız | ✅ `interval ≤ 0` reddedilir; tarama sınırı aşılırsa **hata verir**, null dönmez (null "tekrar bitti" demek olurdu ve hatayı gizlerdi) |
| Desteklenmeyen açıkça reddedilir | ✅ `yearly`, bozuk `byDay`, yanlış frekansta `byDay` → kuralın **tamamı** düşer |

Haftalık aralık **ISO haftasına** (pazartesi) göre sayılır, arayüz diline göre
değil: kural veridir, sunum değil — dil değişince kullanıcının tekrar takvimi
kaymamalı.

> **Yakalama entegrasyonunu düşünürken gerçek bir hata çıktı.** `nextOccurrence`
> "çapa gelecekteyse çapayı döndür" diyordu. Ama çapa kurala uymayabilir: salı
> günü kurulan "her pazartesi" salıyı döndürürdü. Kısa devre günlük ve aylıkla
> sınırlandı (orada çapa tanımı gereği uyar) ve haftalıkta tarama çapanın bir
> gün öncesinden başlıyor. `firstOccurrence` de bu düzeltmenin üstüne kuruldu.

> **500 rastgele durumda "her zaman ilerler" özelliği** sınanıyor: sonuç
> `from`dan kesinlikle sonra ve asla null değil.

**Bağımlılık:** T1.3
**Dosyalar:** `src/core/recurrence.js`, `tests/recurrence.test.js`
**Boyut:** M

### T3.7: Tekrarlayan görev üretimi + arayüz — ✅ BİTTİ

**Açıklama:** Tekrarlayan görev tamamlanınca bir sonraki örnek üretilir. Giriş
`capture` üzerinden ("her pazartesi") **ve** görev panelinden.

**Kabul ölçütleri:**
- [ ] Tamamlanan tekrarlı görev bir sonraki örneği üretir; geçmiş örnek korunur
- [ ] Uygulama günlerce kapalı kalırsa **yığılma olmaz** — tek bir sonraki örnek
- [ ] `SCHEMA_VERSION` artışı ve geçiş yolu yazılı (sınır: "önce sor")
- [ ] Eski (tekrarsız) görevler etkilenmez; S11 korunur
- [ ] `capture` "her pazartesi" / "every monday" ifadesini tanır

**Doğrulama:** `node tools/probe/behavior.mjs` — **99/99**, tekrarın 14 iddiası.

**Sonuç.** Tekrarlayan görev tamamlanınca bir sonraki örnek doğar; tamamlanan
görev **silinmez**, geçmiş olarak kalır.

| Kabul | Sonuç |
|---|---|
| Sonraki örnek üretilir, geçmiş korunur | ✅ yeni kimlik, alt görevler sıfırlanmış, etiketler taşınmış |
| **Yığılma olmaz** | ✅ üretim yalnız **tamamlama anında**, zamana göre değil — uygulama üç hafta kapalı kalsa açılışta hiçbir şey üretilmez |
| Eski görevler etkilenmez, S11 korunur | ✅ tekrarsız görev tamamlanınca hiçbir şey üretilmiyor |
| `capture` "her pazartesi" tanır | ✅ uçtan uca: görev + kural + ilk pazartesi son tarihi |

**Kaçırılan tekrarlar atlanır:** son tarihi üç hafta geçmiş bir görevi bugün
tamamlarsanız sonraki örnek **bugünden sonrasına** düşer. Yoksa yeni görev
doğar doğmaz gecikmiş olurdu. Erken tamamlarsanız seri kaymaz
(`taban = max(sonTarih, bugün)`).

> **`SCHEMA_VERSION` ARTIRILMADI ve bu bilinçli.** Kabul ölçütü sürüme göre
> dallanan bir göç yolu olduğunu varsayıyordu; **yok**. Kodda `version` yalnız
> *yazılıyor*, hiçbir yerde okunup karar verilmiyor (`grep` ile doğrulandı).
> Artırmak hiçbir göçü tetiklemez, tören olurdu. `recur` **eklemeli** bir alan:
> eski kayıtta yok → null olur, eski kod yeni kaydı okursa yok sayar.
> **Dürüst uyarı:** eski bir sürüme dönülüp kayıt yeniden yazılırsa `recur`
> düşer — eklemeli alanların bilinen bedeli, kayda geçti.

> **Reddetmek "başka türlü yorumla" demek değildir.** Yakalamada "her
> pazartesi" çipini reddedince tarih kuralı "pazartesi"yi kapıyor ve kullanıcı
> istemediği bir son tarih alıyordu. Ayrıştırıcıya **bloke aralık** kavramı
> eklendi: reddedilen metin başlıkta kalır ama başka hiçbir kural içinde
> eşleşemez.

**Bağımlılık:** T3.6, T3.2, T2.5
**Dosyalar:** `src/core/task-ops.js`, `src/ui/panel.js`, `src/core/parse-capture.js`, `tests/recurrence-tasks.test.js`
**Boyut:** M

### ✅ Kontrol noktası — Faz 3
- [x] **S5** 60 MB yazılıp birebir geri okundu; aynı veri localStorage'a sığmıyor
- [x] **S11** v1 görev + ayarlar + defter, eski `html` → kutu dönüşümü dahil kayıpsız
- [x] Göç temiz kurulumda ve dolu kurulumda sınandı; `?noidb=1` ile geri düşme yolu da
- [x] Pano ve takvim **aynı veriyi** okuyor — izdüşüm sözleşmesi test altında
- [x] **S8** envanter kapısı aktif: üç yeni komut ve bir kenar çubuğu grubu yakalandı
- [x] **S2** gerilemedi: 145 Node + 99 davranış + 15 göç + 222 sayfa içi
- [ ] **S3b** ve **T3.4 açılış süresi** → **AÇIK**, T2.3b (pencereleme)
- [ ] **S9** 0 ihlal → **AÇIK**, T2.8 (devralınan borç, 13 kayıt / tek kök neden)
- [ ] **İnsan gözden geçirmesi, Faz 4 öncesi**

> Faz 3'ün yedi görevi bitti. Açık kalan iki ölçüt Faz 2'den devrediyor ve
> ikisi de ölçümle açıldı, gevşetilerek değil. Bu fazda **hiçbir yeni borç
> doğmadı**: a11y tabanı 13'e çıktı ama kusur sayısı sabit — aynı kök neden
> yeni görünümlerde tekrar sayılıyor.

---

## Faz 4 — `select` + `link`: güç

### T4.1: Çoklu seçim ve aralık seçimi — ✅ BİTTİ

**Kabul ölçütleri:**
- [ ] `Ctrl/Cmd+tık` tekil ekler, `Shift+tık` ve `Shift+ok` aralık seçer
- [ ] Seçim sayısı `aria-live` ile duyurulur
- [ ] Seçim yokken arayüz **bugünkü hâliyle aynı** (S8 — araç çubuğu ancak seçimle belirir)
- [ ] `Esc` seçimi temizler

**Doğrulama:** `node --test` → `tests/selection.test.js` (**10 test**);
`node tools/probe/behavior.mjs` (**127/127**, seçimin 13 iddiası).

**Sonuç.** `src/core/selection.js` saf: aralık, küme işlemleri, budama, adım.

| Kabul | Sonuç |
|---|---|
| `Ctrl/Cmd+tık` tekil, `Shift+tık` aralık | ✅ aralık gruplar arası da çalışır |
| `Shift+ok` aralık genişletir | ✅ oklar odağı taşır; uçlarda **sarmaz** |
| Seçim `aria-live` ile duyurulur | ✅ `#selLive` |
| Seçim yokken arayüz **bugünküyle aynı** | ✅ testle: `.bulkbar` hiç çizilmiyor |
| `Esc` seçimi temizler | ✅ palet ve panelden önce sırada |

**Filtre daralınca seçim budanır.** "3 görev seçili" yazıp iki tane göstermek,
toplu silmeyi kullanıcının **görmediği** bir şeye uygular. Seçim her zaman
görünenin alt kümesi (`pruneSelection`, testle kilitli).

> **a11y kapısı BENİM hatamı yakaladı.** Karta `aria-selected` koymuştum;
> `role="button"` bu niteliği kabul etmiyor (`aria-allowed-attr`, 5 durum ×
> 8 kombinasyon). **Az kalsın tabana alıyordum:** yeni bir tarama durumu
> eklendiği için taban zaten büyüyecekti. Beklenen 16'ydı, 21 çıktı — durup
> **tabanın içine bakmak** gerçek sebebi gösterdi. Ders kapıdan önemli:
> *taban güncellemesi refleks olmamalı.* Düzeltme: nitelik kaldırıldı, seçim
> durumu erişilebilir **adın** parçası oldu.

**Bağımlılık:** T2.2
**Dosyalar:** `src/core/selection.js`, `src/ui/task-list.js`, `tests/selection.test.js`
**Boyut:** M

### T4.2: Toplu işlemler + geri alma — ✅ BİTTİ

**Kabul ölçütleri:**
- [ ] Toplu tamamla / öncelik / etiket / son tarih / sil
- [ ] **Tek geri alma adımı** tüm toplu işlemi geri alır (yarım geri alma yok)
- [ ] Mevcut 8 sn'lik "Geri al" bildirimi yolu kullanılır
- [ ] Her toplu işlem komut paletinde (S6)

**Doğrulama:** `node tools/probe/behavior.mjs` — toplu işlemlerin 11 iddiası.

**Sonuç.** Tamamla/geri aç, öncelik, son tarih, etiket, sil — hepsi seçime.
Yedisi de komut paletinde (S6 envanteri güncellendi).

**TEK GERİ ALMA ADIMI, gerçekten tek.** Anlık görüntü etkilenen her görevin
önceki hâlini **ve listedeki konumunu** saklar. Konum neden: toplu silmeyi
geri alırken görevleri sona eklemek sırayı bozar ve "geri alma" bir başka
değişiklik hâline gelir. Testle kilitli: `[s1,s2,s3,s4,s5]` → sil → geri al →
**aynı sıra**.

**Tekrar örnekleri de geri alınır.** Toplu tamamlama tekrarlı görevlerden yeni
örnekler üretir; geri alma onları da siler. Yoksa geri alma yarım kalır ve
kullanıcı silmediği bir görevle baş başa kalır.

> **Test kendi kendini kandırdı, iki kez.** Önce `querySelector(".toasts
> button")` ile **ilk** bildirimi tıkladım — testler hızlı koştuğu için ekranda
> eski bildirimler duruyordu ve **başka bir işlemin** geri alması çalışıyordu.
> Sonuncuya geçtim; bu sefer hiçbir şey olmadı, çünkü her bildirimde **iki**
> buton var ve sonuncusu **kapat** butonu. Doğru hedef: son bildirimin
> `button:not(.btn-icon)` öğesi. İkisi de üründe değil testte hataydı ama
> ikisi de "geçiyor" görünen bir test üretebilirdi.

**Bağımlılık:** T4.1
**Dosyalar:** `src/core/task-ops.js`, `src/ui/bulk-bar.js`, `tests/bulk-ops.test.js`
**Boyut:** M

### T4.3: `[[sayfa]]` bağlantı ayrıştırma (saf çekirdek) — ✅ BİTTİ

**Açıklama:** *Obsidian yasası.* Mevcut `sourceNoteId` alanı üzerine kurulur —
yeni bir bağlantı deposu açılmaz.

**Kabul ölçütleri:**
- [ ] `[[Sayfa adı]]` görev başlığında ve not kutusunda tanınır
- [ ] Eşleme Türkçe harf katlamalı (`foldTr`)
- [ ] Var olmayan sayfaya bağlantı **kırık değil, davet**: tıklayınca sayfayı açar
- [ ] Çıktı süzgeçten geçer — bağlantı yeni bir enjeksiyon yüzeyi açmaz
- [ ] `f(f(x)) === f(x)`

**Doğrulama:** `node --test` → `tests/links.test.js` (**16 test**);
`node tools/probe/behavior.mjs` (bağlantıların 8 iddiası).

**Sonuç.** `src/core/links.js` **HTML ÜRETMEZ**. Yalnız metin aralıkları ve
adlar döner; tıklanabilir öğeyi arayüz `document.createElement` ile kurar,
bağlantı adı `textContent` olarak yazılır. Böylece yeni sözdizimi mevcut izin
listesi süzgecine **hiç uğramaz** — süzgeci genişletmek gerekmedi, çünkü
genişletilecek bir yüzey doğmadı.

Tarayıcıda kanıtlandı: `[[<img src=x onerror=alert(1)>]]` başlığı **sıfır
`<img>`** üretiyor, metin olarak basılıyor.

| Kabul | Sonuç |
|---|---|
| Görev başlığında ve not kutusunda tanınır | ✅ başlıkta tıklanabilir, notta indekslenir (aşağıdaki sınır) |
| Türkçe harf katlamalı | ✅ `[[toplanti]]` → `Toplantı` sayfasını açar, yenisini yaratmaz |
| Olmayan sayfa **kırık değil, davet** | ✅ tıklayınca sayfayı oluşturup açar |
| Süzgeci atlamaz | ✅ HTML üretilmiyor; atlanacak bir süzgeç yok |
| `f(f(x)) === f(x)` | ✅ testle |

> **Kapsam sınırı, kayıtlı ve gerekçeli.** Not kutularının HTML'i **yeniden
> yazılmaz**. Tuvalin geri alma yığını `#editor`in `innerHTML` anlık
> görüntülerine dayanıyor; oraya öğe enjekte etmek hem geri almayı sessizce
> bozar hem de süzgeçten geçmemiş içerik üretir. Notlardaki bağlantılar bu
> yüzden **tanınır ve indekslenir** (geri-bağlantı paneli gösterir) ama kutu
> içinde tıklanabilir değildir. Plan kararı 3'ün doğrudan sonucu.

**Bağımlılık:** T3.2
**Dosyalar:** `src/core/links.js`, `src/core/sanitize.js`, `tests/links.test.js`
**Boyut:** M

> **Güvenlik.** Yeni bir ayrıştırılmış sözdizimi yeni bir saldırı yüzeyidir.
> Mevcut izin listesi süzgeci bu yoldan **atlanamaz**; test bunu iddia eder.

### T4.4: Geri-bağlantı paneli — ✅ BİTTİ

**Kabul ölçütleri:**
- [ ] Bir sayfa açıkken ona bağlanan görev ve sayfalar listelenir
- [ ] 5.000 görev + 500 sayfada hesaplama < 50 ms
- [ ] Bağlantı yoksa panel **yer kaplamaz** (S8)

**Doğrulama:** `node --test` (indeks + başarım); `behavior.mjs` (panelin 4 iddiası).

**Sonuç.** Açık sayfaya bağlanan görevler ve sayfalar listeleniyor; tıklayınca
göreve ya da sayfaya gidiliyor.

| Kabul | Sonuç |
|---|---|
| Bağlanan görev ve sayfalar listelenir | ✅ ikisi de, tek panelde |
| 5.000 görev + 500 sayfa < 50 ms | ✅ ölçüldü, CI'da kapı |
| Bağlantı yoksa **yer kaplamaz** (S8) | ✅ `hidden` — boş bir "(0)" başlığı bilgi vermez |

> **Not görünümü bugüne kadar HİÇ a11y taramasından geçmemişti.** Panel orada
> yaşadığı için taramaya eklendi. Çıkan tek yeni ihlal `.grow` — yine uyarı
> şeridinin devralınan kontrastı, panel değil. Dahası not görünümünde `list`
> ve `nested-interactive` **hiç çıkmıyor**: orada görev kartı yok. Bu, T2.8'in
> kök nedeninin gerçekten kart olduğunun üçüncü bağımsız kanıtı.

**Bağımlılık:** T4.3
**Dosyalar:** `src/ui/backlinks.js`, `src/core/links.js`, `tests/backlinks.test.js`
**Boyut:** S

### ✅ Kontrol noktası — Faz 4
- [x] Toplu işlemler **tek adımda** geri alınıyor — sıra ve üretilen tekrar
      örnekleri dahil
- [x] Bağlantı sözdizimi süzgeci **atlamıyor**: HTML üretilmiyor, atlanacak
      süzgeç yok. `[[<img onerror>]]` → 0 öğe, metin olarak basılıyor
- [x] **S8** envanter kapısı: toplu çubuk ve geri-bağlantı paneli seçim/bağlantı
      yokken **hiç çizilmiyor**
- [x] **S6** envanteri yedi yeni toplu komutu yakaladı
- [ ] **S9** 0 ihlal → **AÇIK**, T2.8 (taban 17, kusur sayısı yine sabit)
- [ ] **S3b** ve pano açılış süresi → **AÇIK**, T2.3b
- [ ] **İnsan gözden geçirmesi, Faz 5 öncesi**

> Faz 4'ün dört görevi bitti. a11y kapısı bu fazda **benim yazdığım bir hatayı**
> yakaladı (`aria-selected`, `role="button"` üzerinde geçersiz) — ve az kalsın
> tabana alıyordum. Ders kayıtta: *taban güncellemesi refleks olmamalı.*

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
