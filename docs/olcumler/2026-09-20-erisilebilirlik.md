# Ölçüm: erişilebilirlik (S9)

**Tarih:** 2026-09-20 · **Koşum:** `node tools/probe/a11y.mjs`
**Yapılandırma:** axe-core 4.13.0, WCAG 2.1 A + AA, Chromium 141, `file://`
**Kapsam:** 4 genişlik (320/768/1024/1440) × 2 tema × 4 arayüz durumu = **32 tarama**

## Bulgu

SPEC.md S9 ve README "sıfır ihlal" diyor. **Ölçüldü: tutmuyor.**

| Sürüm | Farklı ihlal (kural × durum) | Tarama bulgusu |
|---|---|---|
| Değiştirilmemiş özgün `index.html` | **12** | 84 |
| Bu daldaki güncel `index.html` | **9** | 61 |

**Üç ihlalin üçü de bu oturumda eklenen koddan gelmiyor.** Özgün dosya aynı
koşumdan geçirildiğinde aynı kuralları, daha fazla kombinasyonda ihlal ediyor.
(Fark, özgün sürümde komut paleti durumunun listeye düşmesinden kaynaklanıyor —
aynı ihlaller bir kez daha sayılıyor.)

Bu bir suçlama değil, bir **taban** tespiti. Muhtemel sebep: axe-core sürümü.
`nested-interactive` kuralı axe 4.4 ile geldi; README'deki tarama daha eski bir
sürümle yapılmış olabilir. Kural yeni olsa da ihlal gerçektir.

## İhlaller ve kök nedenleri

### 1 + 2. `list` ve `nested-interactive` — **tek kök neden**

Görev kartı `<li class="card" role="button">`. Bu tek nitelik iki kuralı birden
ihlal ediyor:

- `role="button"` `<li>`'yi **liste öğesi olmaktan çıkarır**, dolayısıyla
  `<ul class="tasklist">` "li olmayan içerik taşıyor" sayılır (`list`).
- Kartın içinde onay kutusu ve sil düğmesi var; bir düğmenin içinde düğme
  olamaz (`nested-interactive`).

DOM incelemesi doğruladı: `<ul>`lerin çocukları gerçekten yalnız `LI`. Sorun
yapıda değil, **rolde**.

### 3. `color-contrast` — ölçülen 4,404:1

Uyarı şeridi: `--warn` `#a86100` üzerine `--warn-soft` `#fff4e0`.

| Renk | `#fff4e0` üstünde | `#ffffff` | `#f4f5f9` |
|---|---|---|---|
| `#a86100` (mevcut) | **4,404** ❌ | 4,800 | 4,406 |
| `#9f5c00` | **4,811** ✅ | 5,243 | 4,813 |
| `#9a5900` | 5,067 ✅ | 5,522 | 5,069 |

AA eşiği 4,5:1. Mevcut değer **kıl payı** altında kalıyor — README'nin
"tokenlar ölçülerek seçildi" anlatısıyla tutarlı: ölçüm `--accent-soft`e göre
yapılmış, `--warn-soft` gözden kaçmış.

Koyu temada `--warn` `#f5c164` / `#3a2f18` → **7,936:1**, sorunsuz. Yani koyu
temadaki kontrast bulgusu **başka bir öğeden** geliyor ve T2.8 onu bulmalı —
varsayılmamalı.

## Kapı nasıl kuruldu

Eşik "sıfır" diye yalan söylemiyor, ama hiçbir şey yapmıyor da değil:

- Bilinen ihlaller `docs/olcumler/a11y-baseline.json` içinde **adlarıyla** durur.
- Listede olmayan her yeni ihlal **CI'yı kırar**. Kasıtlı bozmayla sınandı:
  `alt`sız bir `<img>` eklendiğinde `image-alt` yakalandı ve çıkış kodu 1 oldu.
- Bilinen bir ihlal **kaybolursa** koşum bunu bildirir ve tabanı güncellemeyi
  söyler; sessizce düzelen bir şey fark edilmeden geçmesin.

**Taban bir hedef değil, bir borçtur.** Kapatan görev: **T2.8**.

## axe-core repoya girmiyor

580 KB'lık dosya sürüm geçmişine yapışmasın ve gönderilen artefaktın sıfır
bağımlılık sözleşmesi bozulmasın diye axe-core koşum anında `npm pack` ile
alınır ve `$TMPDIR/taskhub-axe` altında önbelleğe konur.


## Güncelleme (T3.4): borç yeni görünümle YAYILIYOR

Pano görünümü a11y taramasına eklendiğinde **aynı üç ihlal** orada da çıktı —
yeni bir kusur değil, aynı kökün yeni bir yüzeyi. Pano, listeyle **aynı kart
bileşenini** kullanıyor ve kartın `<li role="button">` yapısı iki kuralı
birden ihlal etmeye devam ediyor.

Taban 9'dan 12 kural×duruma çıktı. Sayı arttı ama **kusur artmadı**: tek kök
neden dört farklı durumda sayılıyor.

Bunun bir sonucu var: **her yeni görünüm borcu büyütüyor.** Takvim (T3.5)
eklendiğinde üç kayıt daha eklenecek. T2.8 kökü düzelttiğinde hepsi birden
düşecek — yani T2.8 ertelendikçe kazancı da büyüyor.


## Güncelleme (T4.1): kapı BENİM hatamı yakaladı — ve az kalsın tabana alıyordum

Çoklu seçim eklenirken karta `aria-selected` konuldu. Kart `role="button"`
taşıyor ve **`aria-selected` bu rolde geçerli değil** — axe `aria-allowed-attr`
ile beş ayrı durumda, 40 tarama kombinasyonunda uyardı.

**Az kalsın tabana alınıyordu.** Yeni durum ("toplu-seçim") eklendiği için
taban zaten büyüyecekti; sayının 13'ten 21'e çıkmasını "aynı borç, yeni durum"
diye geçiştirmek kolaydı. Beklenen artış **16**'ydı; 21 görünce durup
**tabanın içine bakmak** gerçek sebebi ortaya çıkardı: yeni bir kural, ve
devralınmış değil, **bu oturumda yazılmış**.

Ders, kapının kendisinden daha önemli: **taban güncellemesi refleks olmamalı.**
Sayı beklenenden farklıysa dur ve neyin eklendiğine bak. "Yeni ihlal yok"
yazısını görmek için tabanı büyütmek, kapıyı kapatmakla aynı şey.

Düzeltme: `aria-selected` kaldırıldı, seçim durumu erişilebilir **adın**
parçası oldu (`"görev 2 — seçili"`). Her rolde geçerli, her ekran okuyucuda
okunur; `#selLive` canlı bölgesi seçim sayısını ayrıca duyuruyor. Doğru uzun
vadeli çözüm yine T2.8: kartın rolünü düzeltmek.

Taban 13 → **16**: üç devralınan ihlal, yeni bir durumda tekrar sayılıyor.
Kusur sayısı yine değişmedi.


## KAPANDI (T2.8): 17 kayıt → 0

| | Önce | Sonra |
|---|---|---|
| Taban kaydı | 17 | **0** |
| Tarama | 4 genişlik × 2 tema × 8 durum = 64 | aynı |
| WCAG 2.1 A+AA ihlali | 17 kural×durum | **sıfır** |

### Koyu tema sorunu YOKMUŞ — ölçüm öyle diyor

Plan "koyu temadaki kontrast ihlalinin **kaynağı bulunacak, varsayılmayacak**"
diyordu. Bulundu: **yok.** Yedi `color-contrast` kaydının hepsi `combos: 4`,
yani 4 genişlik × **tek tema**. Daha önce "320px/light, 320px/dark" ifadesini
bu kurala atfetmiştim; o satır `list` kuralına aitti. Doğrudan ölçüm de
doğruladı: koyu temada sıfır kontrast ihlali.

Kriterin cevabı bir düzeltme değil, bir **yokluk kanıtı** oldu.

### Düzeltme 1: `--warn` (7 kayıt)

`#a86100` → `#9f5c00`. Ölçülen: `--warn-soft` üstünde 4,404 → **4,811**;
beyazda 5,243; yüzeyde 4,813; kenar çubuğunda 4,649. Hepsi AA eşiğinin üstünde.
Koyu tema dokunulmadı (zaten 7,936:1).

### Düzeltme 2: kart yapısı (10 kayıt, tek kök neden)

Kart `<li role="button" tabindex="0">` idi. Bu **tek nitelik** iki kuralı
birden ihlal ediyordu:

- `role="button"` bir `<li>`'yi liste öğesi olmaktan çıkarır → `<ul>` "li
  olmayan içerik taşıyor" (`list`)
- İçinde onay kutusu ve sil düğmesi olan bir şey düğme olamaz
  (`nested-interactive`)

**Yeni yapı:** `<li>` düz liste öğesi; ayrıntıyı açan eylemin kendi düğmesi
var (`.card-open`). Kart başına üç doğal sekme durağı: onay kutusu, başlık
düğmesi, sil düğmesi. Satırın tamamı fare için yine tıklanabilir ama bu bir
kolaylık — klavye ve ekran okuyucu gerçek denetimleri kullanır.

**Yan etki: `[[bağlantı]]`lar başlıktan üstbilgi satırına taşındı.** Başlık
artık bir düğme ve düğmenin içine düğme konamaz. Bağlantılar etiketlerin
yanına çip olarak düştü — kural sağlandı, keşfedilebilirlik arttı.

**Klavye gerilemedi ve bu testle kilitli:** odak korunumu (güncelleme, taşıma,
yuva), ok tuşlarıyla gezinme, `Shift+ok` ile genişletme, odağın çalınmaması,
`Enter`/tıklama ile panel açma. Seçim kısayolu boşluktan **`x`**'e geçti:
boşluk bir düğmeyi etkinleştirir ve yerel anlamla kavga etmek yanlış olurdu.

### Borcun yayılması durdu

Faz 3 ve 4 boyunca taban 9 → 12 → 13 → 16 → 17 diye büyümüştü; **kusur sayısı
hiç artmadan.** Her yeni görünüm aynı kök nedeni yeniden saydırıyordu. Tek
düzeltme hepsini birden kapattı — erteledikçe kazancın büyüdüğü tahmini
doğrulandı.
