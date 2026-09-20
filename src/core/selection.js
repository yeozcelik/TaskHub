/* ------------------------------------------------------------- seçim ---
 * Çoklu seçimin SAF çekirdeği: sıralı bir anahtar listesi, bir çapa ve bir
 * hedef → hangi anahtarlar seçili olmalı. DOM yok, olay yok.
 *
 * Neden ayrı bir dosya: aralık seçimi "kolay görünen, ayrıntıda zor" işlerden
 * biri. Çapa yönü, filtreyle kaybolan öğeler, sıralama değişince ne olacağı —
 * hepsi tarayıcı açmadan sınanabilmeli.                                    */

/** İki anahtar arası, İKİSİ DE DAHİL, LİSTENİN sırasıyla.
 *  Hangisinin önce tıklandığı fark etmez: yukarıdan aşağı sürüklemekle
 *  aşağıdan yukarı sürüklemek aynı kümeyi vermeli. */
function rangeBetween(keys, a, b){
  const i = keys.indexOf(a), j = keys.indexOf(b);
  if (i < 0 || j < 0) return [];
  return keys.slice(Math.min(i, j), Math.max(i, j) + 1);
}

/** Seçimin yeni hâli. Girdi kümesi DEĞİŞTİRİLMEZ, yenisi döner.
 *  @param mode "replace" | "toggle" | "add" | "remove" */
function nextSelection(current, keys, mode){
  const out = new Set(mode === "replace" ? [] : current);
  for (const k of keys){
    if (mode === "toggle") out.has(k) ? out.delete(k) : out.add(k);
    else if (mode === "remove") out.delete(k);
    else out.add(k);
  }
  return out;
}

/** Görünmeyen anahtarları seçimden düşürür.
 *
 *  Gerekçe: filtre daraldığında ekranda olmayan görevler seçili kalırsa
 *  "3 görev seçili" yazar ama kullanıcı iki tane görür — ve toplu silme
 *  görmediği bir şeyi siler. Seçim her zaman GÖRÜNENİN alt kümesidir. */
function pruneSelection(current, visibleKeys){
  const vis = new Set(visibleKeys);
  const out = new Set();
  for (const k of current) if (vis.has(k)) out.add(k);
  return out;
}

/** Klavyeyle gezinirken bir sonraki/önceki anahtar. Uçlarda SARMAZ:
 *  listede aşağı basarken başa dönmek, kullanıcının nerede olduğunu
 *  kaybettirir. (Komut paleti sarar çünkü orada liste kısa ve döngüseldir.) */
function stepKey(keys, from, delta){
  const i = keys.indexOf(from);
  if (i < 0) return keys.length ? keys[delta > 0 ? 0 : keys.length - 1] : null;
  const j = i + delta;
  return (j < 0 || j >= keys.length) ? from : keys[j];
}
