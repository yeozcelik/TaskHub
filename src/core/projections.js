/* ------------------------------------------------------------ izdüşümler ---
 * Notion yasası (CAPABILITY-MAP.md): HİÇBİR GÖRÜNÜM VERİYE SAHİP DEĞİLDİR.
 * Liste, pano ve takvim aynı `state.tasks` üzerine izdüşümdür; hiçbiri kendi
 * deposunu açmaz, hiçbiri diğerinin göremediği bir şey bilmez.
 *
 * Bu dosya saftır: girdi görev dizisi, çıktı gruplanmış görev dizisi. DOM yok,
 * çizim yok, i18n yok — etiketler anahtar olarak döner, metne arayüz çevirir. */

const BOARD_COLUMNS = ["high", "med", "low"];

/** Liste görünümü: son tarihe göre kovalar (mevcut davranış). */
function listGroups(tasks, todayY){
  const by = new Map(BUCKETS.map(b => [b, []]));
  for (const task of tasks) by.get(bucketOf(task, todayY)).push(task);
  return BUCKETS
    .map(key => ({ key, labelKey: "b_" + key, items: sortTasks(by.get(key)) }))
    .filter(g => g.items.length);
}

/** Pano görünümü: önceliğe göre sütunlar.
 *
 *  Neden öncelik: SPEC.md'deki açık soru #2'nin varsayılan cevabı. Duruma göre
 *  (açık/tamamlanan) iki sütun panoyu anlamsız kılardı; kovaya göre yedi sütun
 *  ekrana sığmazdı. Öncelik üç sütun verir ve zaten modelde var.
 *
 *  Tamamlananlar panoda AYRI bir sütun değil: tamamlanmış bir görevin önceliği
 *  artık bir karar değil, bir geçmiş. `done` olanlar listeden çıkar. */
function boardGroups(tasks){
  const by = new Map(BOARD_COLUMNS.map(c => [c, []]));
  const doneItems = [];
  for (const task of tasks){
    if (task.done){ doneItems.push(task); continue; }
    (by.get(task.priority) || by.get("med")).push(task);
  }
  const cols = BOARD_COLUMNS.map(key => ({ key, labelKey: key, items: sortTasks(by.get(key)) }));
  if (doneItems.length) cols.push({ key: "completed", labelKey: "b_completed", items: sortTasks(doneItems) });
  return cols;
}

/** Bir ay ızgarası: hafta hafta, her hücre bir gün.
 *
 *  Gün gün ilerlemek yerine sayaçla üretilir; yaz saati geçişinde saat ekleyip
 *  çıkarmak günü yineletebilir ya da atlatabilir. `parseYmd`/`ymd` sözleşmesi
 *  yerel saatle çalışır ve gün bazında güvenlidir.
 *
 *  @param weekStart 1 = pazartesi (TR), 0 = pazar (EN) */
function monthGrid(year, month, weekStart){
  const first = new Date(year, month, 1);
  const lead = (first.getDay() - weekStart + 7) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++){
    const d = new Date(year, month, 1 - (lead - i));
    cells.push({ ymd: ymd(d), inMonth: false, day: d.getDate() });
  }
  for (let d = 1; d <= daysInMonth; d++){
    cells.push({ ymd: ymd(new Date(year, month, d)), inMonth: true, day: d });
  }
  while (cells.length % 7 !== 0){
    const d = new Date(year, month, daysInMonth + (cells.length - lead - daysInMonth) + 1);
    cells.push({ ymd: ymd(d), inMonth: false, day: d.getDate() });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Görevleri son tarihe göre indeksler. Tarihsizler ayrı döner — gizlenmez,
 *  çünkü takvimde görünmeyen görev kaybolmuş görevdir. */
function tasksByDate(tasks){
  const map = new Map();
  const undated = [];
  for (const task of tasks){
    if (!task.dueDate){ undated.push(task); continue; }
    if (!map.has(task.dueDate)) map.set(task.dueDate, []);
    map.get(task.dueDate).push(task);
  }
  // Her günü kendi içinde sırala. (İki elemanlı sortTasks çağrısını
  // karşılaştırıcı gibi kullanmak çalışırdı ama sıralama kararlılığını
  // tesadüfe bırakırdı; doğrusu diziyi bir kez sıralamak.)
  for (const [k, list] of map) map.set(k, sortTasks(list));
  return { map, undated: sortTasks(undated) };
}
