/* ---------------------------------------------------------- bağlantılar ---
 * `[[Sayfa adı]]` — görevleri ve not sayfalarını birbirine bağlar.
 * Obsidian yasası (CAPABILITY-MAP.md): şeyler birbirine bağlanır.
 *
 * GÜVENLİK SINIRI — bilinçli ve dar:
 * Bu dosya HTML ÜRETMEZ. Yalnız metin içindeki aralıkları ve adları bulur;
 * tıklanabilir öğeyi arayüz `document.createElement` ile kurar, `innerHTML`
 * ile değil. Yeni bir ayrıştırılmış sözdizimi yeni bir saldırı yüzeyidir;
 * o yüzden bu sözdizimi mevcut izin listesi süzgecine hiç DOKUNMAZ.
 *
 * KAPSAM SINIRI — kayıtlı ve gerekçeli:
 * Not kutularının HTML'i YENİDEN YAZILMAZ. Tuvalin geri alma yığını
 * `#editor`in `innerHTML` anlık görüntülerine dayanıyor (README, "Geri almanın
 * kökü kutu değil, tuvaldir"); oraya öğe enjekte etmek hem geri almayı sessizce
 * bozar hem de süzgeçten geçmemiş içerik üretir. Notlardaki bağlantılar bu
 * yüzden TANINIR ve indekslenir (geri-bağlantı paneli onları gösterir) ama
 * kutunun içinde tıklanabilir hâle getirilmez.                              */

/* İç içe köşeli parantez ve satır sonu kabul edilmez: "[[a]] ve [[b]]" iki
   ayrı bağlantıdır, "[[a [[b]]" hiçbiri. */
const WIKI_RE = /\[\[([^\[\]\n]{1,120})\]\]/g;

/** Eşleştirme anahtarı. Türkçe harf katlamalı: "[[İstanbul]]" ile
 *  "[[istanbul]]" aynı sayfayı gösterir. Boşluklar sadeleşir. */
function linkKey(name){
  return foldTr(String(name == null ? "" : name)).replace(/\s+/g, " ").trim();
}

/** Metindeki bağlantılar, konumlarıyla. Arayüz metni bu aralıklara göre böler. */
function extractLinks(text){
  const src = typeof text === "string" ? text : "";
  const out = [];
  for (const m of src.matchAll(WIKI_RE)){
    const name = m[1].trim();
    if (!name) continue;
    out.push({ raw: m[0], name, key: linkKey(name), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Metni bağlantı ve düz parça dizisine böler. Arayüz her parçayı ayrı bir
 *  DOM düğümü olarak kurar; hiçbir yerde HTML birleştirmesi yoktur. */
function splitByLinks(text){
  const src = typeof text === "string" ? text : "";
  const links = extractLinks(src);
  const parts = [];
  let at = 0;
  for (const l of links){
    if (l.start > at) parts.push({ type: "text", text: src.slice(at, l.start) });
    parts.push({ type: "link", text: l.name, key: l.key });
    at = l.end;
  }
  if (at < src.length) parts.push({ type: "text", text: src.slice(at) });
  return parts;
}

/**
 * Geri-bağlantı indeksi. `pageText(page)` sayfanın düz metnini döndürmeli
 * (arayüz `pagePlain`i verir; bu dosya DOM bilmez).
 * @returns Map<key, { tasks: [...], pages: [...] }>
 */
function buildLinkIndex(tasks, notebooks, pageText){
  const index = new Map();
  const bucket = key => {
    if (!index.has(key)) index.set(key, { tasks: [], pages: [] });
    return index.get(key);
  };
  for (const task of (tasks || [])){
    const seen = new Set();
    for (const l of extractLinks(task.title)){
      if (seen.has(l.key)) continue;           // aynı görev bir sayfayı bir kez sayar
      seen.add(l.key);
      bucket(l.key).tasks.push(task);
    }
  }
  for (const nb of (notebooks || [])){
    for (const page of (nb.pages || [])){
      const text = pageText ? pageText(page) : "";
      const seen = new Set();
      for (const l of extractLinks(page.title + " " + text)){
        if (seen.has(l.key)) continue;
        seen.add(l.key);
        bucket(l.key).pages.push({ notebookId: nb.id, page });
      }
    }
  }
  return index;
}

/** Bir sayfaya gelen bağlantılar. Sayfa yoksa da çalışır (henüz yaratılmamış
 *  sayfaya bağlantı KIRIK DEĞİL, bir davettir). */
function backlinksFor(index, pageTitle){
  return index.get(linkKey(pageTitle)) || { tasks: [], pages: [] };
}

/** Adla eşleşen sayfayı bulur. Türkçe harf katlamalı. */
function findPageByName(notebooks, name){
  const key = linkKey(name);
  if (!key) return null;
  for (const nb of (notebooks || [])){
    for (const page of (nb.pages || [])){
      if (linkKey(page.title) === key) return { notebookId: nb.id, page };
    }
  }
  return null;
}
