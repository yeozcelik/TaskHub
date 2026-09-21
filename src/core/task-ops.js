/* ----------------------------------------------------- görev taşıma işlemleri
 * Bir kartı bir gruba bırakmanın VERİDEKİ karşılığı. Saf: DOM yok, durum yok,
 * saat yok — bugünün tarihi dışarıdan verilir.
 *
 * Neden ayrı bir dosya: bırakma anlamı sürükleme mekaniğinden bağımsız olarak
 * sınanabilmeli. "Yarın kovasına bırakınca tarih ne olur" sorusunun cevabı
 * fare olaylarına bağlı değil (docs/adr/0003).                               */

/** Listede bırakma hedefi olan kovalar ve bunların gerektirdiği alanlar.
 *  `overdue` KASTEN yok: bir işi bilerek geciktirmek bir niyet değil ve tek
 *  bir makul tarihi de yok (dün mü? geçen hafta mı?). */
const LIST_DROP_DAYS = { today: 0, tomorrow: 1, week: 2, later: 8 };

/* `week` kovası 2-7. günleri, `later` 8. günden sonrasını kapsıyor. Bırakınca
   kovanın EN ERKEN gününü seçiyoruz: "bu haftaya at" diyen biri için en az
   sürprizli tarih, kovaya düşen ilk tarihtir. Haftanın sonunu seçmek sessizce
   beş gün daha ertelemek olurdu. */

/** Bir gruba bırakmanın görevde değiştireceği alanlar.
 *  @param groupKey bırakılan bölümün anahtarı (kova ya da sütun)
 *  @param view "list" | "board"
 *  @param todayY bugünün "YYYY-MM-DD" hâli
 *  @returns alan yaması, ya da hedef geçersizse null */
function dropFields(groupKey, view, todayY){
  if (groupKey === "completed") return { done: true };

  if (view === "board"){
    if (groupKey === "high" || groupKey === "med" || groupKey === "low"){
      return { priority: groupKey, done: false };
    }
    return null;
  }

  if (groupKey === "nodate") return { dueDate: null, done: false };
  if (!LIST_DROP_DAYS.hasOwnProperty(groupKey)) return null;   // overdue dahil
  const due = addDays(todayY, LIST_DROP_DAYS[groupKey]);
  return due ? { dueDate: due, done: false } : null;
}

/** Yama görevi gerçekten değiştiriyor mu? Değiştirmiyorsa ne bildirim ne de
 *  geri alma adımı üretmek gerekir — "hiçbir şey olmadı" da bir cevaptır. */
function fieldsChange(task, fields){
  for (const k in fields) if (fields[k] !== task[k]) return true;
  return false;
}

/** Klavye eşdeğeri (`Alt+↑/↓`) için komşu grup.
 *
 *  EKRANDAKİ gruplar arasında gezinir, kuramsal olanlar arasında değil: boş
 *  bir kovaya taşımak kullanıcı için "hiçbir şey olmadı" gibi görünürdü.
 *  Geçerli hedef olmayan gruplar (gecikmiş) atlanır.
 *
 *  @param present ekranda bulunan grup anahtarları, GÖRÜNEN sırayla
 *  @param from görevin şu anki grubu
 *  @param delta -1 yukarı, +1 aşağı
 *  @param view "list" | "board"
 *  @returns hedef grup anahtarı ya da null */
function neighborGroup(present, from, delta, view, todayY){
  const usable = present.filter(k => k === from || dropFields(k, view, todayY));
  const i = usable.indexOf(from);
  if (i < 0) return null;
  const j = i + delta;
  if (j < 0 || j >= usable.length) return null;      // uçlarda sarmaz
  return usable[j];
}
