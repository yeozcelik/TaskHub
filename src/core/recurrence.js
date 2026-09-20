/* ------------------------------------------------------------- tekrar ---
 * RRULE'un KÜÇÜK ve AÇIKÇA SINIRLI bir alt kümesi: günlük / haftalık / aylık,
 * aralık, ve haftalık için hafta günleri. Desteklenmeyen her şey (ayın son iş
 * günü, yıllık, sayım/bitiş tarihi, ay içi n'inci salı) **açıkça reddedilir** —
 * sessizce yanlış yorumlanmaz. Yanlış tekrarlayan görev, hiç tekrarlamayandan
 * daha pahalıdır: kullanıcı ikincisini fark eder.
 *
 * ÇAPA (anchor) neden var: "ayın 31'i" kuralı 31 Ocak'tan başlayıp 28 Şubat'a
 * kırpılır. Sonraki tekrarı KIRPILMIŞ sonuçtan hesaplamak 28 Mart verirdi ve
 * "31'i" kalıcı olarak kaybolurdu. Her hesap çapadan yapılır; kırpma yalnız
 * çıktıya uygulanır. (RRULE'un DTSTART'ı da aynı işi görür.)
 *
 * Tarih aritmetiği YEREL saatle (parseYmd/ymd sözleşmesi): Date.parse
 * "YYYY-MM-DD"yi UTC yorumlayıp günü kaydırır.                             */

const REC_FREQ = ["daily", "weekly", "monthly"];
const REC_MAX_INTERVAL = 365;
const REC_SCAN_LIMIT = 400;        // gün — haftalık taramanın üst sınırı
const REC_MONTH_LIMIT = 24;        // adım — aylık aramanın üst sınırı

/** Ham girdiyi kurala oturtur; oturmuyorsa **null**. Yarım anlaşılmış bir
 *  kuralı kabul etmek, reddetmekten kötüdür. */
function normalizeRule(raw){
  if (!raw || typeof raw !== "object") return null;
  if (!REC_FREQ.includes(raw.freq)) return null;

  const interval = Number(raw.interval);
  // 0 ve negatif REDDEDİLİR: ilerlemeyen bir kural sonsuz döngüdür.
  if (!Number.isInteger(interval) || interval < 1 || interval > REC_MAX_INTERVAL) return null;
  if (!parseYmd(raw.anchor)) return null;

  let byDay = null;
  if (raw.freq === "weekly" && Array.isArray(raw.byDay)){
    const set = new Set();
    for (const d of raw.byDay){
      if (!Number.isInteger(d) || d < 0 || d > 6) return null;   // bozuk gün → kuralın tamamı düşer
      set.add(d);
    }
    if (set.size) byDay = [...set].sort((a, b) => a - b);
  }
  // byDay yalnız haftalıkta anlamlı; başka frekansta verilmişse yok sayılmaz,
  // REDDEDİLİR — kullanıcı bir şey kastetmiş ve biz onu uygulamıyoruz.
  if (raw.freq !== "weekly" && Array.isArray(raw.byDay) && raw.byDay.length) return null;

  return { freq: raw.freq, interval, byDay, anchor: raw.anchor };
}

/** ISO hafta başı (pazartesi). Haftalık aralık sayımı arayüz diline değil,
 *  sabit bir sınıra dayanmalı: kural veridir, sunum değil. Dil değişince
 *  kullanıcının tekrar takvimi kaymamalı. */
function weekStartOf(ymdStr){
  const d = parseYmd(ymdStr);
  if (!d) return null;
  return addDays(ymdStr, -((d.getDay() + 6) % 7));
}

const monthsBetween = (a, b) =>
  (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

/** Aylık tekrarın k'ıncı örneği. Gün o ayda yoksa AYIN SONUNA kırpılır —
 *  31 Ocak + 1 ay = 28/29 Şubat. Sessizce 3 Mart'a kaymaz. */
function monthlyAt(anchorYmd, k, interval){
  const a = parseYmd(anchorYmd);
  const y = a.getFullYear(), m = a.getMonth() + k * interval, day = a.getDate();
  const last = new Date(y, m + 1, 0).getDate();
  return ymd(new Date(y, m, Math.min(day, last)));
}

/**
 * `fromYmd`den SONRAKİ ilk tekrar. Yoksa null.
 * @throws kural ilerlemiyorsa (sınır aşılırsa) — sessizce null dönmez,
 *         çünkü null "tekrar bitti" demektir ve bu bir hatayı gizlerdi.
 */
function nextOccurrence(rule, fromYmd){
  const r = normalizeRule(rule);
  if (!r) return null;
  const from = parseYmd(fromYmd);
  if (!from) return null;
  const anchor = parseYmd(r.anchor);

  /* Çapa KURALA UYMAYABİLİR. "Her pazartesi" kuralı salı günü kurulursa çapa
     salıdır ama seri pazartesi başlar. Günlük ve aylıkta çapa tanımı gereği
     uyar; haftalıkta byDay varsa uymayabilir, o yüzden orada kısa devre yok. */
  if (anchor > from && r.freq !== "weekly") return r.anchor;

  if (r.freq === "daily"){
    const d = daysBetween(r.anchor, fromYmd);
    return addDays(r.anchor, (Math.floor(d / r.interval) + 1) * r.interval);
  }

  if (r.freq === "weekly"){
    const days = r.byDay || [anchor.getDay()];
    const aw = weekStartOf(r.anchor);
    // Seri başlamadıysa aramaya çapanın bir gün öncesinden başla: çapanın
    // KENDİSİ de aday olsun, ama kurala uymuyorsa atlansın.
    const start = anchor > from ? addDays(r.anchor, -1) : fromYmd;
    for (let i = 1; i <= REC_SCAN_LIMIT; i++){
      const cand = addDays(start, i);
      const cd = parseYmd(cand);
      if (!days.includes(cd.getDay())) continue;
      const weeks = daysBetween(aw, weekStartOf(cand)) / 7;
      if (weeks >= 0 && weeks % r.interval === 0) return cand;
    }
    throw new Error("recurrence: haftalık kural " + REC_SCAN_LIMIT + " gün içinde ilerlemedi");
  }

  // aylık
  let k = Math.max(0, Math.floor(monthsBetween(anchor, from) / r.interval));
  for (let i = 0; i <= REC_MONTH_LIMIT; i++){
    const cand = monthlyAt(r.anchor, k + i, r.interval);
    if (parseYmd(cand) > from) return cand;
  }
  throw new Error("recurrence: aylık kural " + REC_MONTH_LIMIT + " adımda ilerlemedi");
}

/** `fromYmd` DAHİL, kurala uyan ilk gün. Yakalama için: "her pazartesi rapor"
 *  yazıldığında görevin son tarihi ilk pazartesi olmalı. */
function firstOccurrence(rule, fromYmd){
  const r = normalizeRule(rule);
  if (!r || !parseYmd(fromYmd)) return null;
  return nextOccurrence(r, addDays(fromYmd, -1));
}

/** Arayüzün çevireceği açıklama. Metin ÜRETMEZ — i18n anahtarı ve değişkenler
 *  döner; saf çekirdek dil bilmez. */
function describeRule(rule){
  const r = normalizeRule(rule);
  if (!r) return null;
  if (r.freq === "weekly" && r.byDay) return { key: "rec_weekly_days", interval: r.interval, days: r.byDay };
  return { key: "rec_" + r.freq, interval: r.interval, days: null };
}
