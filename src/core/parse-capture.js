/* ------------------------------------------------- doğal dille yakalama ---
 * "yarın rapor yaz !yüksek #iş"  →  { title:"rapor yaz", dueDate:"2026-05-11",
 *                                     priority:"high", tags:["iş"] }
 *
 * Todoist yasası (CAPABILITY-MAP.md): bir şey oluşturmak için form açılmaz.
 * Yakalama tek satır yazıdır; yapıyı ayrıştırıcı kurar.
 *
 * İKİ KURAL, İKİSİ DE PAZARLIĞA KAPALI:
 *
 * 1. TAHMİN YOK. Emin olunmayan hiçbir şeye dokunulmaz. "3 mart" bir tarihtir;
 *    "3 martı" değildir ve öyle bırakılır. Yanlış tarih atamak, tarih
 *    atamamaktan daha pahalıdır: kullanıcı ikincisini görür, birincisini
 *    görmez.
 *
 * 2. SESSİZ KAYIP YOK. Tanınan ama UYGULANAMAYAN şey `unsupported` içinde
 *    rapor edilir ve başlıkta kalır. Bugün tek örneği saat: görev modelinde
 *    saat alanı yok (`dueDate` sadece YYYY-MM-DD) ve alan eklemek şema
 *    değişikliğidir — SPEC.md sınırlarında "önce sor" maddesi.
 *
 * Tarih aritmetiği YEREL saatledir (parseYmd/ymd sözleşmesi): Date.parse
 * "YYYY-MM-DD"yi UTC yorumlayıp günü kaydırır.                              */

/* Türkçe harfleri kendi ASCII karşılıklarıyla birlikte eşleştirir, böylece
   "yarin" de "yarın" da tanınır. foldTr'yi doğrudan kullanamayız: katlama
   dizenin uzunluğunu değiştirir ve kırpma için tuttuğumuz konumlar kayar. */
const TR_CLASS = { "ç":"çc", "ğ":"ğg", "ı":"ıi", "i":"iıİ", "ö":"öo", "ş":"şs", "ü":"üu" };
function trPattern(word){
  return String(word).toLowerCase().split("").map(ch => {
    if (TR_CLASS[ch]) return "[" + TR_CLASS[ch] + "]";
    if (ch === " ") return "\\s+";                      // "öbür gün" çift boşlukla da yazılabilir
    if (/[a-z0-9]/.test(ch)) return ch;
    // `u` bayrağı altında gereksiz kaçış GEÇERSİZDİR: yalnız meta karakterler kaçırılır.
    return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).join("");
}

const WEEKDAYS = {
  tr: { "pazartesi":1, "salı":2, "çarşamba":3, "perşembe":4, "cuma":5, "cumartesi":6, "pazar":0 },
  en: { "monday":1, "tuesday":2, "wednesday":3, "thursday":4, "friday":5, "saturday":6, "sunday":0,
        "mon":1, "tue":2, "wed":3, "thu":4, "fri":5, "sat":6, "sun":0 },
};
const MONTHS = {
  tr: ["ocak","şubat","mart","nisan","mayıs","haziran","temmuz","ağustos","eylül","ekim","kasım","aralık"],
  en: ["january","february","march","april","may","june","july","august","september","october","november","december"],
};
const MONTHS_ABBR_EN = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];

const PRIORITY_WORDS = {
  high: ["p1", "yüksek", "high", "acil", "urgent"],
  med:  ["p2", "orta", "med", "medium", "normal"],
  low:  ["p3", "düşük", "low"],
};

/* Verilen hafta gününün EN YAKIN gelişi — bugün dahil.
   Karar ve gerekçesi: "pazartesi" yazan biri pazartesi günü yazıyorsa büyük
   ihtimalle bugünü kastediyor; bir hafta sonrasına atmak sürpriz olur.
   "bugün"le de tutarlı. Bu bir sözleşmedir ve testle kilitlidir. */
function nextWeekday(todayY, target){
  const d = parseYmd(todayY);
  if (!d) return null;
  const diff = (target - d.getDay() + 7) % 7;
  return addDays(todayY, diff);
}

function clampDay(year, month, day){
  const d = new Date(year, month, day);
  return (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) ? ymd(d) : null;
}

/** Tarih kuralları. Her biri { re, resolve(match, todayY) → "YYYY-MM-DD"|null }.
 *  Sıra önemlidir: daha uzun/özgül kalıplar önce denenir. */
function dateRules(lang){
  const wd = WEEKDAYS[lang] || WEEKDAYS.tr;
  const months = (MONTHS[lang] || MONTHS.tr);
  const monthAlt = months.map(trPattern).concat(lang === "en" ? MONTHS_ABBR_EN : []).join("|");
  const wdAlt = Object.keys(wd).map(trPattern).join("|");
  const rules = [];
  const add = (src, resolve) => rules.push({ re: new RegExp("(?<![\\p{L}\\p{N}])(?:" + src + ")(?![\\p{L}\\p{N}])", "giu"), resolve });

  // ISO, her dilde
  add("(\\d{4})-(\\d{2})-(\\d{2})", m => parseYmd(m[0]) ? m[0] : null);

  if (lang === "en"){
    add("today", (m, T) => T);
    add("tomorrow", (m, T) => addDays(T, 1));
    add("day after tomorrow", (m, T) => addDays(T, 2));
    add("next week", (m, T) => addDays(T, 7));
    add("in (\\d{1,3}) days?", (m, T) => addDays(T, +m[1]));
    add("in (\\d{1,3}) weeks?", (m, T) => addDays(T, 7 * +m[1]));
    add("(" + monthAlt + ")\\.? (\\d{1,2})(?:,? (\\d{4}))?", (m, T) => monthDay(m[1], m[2], m[3], lang, T));
    add("(\\d{1,2}) (" + monthAlt + ")(?:,? (\\d{4}))?", (m, T) => monthDay(m[2], m[1], m[3], lang, T));
  } else {
    add(trPattern("bugün"), (m, T) => T);
    add(trPattern("yarın"), (m, T) => addDays(T, 1));
    add(trPattern("öbür gün") + "|" + trPattern("öbürgün"), (m, T) => addDays(T, 2));
    add(trPattern("haftaya") + "|" + trPattern("gelecek hafta"), (m, T) => addDays(T, 7));
    add("(\\d{1,3}) " + trPattern("gün") + "(?:e|a)?(?: " + trPattern("sonra") + ")?", (m, T) => addDays(T, +m[1]));
    add("(\\d{1,3}) " + trPattern("hafta") + "(?:ya|sonra)?", (m, T) => addDays(T, 7 * +m[1]));
    add("(\\d{1,2}) (" + monthAlt + ")(?: (\\d{4}))?", (m, T) => monthDay(m[2], m[1], m[3], lang, T));
    add("(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})", m => clampDay(+m[3], +m[2] - 1, +m[1]));
  }

  // Hafta günleri en sona: "cuma" gibi bir kelime daha özgül bir kalıbın
  // parçasıysa (örn. "15 cuma" diye bir şey yok ama ilke aynı) o önce alınsın.
  add(wdAlt, (m, T) => {
    const key = Object.keys(wd).find(k => new RegExp("^" + trPattern(k) + "$", "iu").test(m[0]));
    return key === undefined ? null : nextWeekday(T, wd[key]);
  });
  return rules;
}

function monthDay(monthWord, dayStr, yearStr, lang, todayY){
  const months = MONTHS[lang] || MONTHS.tr;
  const w = String(monthWord).toLowerCase();
  let idx = months.findIndex(name => new RegExp("^" + trPattern(name) + "$", "iu").test(w));
  if (idx < 0 && lang === "en") idx = MONTHS_ABBR_EN.indexOf(w.slice(0, 3));
  if (idx < 0) return null;
  const day = +dayStr;
  const today = parseYmd(todayY);
  const year = yearStr ? +yearStr : (today ? today.getFullYear() : new Date().getFullYear());
  const out = clampDay(year, idx, day);
  // Yıl verilmediyse ve tarih geçmişte kaldıysa gelecek yıl kastedilmiştir.
  if (out && !yearStr && today && parseYmd(out) < today) return clampDay(year + 1, idx, day);
  return out;
}

/* ---------------------------------------------------------- tekrar kalıpları
 * "her pazartesi", "her 2 haftada", "every 3 months".
 *
 * Tarihlerden ÖNCE aranır ve eşleşen aralık kesilir: "her pazartesi" içindeki
 * "pazartesi" bir SON TARİH değil, tekrar günüdür. Kesme olmasaydı tarih
 * kuralı onu yakalar ve kullanıcı tek seferlik bir görev alırdı. */
function recurRules(lang){
  const out = [];
  const add = (src, make) => out.push({
    re: new RegExp("(?<![\\p{L}\\p{N}])(?:" + src + ")(?![\\p{L}\\p{N}])", "giu"), make });
  const wd = WEEKDAYS[lang] || WEEKDAYS.tr;
  const wdAlt = Object.keys(wd).map(trPattern).join("|");
  const dayOf = w => {
    const key = Object.keys(wd).find(k => new RegExp("^" + trPattern(k) + "$", "iu").test(String(w).toLowerCase()));
    return key === undefined ? null : wd[key];
  };

  if (lang === "en"){
    add("every (\\d{1,3}) days?",   m => ({ freq: "daily",   interval: +m[1] }));
    add("every (\\d{1,3}) weeks?",  m => ({ freq: "weekly",  interval: +m[1] }));
    add("every (\\d{1,3}) months?", m => ({ freq: "monthly", interval: +m[1] }));
    add("every (" + wdAlt + ")", m => { const d = dayOf(m[1]); return d === null ? null : ({ freq: "weekly", interval: 1, byDay: [d] }); });
    add("every day|daily",     () => ({ freq: "daily",   interval: 1 }));
    add("every week|weekly",   () => ({ freq: "weekly",  interval: 1 }));
    add("every month|monthly", () => ({ freq: "monthly", interval: 1 }));
  } else {
    const her = trPattern("her");
    add(her + " (\\d{1,3}) " + trPattern("günde") + "|" + her + " (\\d{1,3}) " + trPattern("gün"),
        m => ({ freq: "daily", interval: +(m[1] || m[2]) }));
    add(her + " (\\d{1,3}) " + trPattern("haftada") + "|" + her + " (\\d{1,3}) " + trPattern("hafta"),
        m => ({ freq: "weekly", interval: +(m[1] || m[2]) }));
    add(her + " (\\d{1,3}) " + trPattern("ayda") + "|" + her + " (\\d{1,3}) " + trPattern("ay"),
        m => ({ freq: "monthly", interval: +(m[1] || m[2]) }));
    add(her + " (" + wdAlt + ")", m => { const d = dayOf(m[1]); return d === null ? null : ({ freq: "weekly", interval: 1, byDay: [d] }); });
    add(her + " " + trPattern("gün"),   () => ({ freq: "daily",   interval: 1 }));
    add(her + " " + trPattern("hafta"), () => ({ freq: "weekly",  interval: 1 }));
    add(her + " " + trPattern("ay"),    () => ({ freq: "monthly", interval: 1 }));
  }
  return out;
}

const TIME_RE = /(?<![\p{L}\p{N}])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\p{L}\p{N}])/gu;
const TAG_RE = /(?<![\p{L}\p{N}])#([\p{L}\p{N}_-]{1,30})/gu;

function priorityRule(){
  const all = [];
  for (const [level, words] of Object.entries(PRIORITY_WORDS))
    for (const w of words) all.push({ level, src: trPattern(w) });
  all.sort((a, b) => b.src.length - a.src.length);        // uzun kelime önce
  return { all, re: new RegExp("(?<![\\p{L}\\p{N}])!(" + all.map(x => x.src).join("|") + ")(?![\\p{L}\\p{N}])", "giu") };
}

/**
 * @param {string} text  kullanıcının yazdığı tek satır
 * @param {{today:string, lang?:"tr"|"en"}} opts
 * @returns {{title:string, dueDate:string|null, priority:string|null,
 *            tags:string[], matches:Array, unsupported:Array}}
 */
function parseCapture(text, opts){
  const src = typeof text === "string" ? text : "";
  const o = opts || {};
  const todayY = parseYmd(o.today) ? o.today : null;
  const lang = o.lang === "en" ? "en" : "tr";
  /* Kullanıcının reddettiği eşleşmeler. Metin olarak tutulur ve o eşleşme hiç
     olmamış gibi davranılır: alan uygulanmaz VE metin başlıkta ÖZGÜN YERİNDE
     kalır. Reddedileni sonradan başlığa iliştirmek konumu kaybettirirdi. */
  const ignore = new Set(Array.isArray(o.ignore) ? o.ignore : []);

  const cuts = [];                    // {start, end} — başlıktan ÇIKARILACAK aralıklar
  /* Reddedilen (ignore) aralıklar: başlıkta KALIR ama başka hiçbir kural
     içlerinde eşleşemez. Bu ayrım olmadan "her pazartesi"yi reddeden kullanıcı
     karşılığında istemediği bir son tarih alıyordu: tekrar kuralı düşünce
     tarih kuralı "pazartesi"yi kapıyordu. Reddetmek "başka türlü yorumla"
     demek değil, "dokunma" demektir. */
  const blocked = [];
  const taken = (s0, e0) => cuts.some(c => s0 < c.end && e0 > c.start)
                         || blocked.some(c => s0 < c.end && e0 > c.start);
  const matches = [], unsupported = [], tags = [];
  let dueDate = null, priority = null;

  for (const m of src.matchAll(TAG_RE)){
    if (ignore.has(m[0])){ blocked.push({ start: m.index, end: m.index + m[0].length }); continue; }
    tags.push(m[1]);
    matches.push({ kind: "tag", text: m[0], value: m[1], applied: true, start: m.index });
    cuts.push({ start: m.index, end: m.index + m[0].length });
  }

  const pr = priorityRule();
  for (const m of src.matchAll(pr.re)){
    if (ignore.has(m[0])){ blocked.push({ start: m.index, end: m.index + m[0].length }); continue; }
    const w = m[1].toLowerCase();
    const hit = pr.all.find(x => new RegExp("^" + x.src + "$", "iu").test(w));
    if (!hit) continue;
    const first = priority === null;
    if (first) priority = hit.level;
    matches.push({ kind: "priority", text: m[0], value: hit.level, applied: first, start: m.index });
    cuts.push({ start: m.index, end: m.index + m[0].length });
  }

  /* Tekrar, tarihten ÖNCE. Kesilen aralık tarih kurallarını da bağlar
     (aşağıdaki çakışma kontrolü `cuts`e bakar). */
  let recurRaw = null;
  for (const rule of recurRules(lang)){
    let found = false;
    for (const m of src.matchAll(rule.re)){
      const s0 = m.index, e0 = s0 + m[0].length;
      if (taken(s0, e0)) continue;
      if (ignore.has(m[0])){ blocked.push({ start: s0, end: e0 }); continue; }
      const made = rule.make(m);
      if (!made) continue;
      const first = recurRaw === null;
      if (first) recurRaw = made;
      matches.push({ kind: "recur", text: m[0], value: made, applied: first, start: s0 });
      cuts.push({ start: s0, end: e0 });
      found = true;
    }
    if (found) break;          // bir görevin tek tekrar kuralı vardır
  }

  if (todayY){
    /* BÜTÜN kurallar denenir, sonra eşleşmeler arasından seçim yapılır:
       METİNDE ÖNCE GELEN kazanır, eşitlikte EN UZUN olan.

       "İlk eşleşen kural kazanır" yaklaşımı iki türlü yanlış veriyordu:
       "day after tomorrow" içindeki `tomorrow`u yakalayıp yarını atıyor,
       "yarın bugün rapor"da metinde sonra gelen `bugün`ü seçiyordu. İkisi de
       kural sırasını elle ayarlayarak "düzeltilebilirdi"; her yeni kuralda
       aynı tuzak yeniden kurulurdu. Seçim ölçütü sıraya değil metne bakar. */
    const hits = [];
    for (const rule of dateRules(lang)){
      for (const m of src.matchAll(rule.re)){
        const s = m.index, e = s + m[0].length;
        if (taken(s, e)) continue;                  // etiket/öncelik/tekrar içinde ya da reddedilmiş
        if (ignore.has(m[0])){ blocked.push({ start: s, end: e }); continue; }
        const val = rule.resolve(m, todayY);
        if (val) hits.push({ start: s, end: e, val, text: m[0] });
      }
    }
    hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const chosen = [];
    for (const h of hits){
      if (chosen.some(c => h.start < c.end && h.end > c.start)) continue;   // çakışanı ele
      chosen.push(h);
    }
    /* Fazladan tarihler de BAŞLIKTAN çıkarılır — bırakılsalardı ayrıştırıcı
       kendi çıktısında farklı sonuç verirdi (sabit nokta bozulurdu). Ama
       sessizce kaybolmazlar: `applied:false` ile raporlanırlar. */
    for (let i = 0; i < chosen.length; i++){
      const h = chosen[i];
      if (i === 0) dueDate = h.val;
      matches.push({ kind: "date", text: h.text, value: h.val, applied: i === 0, start: h.start });
      cuts.push({ start: h.start, end: h.end });
    }
  }

  // Saat tanınır ama UYGULANMAZ: modelde alan yok. Başlıkta bırakılır.
  for (const m of src.matchAll(TIME_RE)){
    const s = m.index, e = s + m[0].length;
    if (taken(s, e)) continue;
    unsupported.push({ kind: "time", text: m[0],
      reason: "Görev modelinde saat alanı yok; başlıkta bırakıldı." });
  }

  /* Çipler arayüzde YAZILDIĞI SIRAYLA görünmeli: kullanıcı satırı soldan sağa
     tarar, çıkarma sırasını (etiket → öncelik → tarih) değil. */
  matches.sort((a, b) => a.start - b.start);

  cuts.sort((a, b) => a.start - b.start);
  let title = "", at = 0;
  for (const c of cuts){
    if (c.start < at) continue;
    title += src.slice(at, c.start);
    at = c.end;
  }
  title += src.slice(at);
  title = title.replace(/\s+/g, " ").trim();

  /* Kural bir ÇAPAYA ihtiyaç duyar (src/core/recurrence.js): seri nereden
     başlıyor? Açık bir son tarih verildiyse o, verilmediyse bugün.
     Tarih yoksa görevin son tarihi ilk tekrar olur — "her pazartesi rapor"
     yazan biri ilk pazartesiyi kasteder, tarihsiz bir görev değil. */
  let recur = null;
  if (recurRaw && todayY){
    recur = normalizeRule({ ...recurRaw, anchor: dueDate || todayY });
    if (recur && !dueDate) dueDate = firstOccurrence(recur, todayY);
    if (recur && dueDate && dueDate !== recur.anchor) recur = normalizeRule({ ...recurRaw, anchor: dueDate });
  }

  return { title, dueDate, priority, tags, recur, matches, unsupported };
}
