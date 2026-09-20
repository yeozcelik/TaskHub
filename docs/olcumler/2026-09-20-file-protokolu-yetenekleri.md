# Ölçüm: `file://` protokolünde tarayıcı yetenekleri

**Tarih:** 2026-09-20
**Neden:** Modernleştirme planının en riskli varsayımı — "IndexedDB `file://` üzerinde
çalışmaz" inancı — doğrulanmadan `store` modülü planlanamazdı. Hafızadan cevap vermek
yerine ölçüldü.

## Yöntem

`tools/probe/probe.html` sayfası `file://` adresinden açıldı ve gerçek bir IndexedDB
yazma+okuma turu denendi. Chromium'un `--virtual-time-budget --dump-dom` kipi yetersiz
kaldı (sanal zaman IndexedDB'nin disk G/Ç'sini beklemiyor, sayfa `PENDING`'de kalıyor),
bu yüzden ölçüm **CDP üzerinden gerçek duvar saatiyle** yapıldı
(`tools/probe/cdp.mjs`, sıfır npm bağımlılığı, Node 22'nin yerleşik `WebSocket`'i).

Yeniden üretmek için: `node tools/probe/run.mjs`

## Ortam

| | |
|---|---|
| Tarayıcı | Chromium **141.0.7390.37** (`--headless=new`) |
| Platform | Linux x86_64 |
| Köken | `file://` (`location.origin === "file://"`) |

## Sonuçlar

| Yetenek | Sonuç |
|---|---|
| `localStorage` | OK |
| `indexedDB` mevcut | evet |
| **IndexedDB yazma+okuma turu** | **OK — doğrulandı** |
| `navigator.storage.estimate().quota` | **162.331.904.409 bayt (≈151 GiB)** |
| `navigator.storage.estimate().usage` | 2.717 bayt |
| `structuredClone` | evet |
| `document.startViewTransition` | evet |
| Popover API (`togglePopover`) | evet |
| `crypto.randomUUID` | evet |
| `ResizeObserver` / `IntersectionObserver` | evet / evet |
| `requestIdleCallback` | evet |
| CSS `:has()` | evet |
| CSS `container-type` | evet |
| CSS `content-visibility` | evet |
| CSS `color-mix` | evet |
| CSS `text-wrap: balance` | evet |
| `Intl.RelativeTimeFormat` | evet |
| `Intl.Segmenter` | evet |

## Yorum

1. **Depolama tavanı bir inançtı, bir ölçüm değil.** README ~5 MB'lık localStorage
   bütçesini doğru anlatıyor, ama IndexedDB aynı köken üzerinde ~151 GiB kota
   bildiriyor — yaklaşık **32.000 kat**. `store` modülünün gerekçesi budur.

2. **Modern platform `file://` üzerinde kapalı değil.** Etkileşim ve başarım
   eksenlerinin dayandığı API'lerin hepsi mevcut. `file://` kısıtı ağ ve modül
   yüklemeyi engelliyor; platform API'lerini değil.

3. **Kotanın gerçekten teslim edileceği garanti değil.** `estimate()` bir tavan
   bildirir, bir rezervasyon değil. Disk dolduğunda `QuotaExceededError` gelir.
   `store` modülü bunu yakalamak ve kullanıcıya söylemek zorunda — mevcut
   localStorage uyarı şeridinin yaptığı gibi.

## Doğrulanmamış — ve bu bir boşluk

- **Firefox ölçülemedi — ENGELLENDİ.** Bu ortamda Firefox kurulu değil ve
  indirilemiyor: `npx playwright install firefox` ağ politikası yüzünden
  `Download failure, code=1` ile başarısız oluyor (Playwright CDN'ine erişim yok).
  İki deneme yapıldı, ikisi de aynı sonucu verdi. README güncel Firefox'u hedef
  olarak sayıyor, dolayısıyla bu **açık bir boşluktur**: plandaki görev **T0.1**,
  durumu **engellendi**.

  **Kapatmak için gereken:** Firefox kurulu bir makinede
  `node tools/probe/run.mjs --browser $(which firefox)` çalıştırıp çıktıyı bu
  belgeye eklemek. Başka hiçbir şey gerekmiyor.

  **Bu neden işi durdurmuyor:** `store` soyutlaması tasarım gereği iki adaptörlü
  (`store-localstorage.js` + `store-idb.js`). Firefox IndexedDB'yi `file://`
  üzerinde reddederse localStorage adaptörü o tarayıcıda varsayılan olur; mimari
  değişmez, yalnızca hangi yolun seçildiği değişir. Faz 1 bu sorudan tamamen
  bağımsızdır.
- **Safari ölçülmedi.** Aynı gerekçe.
- Ölçüm `--headless=new` ile yapıldı; başlıklı (headed) kipte fark beklenmiyor ama
  doğrulanmadı.
- `file://` kökeni **tüm yerel dosyalarca paylaşılır**: kullanıcının açtığı başka bir
  yerel HTML dosyası aynı depolamayı okuyabilir. Bu mevcut `localStorage` için de
  aynen geçerli olduğundan **tehdit modeli değişmiyor**, ama karar kaydında
  yazılı olmalı.
