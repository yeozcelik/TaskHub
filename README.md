# TaskHub

Çevrimdışı bilgisayarlar için tek dosyalık görev listesi **ve not defteri**.
Kurulum yok, sunucu yok, internet yok — `index.html` dosyasına çift tıkla, açılsın.

Üstteki **Görevler / Notlar** sekmeleriyle iki bölüm arasında geçersin.

## Görevler

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

## Notlar

OneNote tarzı, iki seviyeli: **defter → sayfa**. Solda defterler, ortada seçili
defterin sayfaları, sağda yazdığın alan.

Biçimlendirme araç çubuğu: kalın, italik, altı/üstü çizili, üç başlık düzeyi,
madde ve numaralı liste, yapılacak maddesi, alıntı, kod, dört vurgu rengi,
bağlantı, resim. **Kaydet düğmesi yok**, yazdıkça kaydedilir.

- **Yapılacak maddesi**: listedeki bir satıra araç çubuğundan kutucuk ekle;
  kutucuğa tıklayınca tamamlanır.
- **Vurgu paragraf sonunda biter.** Kalın ve italik yeni satıra taşınır (Ctrl+B
  ile kapatabilirsin) ama vurgu bir kip değil, kalemle işaretlemedir.
- **Resim**: yapıştır ya da sürükle. En uzun kenarı 1200 piksele indirilip
  sıkıştırılır — 4 MB'lık bir ekran görüntüsü ~20 KB'a iner. Resme tıklayınca
  boyut ve silme seçenekleri çıkar.
- **Nottan görev**: editörde bir satırı seç, araç çubuğundaki son düğmeye bas.
  Görev listesine düşer, notta bağlantı işareti kalır, görev panelinden nota
  tek tıkla dönersin.
- `N` yeni sayfa, `/` arama, `Esc` çıkış. Arama başlıkta ve sayfa içeriğinde
  çalışır, Türkçe harflere duyarsızdır ("istanbul" → "İstanbul").

### Dışarıdan yapıştırdığın içerik temizlenir

Web'den kopyaladığın metni yapıştırdığında biçimi korunur ama HTML'i bir izin
listesinden geçer: betikler, olay nitelikleri, `style`, çerçeveler ve
`javascript:` bağlantıları atılır. Bu isteğe bağlı bir ayar değil — süzgeç
olmasa, yapıştırdığın içerik dosyana kod taşıyabilir ve o kod sen notu her
açtığında çalışırdı.

Bunun bir bedeli var: **tablo yapıştırırsan düzeni gider, metni kalır.**
Bilinçli takas — izin listesini dar tutup sonra genişletmek güvenli, tersi değil.

### Depolama göstergesi

Defter listesinin altında ne kadar yer kullandığın yazar. Notlar görevlerden çok
daha büyüktür ve tarayıcı bütçesi ~5 MB'tır; %80'i geçince uyarı çıkar, %95'ten
sonra resim eklenmez. Notlar **ayrı bir anahtarda** saklanır: notlar bütçeyi
doldursa bile görevlerin kaydedilmeye devam eder.

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

JSON yedeği **hem görevleri hem notları** taşır. Birleştirmede defterler iki
kademede eşleşir: defter adı için yeni sürüm kazanır, sayfalar tek tek
karşılaştırılır — böylece yalnızca bir tarafta bulunan sayfa kaybolmaz.

Görünüme göre üçüncü bir dışa aktarma düğmesi çıkar:

- **Görevler sekmesinde CSV** — Excel'de açılabilir tablo (noktalı virgül
  ayırıcı + UTF-8 BOM, Türkçe Excel'de çift tıklayınca sütunlar doğru gelir).
- **Notlar sekmesinde HTML** — tüm defterler tek bir kendi kendine yeten dosyaya
  dökülür; resimler içinde gömülü gelir, herhangi bir tarayıcıda açılır ve
  yazdırılır. Zengin metnin kendi biçimine kilitlenmesine karşı çıkış kapısıdır.

İkisi de tek yönlüdür — rapor içindir, yedek değildir. Yedek için JSON kullan.

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

Hatası kolay saf fonksiyonlar (`sanitizeHtml`, `noteText`, `foldTr`, `bucketOf`,
`csvEscape`, `mergeImport`, `mergeNotebooks`, `sortTasks`, `normalizeTask`,
`normalizeNotebook`) yerleşik bir iddia setiyle sınanır:

```
index.html?test=1      → 104 iddia, geçen/kalan dökümüyle
index.html?nostorage=1 → depolama uyarı şeridini görmek için
```

Editör yalnızca açık sayfa değiştiğinde yeniden kurulur; her çizimde kurulsaydı
imleç her tuşta başa atardı. Editördeki ham HTML modele her tuşta değil,
kaydetme anında (`flushEditor`) süzülerek yazılır — geri yazma olmadığı için
imleç güvende, süzgeç de tuş başına değil kayıt başına bir kez çalışır.

`document.execCommand` resmen "deprecated" ama bugün tüm tarayıcılarda çalışıyor
ve kütüphanesiz tek pratik yol. Riski sınırlı: ona bağımlı olan şey düzenleme
komutları, içerik değil — kayıtlı veri düz HTML olduğu için execCommand bir gün
çalışmasa bile notlar okunabilir kalır.

Arama, Türkçe locale küçültmesi (`toLocaleLowerCase("tr")`) yerine harf katlama
kullanır: o locale `I→ı` ve `İ→i` eşlediğinden "istanbul" araması "İstanbul"u
bulamazdı. `foldTr` ı/İ/I/i harflerini tek havuza indirir, ş/ğ/ç/ö/ü işaretlerini
soyar. Tarih aritmetiği yerel saatledir; `Date.parse("YYYY-MM-DD")` UTC yorumlayıp
günü kaydırdığı için doğrudan kullanılmaz.

## Kapsam dışı

Tekrarlayan görevler, çöp kutusu, hatırlatma bildirimleri (sayfa kapalıyken uyarı
gelmez), takvim ve pano görünümü, cihazlar arası senkronizasyon.

Notlar tarafında: üçüncü seviye (bölüm), çizim/kalem, ses kaydı, sayfa şablonu,
sürüm geçmişi, tablo düzeni.
