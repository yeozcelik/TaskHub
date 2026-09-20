# Ölçüm: görev listesi çizim bütçesi (T2.2 / T2.3)

**Tarih:** 2026-09-20 · **Koşum:** `node tools/probe/perf.mjs` (Chromium 141, `file://`, 5.000 görev)

## Ne ölçüldü

Arama kutusuna harf harf yazmayı taklit eden 10 çizim, iki kipte: **artımlı**
(yeni uzlaştırıcı) ve **tam yıkım** (çizim durumu sıfırlanarak eski davranış
zorlanır). Aynı derleme, aynı sayfa, aynı veri — iki sürüm derlemeye gerek yok.

## Adım adım (artımlı)

| Sorgu | Görünen kart | Eklenen düğüm | Silinen | Veri hattı (ms) | Toplam (ms) |
|---|---|---|---|---|---|
| `"r"`     | 2000 | 3    | 3003 | 10,4 | 52 |
| `"ra"`    | 1000 | 3    | 1003 | 8,0  | 19 |
| `"rap"`   | 500  | 3    | 503  | 5,8  | 12 |
| `"rapo"`  | 500  | **3**| 3    | 5,2  | **5,5** |
| `"rapor"` | 500  | **3**| 3    | 5,1  | **5,1** |
| `"rapo"`  | 500  | **3**| 3    | 4,7  | **5,2** |
| `"rap"`   | 500  | **3**| 3    | 4,9  | **5,6** |
| `"ra"`    | 1000 | 503  | 3    | 5,3  | 57 |
| `"r"`     | 2000 | 1003 | 3    | 8,8  | 114 |
| `""`      | 5000 | 3003 | 3    | 12,0 | **338–493** |

## Sonuç

| | Artımlı | Tam yıkım |
|---|---|---|
| Eklenen düğüm, **medyan** | **3** | 1006 |
| Eklenen düğüm, toplam | 4.530 | 13.560 |

**S4 karşılandı:** medyanda **335 kat** daha az düğüm. Yazarken listenin tamamı
artık yeniden kurulmuyor.

## S3, ölçüldüğünde ikiye ayrıldı

Tek bir "tuş başına < 16 ms" eşiği yazılmıştı. Ölçüm, bu eşiğin **iki farklı
rejimi** karıştırdığını gösterdi:

- **S3a — küçük delta (normal yazma).** Kart sayısı değişmiyor, yalnız içerik
  tazeleniyor. p95 = **5,9 ms**. Bütçenin üçte biri. Uzlaştırıcının çözdüğü
  problem tam olarak budur ve çözülmüştür.
- **S3b — toplu geçiş (filtre temizleme).** 500 karttan 5.000 karta çıkarken
  **4.500 kart gerçekten inşa edilmek zorunda**. En kötü: 493 ms.

**S3b bir fark algoritması sorunu değildir.** Uzlaştırıcı zaten en az sayıda
işlem üretiyor (kanıt: `tests/list-diff.test.js`, 3.000 rastgele durum). Darboğaz
düğüm *inşası*: **~0,164 ms/kart**. Bu sayı doğrudan tasarım parametresini verir:

> 16 ms'lik bir kareye **≈ 97 kart** sığar.

Yani 5.000 kartı aynı anda DOM'a koymak yanlış tasarımdır; doğru çözüm
**pencereleme** — yalnız görünür alana yakın olanı çizmek. Bu, Linear ve
Todoist'in de yaptığı şey.

## Eşik düşürülmedi

S3b silinmedi, gevşetilmedi ya da "kabul edilebilir" ilan edilmedi. **Açık bir
kapı olarak duruyor** (görev T2.3b) ve `perf.mjs` her koşumda güncel sayıyı
basıyor; gerileme görünür olur. CI'da şimdilik **S3a ve S4 zorunlu**, S3b
raporlanıyor.

## Yan bulgu: silmek ucuz, inşa etmek pahalı

3.003 düğüm silmek 52 ms, 3.003 düğüm eklemek 338–493 ms. Yaklaşık **7 kat**
fark. Pencereleme tasarımında bu işe yarar: pencereden çıkanı atmak ucuzdur,
asıl bütçe pencereye gireni inşa etmekte harcanır.

## Yan bulgu: veri hattının payı küçük ama sabit

Süzme + kovalama + sıralama 5.000 görevde **4,7–12 ms**. Küçük deltalı çizimin
toplam süresinin (**5,1 ms**) neredeyse tamamı bu. Yani pencereleme geldikten
sonra bir sonraki darboğaz veri hattı olacak — o zaman ölçülür, şimdi değil.

## Ölçüm gürültüsü — ve pencere boyutunun buna göre seçilmesi

Aynı koşum tekrarlandığında kart maliyeti **0,164–0,193 ms** arasında değişti
(türetilen pencere boyutu 97 → 82). Paylaşılan/sanallaştırılmış bir makinede bu
beklenen bir salınım.

Sonuç: pencere boyutu **tek bir ölçümden sabitlenmemeli**. T2.3b, en kötü
gözlemlenen maliyeti (0,193 ms/kart) esas alıp güvenlik payıyla **~64 kart**
civarında bir pencere seçmeli, ya da kareyi aşmadan artımlı doldurmalı
(`requestIdleCallback` — ölçüldü, `file://` üzerinde mevcut). Sabit sayı
seçilecekse dayanağı en kötü ölçüm olmalı, ortalaması değil.

S3a'nın payı bu gürültüye karşı sağlam: 5,9–7,1 ms, bütçenin yarısının altında.

---

# EK — T2.3b sonucu: pencereleme GEREKMEDİ (2026-09-20)

Yukarıdaki bölüm "doğru çözüm **pencereleme**" diye bitiyordu. Ölçüm bu
tahmini çürüttü. Aşağıdaki her sayı `tools/probe/` altındaki koşumlardan;
hiçbiri tahmin değil.

## 1. Pencereleme neden seçilmedi

İki aday ölçüldü, ikisi de reddedildi:

| aday | ölçüm | karar |
|---|---|---|
| `content-visibility: auto` | kaydırma p50 **16,9 → 32,7 ms** | ❌ daha kötü |
| gerçek pencereleme | (uygulanmadı) | ❌ kabul ölçütlerinin yarısını yıkıyor |

Pencereleme, T2.3b'nin kendi kabul ölçütlerinden dördünü ihlal ederdi:
`Ctrl+F` çizilmemiş kartı bulamaz, klavye ona ulaşamaz, yazdırma yarım kalır,
ekran okuyucu yanlış sayar. Sözleşmede "erişilebilirlik gerilemez" yazıyor;
pencereleme bir iyileştirme değil, bir **gerileme** olurdu.

Seçilen yol: **parçalı (aşamalı) çizim**. Her kart eninde sonunda DOM'a girer;
yalnız *ne zaman* girdiği kareye bölünür.

## 2. Asıl darboğaz inşa değil, SİLME çıktı

Yukarıdaki "silmek ucuz, inşa etmek pahalı" yan bulgusu **eksikti**: orada
ölçülen, kuyruk devreye girmeden önceki toplam süreydi. Kart inşası kuyruğa
alındıktan sonra en büyük tek bloklama kalemi silme oldu — 5.000 görevde
"r" → "ra" geçişinde tek başına **22,6 ms**.

Silmenin ucuzlatılıp ucuzlatılamayacağı gerçek kartlarla ölçüldü
(kart = **21 DOM düğümü**):

| yol | ölçüm | düğüm başına |
|---|---|---|
| 1.000 kartı tek tek `remove()` | **26,0 ms** | ~1,2 µs |
| 3.895 kartı `textContent = ""` | **51,4 ms** | ~0,73 µs |
| kabı boş klonuyla `replaceWith` | **56,3 ms** | — |
| 1.000 karta `display:none` | JS 1,7 ms **+ sonraki düzen 50,9 ms** | — |

Doğrusallık da doğrulandı: 250 → 4,5 ms · 500 → 7,4 ms · 2.000 → 29,5 ms.

**Sonuç: silme maliyeti indirilemez, yalnızca bölünebilir.** Maliyet alt ağacın
düğüm sayısıyla orantılı ve hiçbir DOM yolu bundan kaçmıyor. Bu, kodda duran
"toplu boşaltma" sezgisini de çürüttü: `textContent = ""` düğüm başına yalnız
~%25 ucuz, üstelik KALAN kartları da yıkıyor. O sezgi kaldırıldı — dayandığı
94 ms ölçümü doğruydu ama karşılaştırıldığı alternatif hiç ölçülmemişti.

## 3. Veri hattı: tahmin tuttu

Yukarıda "bir sonraki darboğaz veri hattı olacak" yazıyordu. Oldu. 5.000
görevde ayrıştırıldı:

| adım | süre | notu |
|---|---|---|
| `listGroups` toplam | 7,7–10,5 ms | |
| · kovalama (`bucketOf`) | 5,1–6,2 ms | |
| · · bunun `parseYmd` payı | **4,7–6,0 ms** | görev başına İKİ ayrıştırma |
| · sıralama | 3,4–4,1 ms | |
| · · bunun `ts(createdAt)` payı | 1,2–1,6 ms | görev başına bir `Date.parse` |
| süzme (dolu sorgu) | 2,7–3,4 ms | sorgu görev başına yeniden katlanıyordu |

Dördü de **hatırlama** ile çözüldü; hiçbiri algoritma değiştirmedi:
`daysBetween` iki katmanlı önbellek, `ts` dize→sayı önbelleği, sorgu terimleri
çizim başına bir kez derleniyor, `diffChildren` kutulu dizi yerine
`Int32Array`/`Uint8Array` kullanıyor.

## 4. Yan ürün: sessiz bir SIRALAMA hatası

Kuyruk devreye girince `diffChildren`'ın sağdan-sola sözleşmesi bozuldu:
taşıma eşzamanlı, inşa kuyrukluyken bir taşımanın çengeli henüz kurulmamış
karta denk gelip kartı SONA atıyordu. `[A,B,C] → [B,D,A,C]` çizimi
`[D,A,B,C]` veriyordu — hiçbir şey patlamıyor, yalnız sıra yanlış.

Aynı kusurun ikinci yüzü görünürdü: liste **alttan yukarı** doluyordu, yani
ekranda duran üst kısım en son geliyordu.

Düzeltme: taşıma da inşa da tek kuyruğa, **soldan sağa**, ÖNCEKİ kardeşe
çengelli. Tümevarım: i işlendikten sonra `keys[0..i]` doğru sıradadır, çünkü
`keys[i-1]` ya yerinde kalmıştır (LIS) ya da bir adım önce konmuştur.
`behavior.mjs` bu senaryoyu artık kilitliyor; kapı kasten bozularak sınandı
(yerleştirme sağdan sola çevrildi → iddia kırmızıya döndü).

## 5. Ayırma (çöp) — ve çürüttüğüm kendi hipotezim

İlk geçişten sonra en kötü kare 12,6-15,9 ms arasında **dalgalanıyordu**; 12
koşumun ikisi bütçenin hemen altındaydı. Bu dalgalanmanın kaynağı iş miktarı
değil **çöp toplamaydı** — dolayısıyla soru "ne kadar iş" değil, "çizim başına
kaç nesne ayrılıyor" oldu.

İlk hipotezim yanlış çıktı. Kuyruğa atılan kapanışları (closure) suçladım;
ölçtüm:

| çizim başına 3.000 öğe | süre |
|---|---|
| kapanış ayırmak | **0,30 ms** |
| paralel dizilere yazmak | 0,10 ms |
| nesne kaydı ayırmak | ~0 ms |

Yani kuyruğu "düz kayıtlara" çevirmek en fazla 0,3 ms kazandıracaktı —
**karmaşıklığa değmez**, yapılmadı. Ölçmeseydim yapacaktım.

Gerçek ayırma kaynakları ölçümle bulundu (5.000 görev, 7 koşumun en iyisi):

| aday | süre | ne ayırıyordu |
|---|---|---|
| `cardSig × 5.000` | **2,60 ms** | kart başına 3 geçici dizi (`filter`, dizi, `join`) |
| `listGroups` | **2,60 ms** | `sortTasks` öğe başına bir süs NESNESİ |
| `diffChildren` | 1,90 ms | (zaten tipli dizilere çevrilmişti) |
| `keys` + `byKey` | 0,40 ms | |
| kapanışlar | 0,10 ms | |

İkisi de ayırmasız yeniden yazıldı: `sortTasks` artık nesneleri değil
**konumları** sıralıyor (anahtarlar `Uint8Array`/`Float64Array`'de), `cardSig`
dizeyi doğrudan birleştiriyor. Sıra tanımı ve imza dizesi zerre değişmedi;
`sortTasks`'ın eski yazımı testte **referans uygulama** olarak duruyor ve 400
rastgele girdide iki çıktı birebir karşılaştırılıyor.

## 6. Sonuç ve SINIR

5.000 görevde **en kötü tek kare: 30,50 ms → 10,2-13,7 ms** (12 koşum).
Bütçe 16 ms. S3b kapandı.

| aşama | en kötü kare (5.000 görev) |
|---|---|
| başlangıç | 30,50 ms ❌ |
| + parçalı inşa, parçalı silme, veri hattı önbellekleri | 12,6-15,9 ms ⚠️ (dar) |
| + ayırma azaltma (`sortTasks`, `cardSig`) | **10,2-13,7 ms** ✅ |

Kapasite taraması (en kötü kare, bütçe 16 ms):

| görev | 1.000 | 2.000 | **5.000** | 8.000 | 10.000 |
|---|---|---|---|---|---|
| ms | 8,3 | 8,7 | **10,2-13,7** | 16,0-16,4 ⚠️ | 29,7 ❌ |

**Bağlayıcı kısıt artık eşzamanlı O(n) geçişi**: süzme + kovalama + sıralama +
anahtar farkı. Bu geçiş parçalanamıyor, çünkü `rec.keys` güncellenmeden kuyruk
tutarlı olamaz. 8.000 görev sınırın tam üstünde, 10.000'de kareye ilk parça
için hiç yer kalmıyor. 5.000'in ötesine çıkmak gerekirse çözüm pencereleme
değil, **veri hattını da parçalamaktır** — ölçüt 5.000 olduğu için bugün
yapılmadı.

## 7. Ölçüm yönteminin kendisi hakkında

Tek koşum yanıltıcı. Bu çalışmada iki kez tek koşuma bakıp "geçti" dedim;
ikisinde de 12 koşumluk dağılım bunu çürüttü (15,2 ms "geçti" görünen ayar,
12 koşumda iki kez 16,6 ms'de düştü). Bundan sonrası için kural: **kare
bütçesi kararı en az 10 koşumun dağılımına bakılmadan verilmez.**
