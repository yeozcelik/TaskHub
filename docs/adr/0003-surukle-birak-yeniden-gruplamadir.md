# ADR 0003: Sürükle-bırak yeniden SIRALAMA değil, yeniden GRUPLAMA yapar

**Durum:** Kabul edildi (T5.2 ile uygulandı)
**Tarih:** 2026-09-21
**İlgili:** CAPABILITY-MAP.md (Notion yasası), SPEC.md S8

## Bağlam

`tasks/todo.md` T5.2'yi "sürükle-bırak yeniden sıralama" diye yazmıştı ve kabul
ölçütlerinden biri şuydu: *"Arama/filtre açıkken sıralama kapalı — görünen sıra
gerçek sıra olmadığı için yanıltırdı."* Bu ölçüt, ELDE TUTULAN bir manuel sıra
varsayıyor.

TaskHub'da böyle bir sıra yok. Grup içi sıra TÜRETİLMİŞTİR
(`src/core/sort.js`): tarihli önce, sonra tarih, sonra öncelik, sonra oluşturma
zamanı. Bir kartı grup içinde başka bir yere sürüklemenin veri modelinde
karşılığı yok — bırakıldığı anda yerine geri döner.

## Karar

Sürükleme, kartı **bırakıldığı grubun tanımladığı alanı** değiştirir:

| görünüm | grup | bırakmanın anlamı |
|---|---|---|
| liste | Bugün / Yarın / Bu hafta / Sonra / Tarihsiz | `dueDate` o kovaya düşecek şekilde ayarlanır |
| liste | Tamamlanan | `done = true` (tekrar kuralı varsa sonraki örnek üretilir) |
| pano | Yüksek / Orta / Düşük | `priority` o sütun olur |
| takvim | bir gün hücresi | `dueDate` o gün olur |

Grup içi yeniden sıralama **sunulmaz**. "Gecikmiş" bir bırakma hedefi değildir:
bir işi kasten geciktirmek bir kullanıcı niyeti değil ve tek bir makul tarihi de
yok.

## Gerekçe

### 1. Manuel sıra, kararlı bir kap ister — bizde yok

Manuel sıra ancak üyeliği sabit bir kabın içinde anlamlıdır (bir proje, bir düz
liste). TaskHub'ın grupları **tarihten hesaplanır**: bugünün "Bugün"ü yarının
"Gecikmiş"idir. Üyeliği her gece yarısı değişen bir kabın içine manuel sıra
yazmak, sessizce çürüyen bir sıra üretir. Bu bir tercih meselesi değil, yapısal
bir uyumsuzluk.

### 2. Manuel sıra bir KİP getirirdi

Todoist ve TickTick manuel sıra sunar çünkü onların VARSAYILANI manuel sıradır;
tarihe göre sıralamak orada bir kiptir. TaskHub'ın varsayılanı tarihtir, yani
manuel sıra bir "sıralama kipi" anahtarı gerektirirdi. Bu, kalıcı arayüze yeni
bir üst düzey denetim eklemek demek — SPEC.md S8'in adıyla saydığı envantere
dokunmak. Kullanıcının hatırlamadığı bir kipe göre sessizce değişen bir sıra,
Things yasasının (varsayılan sakin ve öngörülebilir kalır) tam tersi.

### 3. Yeniden gruplama zaten EN ÇOK İSTENEN jest

"Bunu bugüne çek", "bunu yarına at", "bunun önceliğini yükselt" — görev
yöneticilerinde en sık yapılan hareket budur (Things'in "Move to Today"i,
Reminders'ın tarihe sürüklemesi, Trello/Linear'ın sütunlar arası sürüklemesi).
Kartı grup içinde üç sıra yukarı almak değil.

### 4. Notion yasasının doğrudan sonucu

CAPABILITY-MAP.md'de görünümler izdüşümdür, hiçbiri veriye sahip değildir.
İzdüşümün içinde bir şeyi taşımak, o izdüşümü üreten VERİYİ değiştirmek
demektir. Sürüklemenin `dueDate`/`priority`/`done` yazması bu yasanın birebir
uygulanmasıdır; ayrı bir `order` alanı ise görünüme ait, veriye ait olmayan bir
durum yaratırdı.

## Sonuçlar

- **İptal edilen ölçüt:** "Arama/filtre açıkken sıralama kapalı." Yeniden
  gruplamada süzgeç bir şeyi yanıltmıyor — bırakma hedefi bir grup, görünen
  sıra değil. Süzgeç açıkken sürüklemek hem tanımlı hem yararlı ("#iş'e süz,
  birini Bugün'e çek"). Ölçüt kaldırılmadı, **dayanağı ortadan kalktı**.
- **Klavye eşdeğeri** aynı anlamı taşır: `Alt+↑/↓` kartı önceki/sonraki gruba
  taşır (listede kova, panoda sütun). Kabul ölçütündeki desen korundu.
- Şema değişmedi. Eski veri aynen okunur; yeni alan yok.
- **Manuel sıra isteniyorsa** bu ayrı ve daha büyük bir iştir: `order` alanı +
  sıralama kipi denetimi + S8 envanterinin güncellenmesi. Bu ADR onu
  yasaklamıyor, bugünkü kapsamın dışında tutuyor.
