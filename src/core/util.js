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
function daysBetween(aY, bY){
  const a = parseYmd(aY), b = parseYmd(bY);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
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

const ts = x => { const n = Date.parse(x); return isNaN(n) ? 0 : n; };
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

