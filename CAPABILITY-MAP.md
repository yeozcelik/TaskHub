# Yetenek Haritası: TaskHub Modernleştirme

> Bu belge **kapıdır**. Modül sınırları, bağımlılık yönü ve inşa sırası onaylanmadan
> hiçbir modül şartnamesi (`SPEC-<id>.md`) yazılmaz, hiçbir kod yazılmaz.
> Yanlış harita pahalıdır; on satır gözden geçirmek değildir.

## Neden harita gerekiyor

"Yazılımı modernleştir" tek bir yetenek değil. Kabul ölçütleri birbirinden bağımsız
doğrulanabilir kümelere ayrışıyor: bir komut paleti, tekrarlayan görevlerden bağımsız
olarak gönderilebilir ve sınanabilir. Tek bir şişkin şartname, aşağıdaki her görevi
sözleşmenin tamamı üzerinde akıl yürütmeye zorlardı.

## Tasarım sözleşmesi — dört referansın çatışması nasıl çözülüyor

Seçilen dört referans ürün aynı felsefeyi paylaşmıyor. Things 3 *azaltarak*,
Notion *çoğaltarak* iyi. İkisini birden "örnek alırsak" ortaya özellik çorbası çıkar.
Çözüm: her referansa **ayrı bir katman** veriliyor, böylece çatışmıyorlar.

| Referans | Hangi yasayı koyar | Yanlışlanabilir kural |
|---|---|---|
| **Things 3 / Reminders** | Varsayılan durum yasası | Varsayılan görünüme (filtre yok, seçim yok) **kalıcı yeni kontrol eklenmez**. Yeni güç çağrılır, sergilenmez. |
| **Linear** | Etkileşim yasası | Klavyeden çağrılamayan yetenek **bitmiş sayılmaz**. Her yeni aksiyon komut paletine kaydolur. |
| **Todoist / TickTick** | Giriş yasası | Bir şey oluşturmak için **yeni kalıcı form açılmaz**. Yakalama tek satır yazıdır; yapıyı ayrıştırıcı kurar. |
| **Notion / Obsidian** | Veri yasası | **Hiçbir görünüm veriye sahip değildir.** Liste, pano ve takvim aynı `state.tasks` üzerine izdüşümdür. |

**Things yasası veto hakkına sahiptir.** Diğer üçü ona karşı bir şey öneriyorsa,
öneri düşer. Notion'un gücü mevcuttur ama görünür değildir.

## Modüller

| Modül id | Sorumluluk | Bağımlı olduğu |
|---|---|---|
| `build` | `src/` altında modüler kaynak; sıfır bağımlılıklı gömücü betik tek `index.html` üretir; Node test koşucusu; CI | — |
| `render` | Anahtarlı artımlı DOM uzlaştırma; çizim zamanlama. Her çizimde tam yıkımın yerini alır | `build` |
| `capture` | Hızlı ekleme kutusunda doğal dil ayrıştırma ("yarın 15:00 !yüksek #iş") — saf fonksiyon | `build` |
| `store` | Depolama soyutlaması: IndexedDB birincil, localStorage geri düşme, geçiş, kota raporlama | `build` |
| `command` | Komut kayıt defteri + `Ctrl/Cmd+K` paleti, Türkçe harf katlamalı eşleme | `render` |
| `select` | Çoklu seçim, aralık seçimi, toplu işlem, geri alma | `render` |
| `views` | Pano (kanban) ve takvim izdüşümleri; kayıtlı akıllı listeler | `render`, `store` |
| `repeat` | Tekrarlayan görevler: kural modeli, sonraki tekrarın üretimi, arayüz | `store`, `capture` |
| `link` | `[[sayfa]]` bağlantıları (görev ↔ not), geri-bağlantı paneli | `store` |
| `motion` | View Transitions, sürükle-bırak sıralama, `prefers-reduced-motion` | `render` |

**İnşa sırası:**

```
build
  ├─→ render ──→ command
  │      ├────→ select
  │      ├────→ views ←──┐
  │      └────→ motion   │
  ├─→ store ─────────────┘
  │      ├────→ repeat ←─┐
  │      └────→ link     │
  └─→ capture ───────────┘
```

Doğrusal sıra: `build` → (`render`, `store`, `capture` — paralel) → (`command`,
`select`, `views`, `repeat`, `link` — paralel) → `motion`

Bağımlılık okları tek yönlüdür, çevrim yoktur.

## Kapsam dışı — ve neden

Bunlar unutulmadı; **bilerek** dışarıda:

| Dışarıda | Gerekçe |
|---|---|
| Cihazlar arası senkronizasyon | Sunucu gerektirir. Seçilen mimari (çevrimdışı, kurulumsuz) bunu dışlar. Ödünç değil, çelişki. |
| Sayfa kapalıyken bildirim | Service worker gerektirir; `file://` üzerinde kaydedilemez. Fiziksel engel, tercih değil. |
| Çizim/kalem, ses kaydı, sürüm geçmişi | Büyük yüzeyler, seçilen üç eksenin hiçbirine denk düşmüyor. |
| **Not tuvalinin çizim yolu** | `render` modülü **yalnız görev listesini** uzlaştırır. Tuvalin geri alma mimarisi `#editor` üzerinde `innerHTML` anlık görüntülerine ve olay delegasyonuna dayanıyor; oraya uzlaştırıcı sokmak geri almayı sessizce bozar. Bu bir sınır, bir eksiklik değil. |

## Onay kapısı

- [ ] Modül sınırları doğru mu?
- [ ] Bağımlılık yönü doğru mu, çevrim var mı?
- [ ] İnşa sırası doğru mu?
- [ ] Tasarım sözleşmesindeki dört yasa ve Things vetosu kabul ediliyor mu?
- [ ] Kapsam dışı listesi doğru mu?

Onaylanınca: her modül için `SPEC-<id>.md`, bağımlılık sırasına göre yazılır.
