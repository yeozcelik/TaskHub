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
