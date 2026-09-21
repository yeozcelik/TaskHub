# TaskHub

Çevrimdışı bilgisayarlar için tek dosyalık görev listesi **ve serbest not defteri**.
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
| `Ctrl/⌘ + K` | Komut paleti |
| `N` | Yeni görev kutusuna geç (notlarda: yeni sayfa) |
| `/` | Aramaya geç |
| `Esc` | Seçimi temizle → paneli kapat → aramayı temizle |
| `Enter` | Görevi, etiketi veya alt görevi ekle |
| `↑` `↓` | Kartlar arasında gez (kart odaktayken) |
| `Shift + ↑/↓` | Seçimi genişlet |
| `X` | Kartı seç / seçimi kaldır |
| `Alt + ↑/↓` | **Kartı önceki/sonraki gruba taşı** |

### Sürükleyerek taşıma

Kartın sol kenarındaki tutamaktan sürükleyip **başka bir gruba bırak**: listede
grup son tarihi belirler (Bugün, Yarın, Önümüzdeki 7 gün, Sonra, Tarihsiz),
panoda önceliği. "Tamamlananlar"a bırakmak görevi bitirir. Birden çok görev
seçiliyse hepsi birlikte taşınır ve tek adımda geri alınır.

Sürükleme **grup içinde yeniden sıralama yapmaz**: grup içi sıra türetilmiştir
(tarih → öncelik → oluşturma), saklanmaz. Gerekçe:
`docs/adr/0003-surukle-birak-yeniden-gruplamadir.md`. Fare kullanmıyorsan
`Alt + ↑/↓` aynı işi yapar.

### Gruplar

Görevler son tarihlerine göre kendiliğinden gruplanır: **Gecikmiş → Bugün → Yarın
→ Önümüzdeki 7 gün → Sonra → Tarihsiz → Tamamlananlar.** "Önümüzdeki 7 gün",
takvim haftası değil, bugünden itibaren kayan yedi günlük penceredir. Sekme
günlerce açık kalsa bile gruplar gece yarısında kendiliğinden tazelenir.

## Notlar

OneNote tarzı, üç seviyeli: **defter → sayfa → tuval**. Solda defterler, ortada
seçili defterin sayfaları, sağda sayfanın tuvali.

### Sayfa bir belge değil, bir tuval

**Boş bir yere tıkla, not oradan başlasın.** Sayfa yukarıdan aşağı akan tek bir
metin değil; her notun kendi koordinatı olduğu bir yüzey. Bir köşeye toplantı
maddeleri, öbür köşeye fikirler, aşağıya hatırlatma yazarsın; sıraya girmeleri
gerekmez.

- **Kutu açmak**: tuvalde boş bir yere tıkla. İmleç oraya iner. Faresiz yol:
  araç çubuğunun ilk düğmesi görünen alanın sol üstüne yeni kutu koyar.
- **Taşımak**: kutunun üstünde beliren tutma çubuğundan sürükle. Klavyeyle
  `Alt+ok` (16 piksel), ince ayar için `Alt+Shift+ok` (4 piksel).
- **Genişletmek**: sağ kenardaki tutamağı sürükle. Yükseklik içeriğe göre
  kendiliğinden ayarlanır.
- **Silmek**: kutunun sağ üstündeki ✕. Doluysa "Geri al" çıkar, `Ctrl+Z` de
  geri getirir.
- **Boş kutu saklanmaz**: yazmadan başka yere tıklarsan kutu sessizce kaybolur.
  Yazılmamış bir kutu içerik değil, imlecin o an durduğu yerdir.
- **Tuval biter mi**: bitmez. En dıştaki kutunun ötesinde her zaman boş alan
  bırakılır; sağa ve aşağı kaydırdıkça uzar.
- **Izgara**: araç çubuğunun son düğmesi arkadaki nokta ızgarasını açıp kapatır.
  Tercih kaydedilir.
- **Dar ekran**: 600 pikselin altında araç çubuğu sarmak yerine tek satırda
  yatay kayar — üç satıra sarınca tuvale kalan yeri yiyordu.
- **Nereye tıklarsan tıkla taşmaz**: sağ kenara yakın açılan kutu, görünen alana
  sığacak kadar daraltılır — ilk harften önce yatay kaydırma açılmaz.

Biçimlendirme araç çubuğu: yeni kutu, geri/ileri al, kalın, italik, altı/üstü
çizili, üç başlık düzeyi, madde ve numaralı liste, yapılacak maddesi, alıntı,
kod, **vurgu**, **tablo**, **yazı rengi**, **punto**, bağlantı, resim, biçimi
temizle, nottan görev, ızgara. Komutlar **o an yazdığın kutuya** uygulanır;
hiç kutu yoksa bir tane açılır. **Kaydet düğmesi yok**, yazdıkça kaydedilir.

Son açık defter ve sayfa hatırlanır: uygulamayı açtığında kaldığın yerden
devam edersin.

- **Geri alma**: `Ctrl+Z` geri, `Ctrl+Y` (ya da `Ctrl+Shift+Z`) ileri. Yazma,
  biçimlendirme, vurgu, kutucuk, resim ekleme/silme/boyutlandırma **ve kutu
  taşıma / genişletme / silme** — hepsi kapsam içinde, tek yığında. Art arda
  yazdıkların tek adımda birleşir; her sayfanın kendi geçmişi vardır ve sayfalar
  arasında gidip gelince kaybolmaz.
- **Yapılacak maddesi**: listedeki bir satıra araç çubuğundan kutucuk ekle;
  kutucuğa tıklayınca tamamlanır.
- **Vurgu paragraf sonunda biter.** Kalın ve italik yeni satıra taşınır (Ctrl+B
  ile kapatabilirsin) ama vurgu bir kip değil, kalemle işaretlemedir.
- **Sayfa silme**: sayfa listesinde üzerine gelince çıkan çöp kutusundan ya da
  editörde başlığın yanındaki düğmeden. Her ikisi de "Geri al" bildirimi verir
  ve sayfayı özgün sırasına koyar.
- **Resim**: yapıştır ya da sürükle. Tuvalin boş bir yerine bıraktığın resim,
  **bıraktığın noktada** yeni bir kutu açar. En uzun kenarı 1600 piksele indirilip
  sıkıştırılır — 4 MB'lık bir ekran görüntüsü ~20 KB'a iner. Saydamlığı olan
  PNG'ler PNG kalır; 512 KB'a kadar GIF'lere hiç dokunulmaz, animasyonu korunur.
- **Resim boyutu**: resme tıkla, köşelerdeki tutamaklardan sürükle. Oran korunur,
  `Esc` sürüklemeyi iptal eder, çift tıklama asıl boyuta döndürür. Baloncukta
  hazır boyutlar ve silme de var. Boyut değişiklikleri geri alınabilir.
- **Tablo**: araç çubuğundaki tablo düğmesi ızgara açar, en fazla 10×10 seçersin;
  ilk satırı başlık yapma seçeneği var. İmleç tablodayken aynı menüden satır/sütun
  ekleyip silersin, `Tab` bir sonraki hücreye geçer, son hücrede yeni satır açar.
  Son satır ya da sütun silinince tablo tümden kaldırılır.
  **Birleştirilmiş hücre içeren tabloda satır/sütun düzenleme kapalıdır** — tam
  bir ızgara modeli yazmadan bunu yapmak düzeni sessizce bozardı; yapıştırılan
  birleşik hücreler korunur, yalnızca düzenleme kısıtlanır. Tablo içine tablo
  eklenemez.
- **Sayfa sıralama**: sayfaları sürükleyerek taşı, ya da satırdaki yukarı/aşağı
  düğmeleriyle. Klavyeyle: sayfa listesi odaklıyken `Alt+↑` / `Alt+↓`. Arama
  açıkken sıralama kapalıdır — görünen sıra gerçek sıra olmadığı için yanıltırdı.
- **Nottan görev**: editörde bir satırı seç, araç çubuğundaki son düğmeye bas.
  Görev listesine düşer, notta bağlantı işareti kalır, görev panelinden nota
  tek tıkla dönersin.
- `N` yeni sayfa, `/` arama, `Esc` kutudan çık. Arama başlıkta ve **bütün
  kutuların içinde** çalışır, Türkçe harflere duyarsızdır ("istanbul" →
  "İstanbul"). Arama ve önizleme kutuları okuma sırasına dizer: önce yukarıdan
  aşağı, eşitlikte soldan sağa.

### Word / OneNote'tan yapıştırma

**Korunanlar:** kalın, italik, altı/üstü çizili, başlıklar, yazı rengi, vurgu
(zemin rengi), punto (beş kademeye yuvarlanır), bağlantılar, **tablolar**
(`colspan`/`rowspan` dahil) ve tek seviyeli madde/numaralı listeler.

**Bilerek korunmayanlar:** yazı tipi aileleri, kenar boşlukları, satır aralıkları,
sütun genişlikleri. Sayfa Word'deki gibi *görünmez* — biçimi taşır, düzenini değil.

**Listelerde dürüst sınır:** Word listeleri gerçek liste değil, sahte işaretçili
paragraflardır. Tek seviyeli madde ve `1.` `2.` biçimindeki numaralı listeler
gerçek listeye çevrilir. Çok seviyeli listeler, `a.` / `IV.` gibi biçimler ve
1'den farklı başlangıçlar **paragraf olarak korunur** — kaybolmaz ama liste olmaz.
Word'ün işaretçi çöpü ("·", "o") metinden temizlenir.

**Resimler:** Word resimleri `file:///…` yerel yollarıyla taşır ve bu yollar
güvenlik süzgecinden geçemez. Panoda gerçek bir resim dosyası varsa **metnin
sonuna** eklenir — özgün konumu korunamaz ve bu sana söylenir. Kurtarılamayanlar
sessizce yutulmaz, "N resim aktarılamadı" uyarısı çıkar.

#### Bende çalışmazsa

Masaüstü Word'ün panoya tam olarak ne koyduğu sürüme ve ayarlara göre değişir ve
bu geliştirme ortamında gerçek Word yok. `index.html?clipdebug=1` adresini aç,
Word'den kopyaladığını oradaki kutuya yapıştır: panonun ham HTML'ini, bizim
çevirimizin sonucunu ve saklanacak hâli yan yana görürsün. "Ham HTML'i kopyala"
ile bana gönderirsen test fikstürü olarak eklerim.

Elle sınamaya değer matris: Word masaüstü / OneNote masaüstü / Word Web / normal
web sayfası × Chrome ve Edge × `file://`.

### Dışarıdan yapıştırdığın içerik temizlenir

Web'den kopyaladığın metni yapıştırdığında biçimi korunur ama HTML'i bir izin
listesinden geçer: betikler, olay nitelikleri, `style`, çerçeveler ve
`javascript:` bağlantıları atılır. Bu isteğe bağlı bir ayar değil — süzgeç
olmasa, yapıştırdığın içerik dosyana kod taşıyabilir ve o kod sen notu her
açtığında çalışırdı.

Renk için dar bir geçit var: yalnızca `color` ve `background-color`, değeri
`#rrggbb` / `rgb()` / temel renk adı kalıbına uyuyorsa. Değer **yeniden
üretilerek** yazılır, ham stil dizesi hiçbir yoldan geçmez — bu yüzden
`position:fixed`, `url(javascript:…)`, `expression()` ve `behavior:` düşmeye
devam eder. `rgba()`, `hsl()`, yüzdeli değerler ve `transparent` bilerek
desteklenmiyor.

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
  Tuvaldeki serbest konum kâğıda taşınmaz: kutular okuma sırasına dizilip ayrı
  bloklar olarak yazılır. `Ctrl+P` ile yazdırma da aynı yolu izler — üst üste
  binen kutular sayfa sonlarında okunmaz hale gelirdi.

İkisi de tek yönlüdür — rapor içindir, yedek değildir. Yedek için JSON kullan.

## Silme, tema, dil

- Silinen görev anında gider ama sol altta ~8 saniye **"Geri al"** çıkar.
- Tema düğmesi sistem → açık → koyu arasında döner; ilk açılışta işletim
  sisteminin tercihine uyar.
- `TR` / `EN` düğmesi arayüz dilini anında değiştirir. Tercihlerin kaydedilir.
- `Ctrl+P` ile listeyi yazdırabilirsin; çıktıda araç çubukları ve düğmeler çıkmaz.

## Erişilebilirlik

Arayüz, dört genişlikte (320 / 768 / 1024 / 1440) ve iki temada **axe-core** ile
taranır; WCAG 2.1 A + AA kuralları için sıfır ihlal hedeflenir.

- **Renk tokenları ölçülerek seçildi.** `--muted` ve `--faint`, kullanıldıkları
  **en koyu açık zemine** (`--accent-soft`) göre 4.5:1'i geçecek biçimde
  belirlendi. Daha açık griler "incelikli" görünüyordu ama 11-12 piksellik
  etiketleri okunmaz yapıyordu (eski `--faint` her zeminde 2.6–3.1:1'de kalıyordu).
- **Her not kutusunun kendi adı var**: "Not kutusu 1", "Not kutusu 2"… Numaralama
  DOM sırasına göre değil **okuma sırasına** göre yapılır; DOM sırası sürüklemede
  öne alma yüzünden değişir, konum ise kutunun kimliğidir.
- Kutu gövdesi ve silme düğmesi klavyeyle odaklanabilir; taşıma için `Alt+ok`.
- Gizli dosya girdileri erişilebilirlik ağacında adsız durmaz ve sekme sırasında
  yer kaplamaz.

## Geliştiriciye not

Tek dosya, sıfır bağımlılık: harici betik, font, ikon veya CDN çağrısı yok.
Ayrı `.js`/`.css` dosyaları bilinçli olarak kullanılmadı — `file://` protokolünde
modül yüklemeleri ve `fetch` çağrıları CORS'a takılır.

Hatası kolay saf fonksiyonlar (`sanitizeHtml`, `noteText`, `foldTr`, `bucketOf`,
`csvEscape`, `mergeImport`, `mergeNotebooks`, `sortTasks`, `normalizeTask`,
`normalizeNotebook`, `normalizeNotePage`, `boxesInReadingOrder`,
`packImages`/`unpackImages`, `presentationalToSemantic`, `normColor`,
`normFontSize`) yerleşik bir iddia setiyle sınanır:

```
index.html?test=1      → 222 iddia, geçen/kalan dökümüyle
index.html?nostorage=1 → depolama uyarı şeridini görmek için
index.html?clipdebug=1 → panonun ham içeriğini incelemek için
```

Editör yalnızca açık sayfa değiştiğinde yeniden kurulur; her çizimde kurulsaydı
imleç her tuşta başa atardı. Editördeki ham HTML modele her tuşta değil,
kaydetme anında (`flushEditor`) süzülerek yazılır — geri yazma olmadığı için
imleç güvende, süzgeç de tuş başına değil kayıt başına bir kez çalışır.

**Tuval, iki şema değil tek şema.** Sayfanın `html` alanı yerini konumlu
kutuların dizisine bıraktı: `boxes: [{ id, x, y, w, html }]`. "Akan belge" ve
"serbest yerleşim" diye iki kip tutulabilirdi; tutulmadı, çünkü o zaman her
özellik (araç çubuğu, geri alma, arama, dışa aktarma, nottan görev) iki yoldan
geçmek zorunda kalırdı. Eski tek `html` alanı okunmaya devam eder ve yüklenirken
ilk kutuya dönüşür (`normalizeNotePage`), böylece eski localStorage kaydı ve eski
JSON yedekleri kaybolmaz.

**Geri almanın kökü kutu değil, tuvaldir.** Anlık görüntü `#editor`in (yani
tuvalin) `innerHTML`i olduğu için her kutunun konumu ve genişliği de görüntüye
girer; taşıma, genişletme, kutu açma ve silme metinle **aynı** yığına düşer ve
ikinci bir geri alma mekanizması yazmak gerekmez. Bunun bedeli, geri alma
kutuları `innerHTML` ile yeniden kurduğunda kutulara takılı olay dinleyicilerinin
kaybolmasıdır — bu yüzden bütün olaylar (yazma, yapıştırma, tıklama, sürükleme)
tek tek kutulara değil, **tuvale delegasyonla** bağlanır. Aynı sebeple tuvalin
içine süs konmaz: boş sayfa ipucu bile tuvalin değil, kaydırma kabının çocuğudur.

Boş kutu açmak ve boş kutuyu toplamak **geri alma adımı açmaz** (yalnızca taban
`lastHtml` güncellenir). Açsaydı `Ctrl+Z`, ekranda hiçbir şeyi değiştirmeyen
adımlarla dolardı. Aynı gerekçeyle boş kutular `readBoxes` aşamasında
saklanmaz — yoksa her açılışta hayalet kutular birikirdi.

Word biçimi `style` nitelikleriyle gelir ve süzgeç `style`'ı atar; bu yüzden
araya `presentationalToSemantic` girer: **atmadan önce** niteliğin anlamını okuyup
izinli etiketlere çevirir. Naif "öğeyi `<b>` ile sar" yaklaşımı iç içe çelişen
stillerde bozulduğu için (`font-weight:700` içindeki `400` temsil edilemez) çeviri
çalışma tabanlıdır: her metin parçasının etkin biçimi atalardan hesaplanır ve
çıktı sabit bir sırayla sıfırdan üretilir. İdempotentlik bunun sonucudur ve
`f(f(x)) === f(x)` bir kabul kriteri olarak sınanır.

Geri alma tarayıcının kendi yığınına bırakılamadı: o yığın yalnızca
`execCommand`'i ve doğal yazmayı görür, oysa vurgu, kutucuk ve resim işlemleri
DOM'u doğrudan değiştiriyor. Bu yüzden sayfa başına anlık görüntü yığını var.
Görüntülerde resim verisi **tekrarlanmaz** — her data URL içerik anahtarıyla tek
bir haritada tutulur, geçmişte yalnızca `ref:` yer tutucusu durur; aksi halde tek
bir resim her tuş vuruşunda yeniden kopyalanırdı. Bellek bütçesi uygulama
genelindedir (12 MB), sayfa başına 80 adımla sınırlıdır ve budama önce aktif
olmayan sayfalardan yapılır.

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
sürüm geçmişi, alt sayfa. Tuvalde: kutuları birbirine bağlayan oklar, kutu
arkaplan rengi, hizalama kılavuzu, yakınlaştırma.

Tablolarda birleştirilmiş hücre **oluşturma** (yapıştırılanlar korunur), iç içe
tablo, sütun genişliği ayarı.
