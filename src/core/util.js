/* ------------------------------------------------------ saf yardımcılar */

/** Arama için harf katlama.
 *  toLocaleLowerCase("tr") KULLANILMAZ: Türkçe locale I→ı, İ→i eşlediği için
 *  "istanbul" araması "İstanbul"u bulamaz. Burada ı/İ/I/i tek havuza indirilir. */
function foldTr(s){
  if (s == null) return "";
  return String(s)
    .replace(/[İIı]/g, "i")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const clamp = (v, lo, hi) => v < lo ? lo : (v > hi ? hi : v);
const numOr = (v, d) => (typeof v === "number" && isFinite(v)) ? v : d;

const pad2 = n => String(n).padStart(2, "0");
/** Date -> "YYYY-MM-DD", yerel saatle. */
function ymd(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
/** "YYYY-MM-DD" -> yerel gece yarısı Date. Date.parse UTC yorumlar, gün kaydırır. */
function parseYmd(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  return isNaN(d) ? null : d;
}
/** b - a, tam gün. Yaz saati geçişlerinde 23/25 saat olabildiği için yuvarlanır. */
/* Gün ekleme/çıkarma. YEREL saatle: Date.parse("YYYY-MM-DD") UTC yorumlayıp
   günü kaydırır, o yüzden parseYmd üzerinden gidilir. Ay/yıl taşmasını ve yaz
   saati geçişlerini JS'in kendi takvim aritmetiğine bırakırız — saat ekleyip
   çıkarmak DST haftasında günü yineletir ya da atlatır. */
const addDays = (ymdStr, n) => {
  const d = parseYmd(ymdStr);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/* GÜN FARKI ÖNBELLEĞİ.
 *
 * Ölçüldü (5.000 görev, `bucketOf` üzerinden): kovalama 5,2 ms sürüyordu ve
 * bunun 5,0 ms'si `parseYmd` çağrılarıydı — görev başına İKİ tane, üstelik
 * biri her seferinde aynı `today` dizesi için. Sonuç iki dizenin saf
 * fonksiyonu olduğundan hatırlanabilir.
 *
 * İki katmanlı: dış anahtar `aY` (neredeyse hep `today`), iç anahtar `bY`.
 * Tek katmanlı bir önbellek `aY + "|" + bY` dizesini her çağrıda kurardı;
 * yineleme başına 5.000 kısa ömürlü dize demek bu. İç içe iki `Map.get`
 * hiçbir şey ayırmıyor.
 *
 * SINIR: sonuç yerel saat dilimine bağlıdır (`parseYmd` yerel gece yarısı
 * üretir). Oturum ortasında saat dilimi değişirse önbellek bayatlar; tarayıcı
 * bunu yeniden yükleme olmadan yapmaz, `today` da zaten açılışta bir kez
 * hesaplanır. */
const DB_CACHE = new Map();
const DB_MAX = 4096;

function daysBetween(aY, bY){
  let inner = DB_CACHE.get(aY);
  if (inner){
    const hit = inner.get(bY);
    if (hit !== undefined) return hit;
  } else {
    if (DB_CACHE.size > 8) DB_CACHE.clear();
    inner = new Map();
    DB_CACHE.set(aY, inner);
  }
  const a = parseYmd(aY), b = parseYmd(bY);
  const v = (!a || !b) ? null : Math.round((b - a) / 86400000);
  if (inner.size > DB_MAX) inner.clear();
  inner.set(bY, v);
  return v;
}

const BUCKETS = ["overdue","today","tomorrow","week","later","nodate","completed"];
/** Görevin hangi vade grubuna düştüğü. */
function bucketOf(task, todayY){
  if (task.done) return "completed";
  if (!task.dueDate) return "nodate";
  const d = daysBetween(todayY, task.dueDate);
  if (d === null) return "nodate";
  if (d < 0) return "overdue";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d <= 7) return "week";
  return "later";
}

const CSV_DELIM = ";"; // Türkçe Excel'in beklediği alan ayırıcısı
function csvEscape(v, delim){
  const d = delim || CSV_DELIM;
  const s = v == null ? "" : String(v);
  return /["\r\n]/.test(s) || s.indexOf(d) !== -1 ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* `Date.parse` ucuz değil: 5.000 görevi sıralarken `ts(createdAt)` tek başına
   1,3 ms. Damgalar değişmeyen dizeler olduğundan dize → sayı eşlemesi
   hatırlanabilir; ISO damgaları saat diliminden bağımsız okunur. */
const TS_CACHE = new Map();
const TS_MAX = 8192;
const ts = x => {
  if (typeof x !== "string"){ const n = Date.parse(x); return isNaN(n) ? 0 : n; }
  const hit = TS_CACHE.get(x);
  if (hit !== undefined) return hit;
  const n = Date.parse(x), v = isNaN(n) ? 0 : n;
  if (TS_CACHE.size > TS_MAX) TS_CACHE.clear();
  TS_CACHE.set(x, v);
  return v;
};
/** id çakışmasında updatedAt'i yeni olan kazanır. */
function mergeImport(current, incoming){
  const out = current.slice();
  const idx = new Map(out.map((t, i) => [t.id, i]));
  let added = 0, updated = 0, kept = 0;
  for (const inc of incoming){
    if (!idx.has(inc.id)){ idx.set(inc.id, out.length); out.push(inc); added++; }
    else {
      const i = idx.get(inc.id);
      if (ts(inc.updatedAt) > ts(out[i].updatedAt)){ out[i] = inc; updated++; }
      else kept++;
    }
  }
  return { tasks: out, added, updated, kept };
}

