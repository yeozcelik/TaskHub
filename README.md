# TaskHub

Çevrimdışı bilgisayarlar için tek dosyalık görev listesi. Kurulum yok, sunucu yok,
internet yok — `index.html` dosyasına çift tıkla, açılsın.

## Kullanım

1. `index.html` dosyasını bilgisayarına kopyala.
2. Çift tıkla (veya tarayıcıya sürükle).
3. Üstteki kutuya görevini yaz, Enter'a bas.

Bir göreve tıklayınca sağdan ayrıntı paneli açılır: açıklama, son tarih, öncelik,
etiket ve alt görevler oradan düzenlenir. **Kaydet düğmesi yoktur** — yazdıkça
kaydedilir.

### Klavye kısayolları

| Tuş | İş |
|---|---|
| `N` | Yeni görev kutusuna geç |
| `/` | Aramaya geç |
| `Esc` | Paneli kapat / aramayı temizle |
| `Enter` | Görevi, etiketi veya alt görevi ekle |

### Gruplar

Görevler son tarihlerine göre kendiliğinden gruplanır: **Gecikmiş → Bugün → Yarın
→ Önümüzdeki 7 gün → Sonra → Tarihsiz → Tamamlananlar.** "Önümüzdeki 7 gün",
takvim haftası değil, bugünden itibaren kayan yedi günlük penceredir. Sekme
günlerce açık kalsa bile gruplar gece yarısında kendiliğinden tazelenir.

## Verilerin nerede duruyor — ve neden yedek alman gerek

Görevler tarayıcının **localStorage** alanında, `taskhub` anahtarında saklanır.
Bunun anlamı:

- Veriler o bilgisayardaki **o tarayıcıya** aittir. Başka tarayıcıda veya başka
  makinede görünmezler.
- **"Tarayıcı verilerini temizle" işlemi görevlerini de siler.** Aynı şey
  "çıkışta çerezleri sil" ayarı için de geçerlidir.
- Bazı tarayıcılar `file://` adreslerinde yerel depolamayı hiç açmaz. Böyle bir
  durumda uygulama sessizce kaybetmez: üstte kırmızı bir uyarı şeridi çıkar ve
  görevler yalnızca sekme açık kaldığı sürece durur.

Bu yüzden **JSON yedeği** al: üst çubuktaki ⭳ düğmesi tüm görevleri tek dosyaya
indirir. ⭱ düğmesi onu geri yükler. Son yedeğinin üstünden 14 gün geçerse
uygulama seni uyarır.

Geri yüklerken iki seçenek sunulur:

- **Değiştir** — mevcut liste tamamen yedekteki hâliyle değişir.
- **Birleştir** — aynı görevin **daha yeni sürümü kazanır**, yedekte olmayan
  görevlerin korunur. İki bilgisayar arasında dosya taşırken bunu kullan.

**CSV** düğmesi Excel'de açılabilir bir tablo üretir (noktalı virgül ayırıcı +
UTF-8 BOM, Türkçe Excel'de çift tıklayınca sütunlar doğru gelir). CSV tek
yönlüdür — rapor içindir, yedek değildir. Yedek için JSON kullan.

## Silme, tema, dil

- Silinen görev anında gider ama sol altta ~8 saniye **"Geri al"** çıkar.
- Tema düğmesi sistem → açık → koyu arasında döner; ilk açılışta işletim
  sisteminin tercihine uyar.
- `TR` / `EN` düğmesi arayüz dilini anında değiştirir. Tercihlerin kaydedilir.
- `Ctrl+P` ile listeyi yazdırabilirsin; çıktıda araç çubukları ve düğmeler çıkmaz.

## Geliştiriciye not

Tek dosya, sıfır bağımlılık: harici betik, font, ikon veya CDN çağrısı yok.
Ayrı `.js`/`.css` dosyaları bilinçli olarak kullanılmadı — `file://` protokolünde
modül yüklemeleri ve `fetch` çağrıları CORS'a takılır.

Hatası kolay saf fonksiyonlar (`foldTr`, `bucketOf`, `csvEscape`, `mergeImport`,
`sortTasks`, `normalizeTask`) yerleşik bir iddia setiyle sınanır:

```
index.html?test=1     → 46 iddia, geçen/kalan dökümüyle
index.html?nostorage=1 → depolama uyarı şeridini görmek için
```

Arama, Türkçe locale küçültmesi (`toLocaleLowerCase("tr")`) yerine harf katlama
kullanır: o locale `I→ı` ve `İ→i` eşlediğinden "istanbul" araması "İstanbul"u
bulamazdı. `foldTr` ı/İ/I/i harflerini tek havuza indirir, ş/ğ/ç/ö/ü işaretlerini
soyar. Tarih aritmetiği yerel saatledir; `Date.parse("YYYY-MM-DD")` UTC yorumlayıp
günü kaydırdığı için doğrudan kullanılmaz.

## Kapsam dışı

Tekrarlayan görevler, çöp kutusu, hatırlatma bildirimleri (sayfa kapalıyken uyarı
gelmez), takvim ve pano görünümü, cihazlar arası senkronizasyon.
