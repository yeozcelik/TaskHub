# Uygulama Planı: TaskHub Modernleştirme

**Durum:** onay bekliyor. `CAPABILITY-MAP.md` kapısı geçilmeden modül şartnamesi
yazılmaz, kod yazılmaz.

**İlgili belgeler:** `CAPABILITY-MAP.md` (modül haritası) · `SPEC.md` (üst düzey
şartname) · `docs/adr/0001-*` (derleme kararı) · `docs/olcumler/` (ölçüm verisi)

## Özet

TaskHub'ın dört tavanı kaldırılıyor: **bakım tavanı** (5.229 satır tek dosya),
**çizim tavanı** (her çizimde tam DOM yıkımı), **depolama tavanı** (~5 MB) ve
**etkileşim tavanı** (üç klavye kısayolu). Ürünün kimliği — çevrimdışı, kurulumsuz,
tek dosya, kendi diskinde veri — değişmiyor.

## Mimari kararlar

1. **Modüler kaynak, tek dosya çıktı.** Gerekçe ADR 0001'de. Çıktının ilk sürümü
   mevcut `index.html` ile **birebir aynı** olmak zorunda — bölmenin davranışı
   koruduğunun kanıtı.

2. **IndexedDB birincil, localStorage geri düşme.** Ölçüldü: Chromium 141'de
   `file://` üzerinde IndexedDB çalışıyor ve ~151 GiB kota bildiriyor (~32.000×).
   Firefox ölçülmedi → **T0.1** bunu kapatır. Kapanmazsa mimari değişmiyor:
   soyutlama zaten iki adaptörlü.

3. **Uzlaştırıcı yalnız görev listesinde.** Not tuvalinin geri alma mimarisi
   `#editor` üzerinde `innerHTML` anlık görüntülerine ve olay delegasyonuna dayanıyor
   (README, "Geri almanın kökü kutu değil, tuvaldir"). Oraya uzlaştırıcı sokmak geri
   almayı sessizce bozar. Tuval bu girişimin dışında.

4. **Dört referans, dört ayrı katman.** Things = varsayılan durum yasası (veto hakkı),
   Linear = etkileşim yasası, Todoist = giriş yasası, Notion = veri yasası. Ayrıntı
   `CAPABILITY-MAP.md`'de. Bu, "her üründen özellik topla" yaklaşımının ürettiği
   çorbaya karşı alınmış bilinçli bir önlemdir.

5. **Saf çekirdek / DOM ayrımı sertleşiyor.** `src/core/*` hiçbir zaman `document`'a
   dokunmaz. Testedilebilirliğin tamamı buna dayanıyor; mevcut kodda zaten bu yönde
   bir ayrım var, plan onu kuralla pekiştiriyor.

## Bağımlılık grafiği

```
build ──┬──────────────────────────────────────────────► (her şey)
        ├─► render ──┬─► command
        │            ├─► select
        │            ├─► views ◄──┐
        │            └─► motion   │
        ├─► store ───┬────────────┘
        │            ├─► repeat ◄─┐
        │            └─► link     │
        └─► capture ──────────────┘
```

## Fazlar

Dikey dilimleme: her faz **çalışan, sınanabilir** bir uygulama bırakır. Hiçbir faz
"önce tüm altyapı, sonra tüm arayüz" değildir.

### Faz 0 — Spike (hızlı başarısızlık)
Tek iş: planın en riskli bilinmeyenini kapatmak. Sonuç `store`'un tasarımını
belirler, ama **hiçbir fazı bloke etmez** — soyutlama iki adaptörlü olduğu için
plan her iki sonuçta da geçerli.

### Faz 1 — `build` (temel)
Modüler kaynak, gömücü, Node test koşucusu, CI. Ürün yüzeyi **değişmez**.
Çıkış kanıtı: `diff` boş (S1) ve 212 iddia `node --test` altında yeşil (S2).

### Faz 2 — `render` + `capture` + `command` (algılanan modernlik)
En görünür sıçrama burada. Artımlı çizim, yazarak tarih girme, `Ctrl+K`.
Üçü paralel yürütülebilir — aralarında bağımlılık yok.

### Faz 3 — `store` + `views` + `repeat` (yetenek)
Depolama tavanı kalkar; pano ve takvim izdüşümleri; tekrarlayan görevler.

### Faz 4 — `select` + `link` (güç)
Çoklu seçim + toplu işlem; `[[sayfa]]` bağlantıları ve geri-bağlantılar.

### Faz 5 — `motion` (cila)
View Transitions, sürükle-bırak. **En sona kasten konuldu**: kesilebilir olan
budur, ve işlevsellik olmadan cila anlamsızdır.

## Görev listesi

Tam görev listesi kabul ölçütleriyle birlikte **`tasks/todo.md`** dosyasında.

## Riskler ve azaltımlar

| # | Risk | Etki | Azaltım |
|---|---|---|---|
| R1 | Firefox `file://` + IndexedDB'yi reddeder | Orta | T0.1 ölçer. Soyutlama iki adaptörlü; localStorage kalıcı geri düşme. Mimari değişmez. |
| R2 | Bölme davranışı sessizce değiştirir | **Yüksek** | S1: ilk derleme çıktısı mevcut dosyayla **birebir** olmak zorunda. `diff` boş değilse faz bitmemiştir. |
| R3 | Uzlaştırıcı odak/imleç davranışını bozar | **Yüksek** | Kapsam yalnız görev listesi. Tuval dokunulmaz (karar 3). Odak korunumu için özel test. |
| R4 | Dört referans → özellik çorbası, sakin arayüz kaybolur | **Yüksek** | Things vetosu + S8: varsayılan görünümde kalıcı kontrol sayısı artamaz. Her gözden geçirmede sayılır. |
| R5 | `index.html` elle düzenlenir, derlemede kaybolur | Orta | `--check` CI kapısı; dosya başına uyarı başlığı. |
| R6 | Kota bildirilir ama teslim edilmez (disk dolu) | Orta | `QuotaExceededError` yakalanır; mevcut uyarı şeridi yolu kullanılır. |
| R7 | Dosya boyutu şişer | Düşük | S10: ≤ 500 KB, CI'da ölçülür. `file://` olduğu için ağ maliyeti yok; sorun bakım. |
| R8 | Erişilebilirlik sessizce geriler | **Yüksek** | S9 her fazın çıkış kapısında: 4 genişlik × 2 tema, 0 ihlal. |
| R9 | Yeni dizeler tek dilde kalır | Düşük | CI kontrolü: `I18N.tr` ve `I18N.en` anahtar kümeleri eşit olmalı. |
| R10 | `execCommand` bir gün kaldırılır | Düşük | Mevcut risk, bu girişim artırmıyor. Kayıtlı veri düz HTML olduğu için notlar okunabilir kalır. |

## Paralelleştirme

- **Güvenle paralel:** Faz 2'nin üç modülü (`render`, `capture`, `command` — `command`
  yalnız `render`'ın arayüzüne bağlı, gövdesine değil); Faz 3'te `views` ile `repeat`;
  Faz 4'ün iki modülü.
- **Sıralı olmak zorunda:** `build` her şeyden önce. `store` geçişi tek parça
  (yarım göç edilmiş veri kabul edilemez).
- **Eşgüdüm gerektirir:** `command` ile `select` aynı klavye yüzeyini paylaşır —
  kısayol tablosu önce yazılır, sonra paralel gidilir.

## Açık sorular

`SPEC.md` → "Açık sorular". Dördü de varsayımla yazıldı; düzeltilmezse öyle uygulanır.
