# Ölçüm: depolama tavanı kalktı (T3.2 / T3.3, S5)

**Tarih:** 2026-09-20 · **Koşum:** `node tools/probe/migration.mjs`
**Ortam:** Chromium 141, `file://`

## Sonuç

| Deneme | Sonuç |
|---|---|
| IndexedDB'ye **60 MB** yazma (6 × 10 MB) | ✅ başarılı |
| Geri okuma | ✅ **62.914.560 / 62.914.560 bayt — birebir** |
| Aynı **10 MB** parçası localStorage'a | ❌ **QuotaExceededError** |
| `navigator.storage.estimate().quota` | **162.331.904.409 bayt ≈ 151 GiB** |
| Süre | **0,8 sn** (CI'da koşabilecek kadar hızlı) |

**S5 karşılandı** ve fazlasıyla: hedef "> 50 MB kullanılabilir" idi.

Kritik olan ikinci satır. `estimate()` bir **tavan** bildirir, bir rezervasyon
değil; tek başına kanıt sayılamaz. Aynı koşumda localStorage'ın 10 MB'ı
reddetmesi, eski tavanın **gerçek** olduğunu ve kalktığını birlikte gösteriyor.

## Ne değişti, kullanıcı ne görüyor

- **Resim kilidi kalktı.** Eski eşik ~5 MB'ın %95'iydi; eşik artık gerçek
  kotaya göre hesaplanıyor. IndexedDB'de o duvar pratikte yok.
- **Gösterge iki farklı soruya cevap veriyor.** localStorage'ta "duvara ne
  kadar kaldı" (tavan yakın ve gerçek), IndexedDB'de "ne kadar yer kaplıyorum"
  (yüzde anlamsız olurdu — 151 GiB'ın yanında her şey %0'dır). Aynı çubuğu
  ikisinde de göstermek ikincisinde yalan söylemek olurdu.
- **Seçilen depo göstergenin ipucunda yazıyor.**

## Ne değişmedi

Yazma yollarındaki `try/catch`'ler duruyor: kota bildirilir ama teslim
edilmeyebilir (disk dolabilir). `QuotaExceededError` hâlâ yakalanıyor ve
mevcut uyarı şeridi yolundan bildiriliyor.

## Dayanıklılık: T3.1'in açtığı sorun ve çözümü

T3.1, IndexedDB'nin **senkron yazamadığını** ortaya çıkardı: sayfa kapanırken
bir `await`in devamı çalışmaz. Yani alan büyürken dayanıklılık sessizce
düşecekti — localStorage'da kaybolmayan son 300 ms'lik düzenleme
IndexedDB'de kaybolabilirdi.

Çözüm **kapanış günlüğü**: kapanış anında durum localStorage'a **senkron**
bırakılır; bir sonraki açılışta varsa seçilen depoya yazılır ve silinir.
Günlük yalnız kapanışta yazıldığı için normal kullanımda maliyeti yok.
Notlar localStorage'a sığmazsa (asıl sebep zaten buydu) yalnız görevler
kurtarılır ve bu kullanıcıya söylenir.

Testler: `behavior.mjs` içinde günlük yazma/oynatma/silme, `migration.mjs`
içinde göç ve geri düşme.

## Göç

- **Atomik:** iki anahtar tek IndexedDB işleminde yazılır; yarıda kalırsa
  hiçbiri yazılmaz ve bir sonraki açılışta yeniden denenir.
- **Geri alınabilir:** localStorage kaydı **silinmez**.
- **Tek yönlü:** IndexedDB → localStorage göçü yoktur, çünkü localStorage'ın
  işlemi yoktur ve iki anahtar güvenle yazılamaz.
- **Bir kez:** ikinci açılış eski localStorage verisini geri getirmez (testle
  kilitli).

## Firefox ve Safari hâlâ ölçülmedi

T0.1 bu ortamda kapatılamadı. Mimari bu cevabı beklemiyor: IndexedDB
**açılmazsa** sessizce localStorage'da kalınır (`?noidb=1` ile o yol da CI'da
koşuyor). Kullanıcı veri kaybetmez, yalnız tavan düşük kalır.
