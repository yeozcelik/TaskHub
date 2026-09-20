/* --------------------------------------------------------- komut kaydı ---
 * Linear yasası (CAPABILITY-MAP.md): klavyeden çağrılamayan yetenek bitmiş
 * sayılmaz. Her aksiyon buraya kaydolur; palet tek kapıdır.
 *
 * Kayıt defteri VERİDİR. Yeni bir komut eklemek palet arayüzüne dokunmayı
 * gerektirmez — `registerCommand` çağırmak yeter. Palet listeyi çizer,
 * bilmediği hiçbir şey yoktur.
 *
 * Eşleme Türkçe harf katlamalıdır (`foldTr`): "gorunum" yazan biri
 * "Görünüm"ü bulmalı, "istanbul" yazan "İstanbul"u.                        */

const COMMANDS = [];

/**
 * @param {{id:string, label:()=>string, hint?:()=>string,
 *          run:()=>void, when?:()=>boolean, keys?:string}} cmd
 */
function registerCommand(cmd){
  if (!cmd || !cmd.id || typeof cmd.run !== "function") return null;
  const i = COMMANDS.findIndex(c => c.id === cmd.id);
  if (i >= 0) COMMANDS[i] = cmd; else COMMANDS.push(cmd);   // yeniden kayıt üst üste yazar
  return cmd;
}

/** O an geçerli komutlar. `when` bağlama duyarlılık içindir (görevler/notlar). */
function availableCommands(){
  return COMMANDS.filter(c => !c.when || c.when());
}

/* Altdizi eşlemesi + puanlama. Saf: girdi etiket ve sorgu, çıktı sayı ya da
   null (hiç eşleşmedi). Puan mutlak bir anlam taşımaz, yalnız sıralamak için.

   Tercihler, en güçlüden zayıfa:
     bitişik harfler > etiketin EN BAŞINDAN eşleşme > kelime başı > kısa etiket

   "En baştan" niye "kelime başı"ndan güçlü: "yenile" yazan kullanıcı için
   "Yenileme aracı", "Sayfayı yenile"den daha iyi bir adaydır — komut
   paletlerinin (VS Code, Sublime) yerleşik davranışı da budur. Bir testte bu
   sıra tersine yazılmıştı; kod değil test düzeltildi.                       */
function scoreMatch(label, query){
  const hay = foldTr(label);
  const needle = foldTr(query).replace(/\s+/g, "");
  if (!needle) return 0;
  if (!hay) return null;

  let score = 0, from = 0, prev = -2, run = 0;
  for (const ch of needle){
    const at = hay.indexOf(ch, from);
    if (at === -1) return null;
    if (at === prev + 1){ run++; score += 8 + run * 2; }              // bitişiklik ödülü
    else { run = 0; score += 1; }
    if (at === 0) score += 12;                                        // en baştan
    else if (/[\s\-_/(),.]/.test(hay.charAt(at - 1))) score += 8;     // kelime başı
    score -= Math.min(6, at - prev - 1) * 0.5;                        // aradaki boşluk cezası
    prev = at; from = at + 1;
  }
  return score - hay.length * 0.05;                                   // eşitlikte kısa olan
}

/** Eşleşenleri puana göre sıralı döndürür. Eşit puanda KAYIT SIRASI korunur —
 *  rastgele görünen sıra kullanıcıyı da testi de yanıltır. */
function matchCommands(items, query){
  const scored = [];
  for (let i = 0; i < items.length; i++){
    const label = typeof items[i].label === "function" ? items[i].label() : items[i].label;
    const s = scoreMatch(String(label == null ? "" : label), String(query == null ? "" : query));
    if (s !== null) scored.push({ item: items[i], s, i });
  }
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map(x => x.item);
}
