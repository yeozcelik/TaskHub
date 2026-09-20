/* ------------------------------------------------- not içeriği süzgeci ---
 * Zengin metin editörü web'den kopyalanan HTML'i olduğu gibi alır. Bu içerik
 * localStorage'a yazılıp sonra innerHTML ile geri basıldığında, kendi dosyanda
 * saklanmış kod çalışır. Bu yüzden süzgeç izin listesiyle çalışır: bilinmeyen
 * her şey reddedilir, kara liste tutulmaz.
 * Hem yapıştırma anında hem yükleme anında geçirilir — elle düzenlenmiş ya da
 * başkasından gelen bir yedek dosyası da aynı içeriği taşıyabilir. */

// İçeriğiyle birlikte tamamen atılanlar.
const DROP_TAGS = {
  SCRIPT:1, STYLE:1, IFRAME:1, OBJECT:1, EMBED:1, FORM:1, INPUT:1, BUTTON:1,
  SELECT:1, TEXTAREA:1, OPTION:1, LINK:1, META:1, BASE:1, TITLE:1, NOSCRIPT:1,
  SVG:1, MATH:1, TEMPLATE:1, AUDIO:1, VIDEO:1, SOURCE:1, CANVAS:1, APPLET:1, FRAME:1, FRAMESET:1
};
// Korunan etiketler. DIV bilerek içeride: contenteditable satır sonlarını
// <div> ile üretir, atılırsa her yeniden yüklemede satırlar birleşir.
const OK_TAGS = {
  P:1, DIV:1, BR:1, H1:1, H2:1, H3:1, B:1, STRONG:1, I:1, EM:1, U:1, S:1, STRIKE:1,
  UL:1, OL:1, LI:1, A:1, CODE:1, PRE:1, BLOCKQUOTE:1, HR:1, MARK:1, SPAN:1, IMG:1,
  TABLE:1, THEAD:1, TBODY:1, TFOOT:1, TR:1, TD:1, TH:1, CAPTION:1
};
const VOID_TAGS = { BR:1, HR:1, IMG:1 };
// class niteliğinde yalnızca bu adlar kalır.
const OK_CLASS = {
  // hl-* eski notlarda kalan vurgu sınıfları; yeni içerik satır içi
  // background-color yazar (tek kanonik temsil). Eskiler okunur kalsın diye durur.
  "hl-y":1, "hl-g":1, "hl-b":1, "hl-p":1,
  "todo":1, "done":1,
  "img-sm":1, "img-md":1, "img-lg":1,
  "note-link":1,
  "fs-xs":1, "fs-s":1, "fs-m":1, "fs-l":1, "fs-xl":1,
  // Kaydedilmezse her yüklemede yeni bir sarmalayıcı eklenip birikirdi.
  "tbl-wrap":1
};
const MAX_DEPTH = 40;

function safeUrl(u){
  const s = String(u == null ? "" : u).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return /^(https?:\/\/|mailto:)/i.test(s) ? s : null;
}
function safeImgSrc(u){
  const s = String(u == null ? "" : u).replace(/\s/g, "");
  return /^data:image\/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(s) ? s : null;
}

function cleanFragment(src, doc, depth, inTable){
  const frag = doc.createDocumentFragment();
  for (let n = src.firstChild; n; n = n.nextSibling){
    if (n.nodeType === 3){ frag.appendChild(doc.createTextNode(n.nodeValue)); continue; }
    if (n.nodeType !== 1) continue;                       // yorum ve diğerleri düşer
    const tag = n.tagName.toUpperCase();
    if (DROP_TAGS[tag]) continue;
    // İzinsiz ama zararsız etiket (table, font, section…): açılır, metni korunur.
    if (!OK_TAGS[tag] || depth >= MAX_DEPTH){ frag.appendChild(cleanFragment(n, doc, depth + 1, inTable)); continue; }

    const out = doc.createElement(tag);
    const attrs = n.attributes;
    for (let i = 0; i < attrs.length; i++){
      const name = attrs[i].name.toLowerCase(), val = attrs[i].value;
      if (name === "href" && tag === "A"){
        const u = safeUrl(val);
        if (u){ out.setAttribute("href", u); out.setAttribute("rel", "noopener noreferrer"); out.setAttribute("target", "_blank"); }
      } else if (name === "src" && tag === "IMG"){
        const u = safeImgSrc(val);
        if (u) out.setAttribute("src", u);
      } else if (name === "alt" && tag === "IMG"){
        out.setAttribute("alt", val.slice(0, 200));
      } else if (name === "width" && tag === "IMG"){
        // Genişlik satır içi stille değil HTML niteliğiyle saklanır; style süzgeçten geçmiyor.
        const n = parseInt(val, 10);
        if (isFinite(n) && n >= 40 && n <= 1600) out.setAttribute("width", String(n));
      } else if (name === "class"){
        const cls = val.split(/\s+/).filter(c => OK_CLASS[c]);
        if (cls.length) out.setAttribute("class", cls.join(" "));
      } else if (name === "data-task"){
        if (/^[A-Za-z0-9_-]{1,64}$/.test(val)) out.setAttribute("data-task", val);
      } else if (name === "style"){
        // DAR GEÇİT: yalnızca iki özellik ve yalnızca doğrulanmış renk değerleri.
        // Değer YENİDEN ÜRETİLİR; ham stil dizesi hiçbir yoldan geçmez, bu yüzden
        // position/url()/expression() gibi hiçbir şey hayatta kalamaz.
        const decls = parseStyleDecls(val), keep = [];
        const fg = normColor(decls["color"]);
        const bg = normColor(decls["background-color"]);
        if (fg) keep.push("color:" + fg);
        if (bg) keep.push("background-color:" + bg);
        if (keep.length) out.setAttribute("style", keep.join(";"));
      } else if ((name === "colspan" || name === "rowspan") && (tag === "TD" || tag === "TH")){
        const n2 = parseInt(val, 10);
        if (isFinite(n2) && n2 >= 1 && n2 <= 99) out.setAttribute(name, String(n2));
      }
      // Geri kalan her şey — özellikle style ve on* — düşer.
    }
    if (tag === "IMG" && !out.getAttribute("src")) continue;
    if (VOID_TAGS[tag]){ frag.appendChild(out); continue; }
    if (tag === "TABLE" && inTable){
      // İç içe tablo açılır: düzenleme modelini çözümsüz hale getirirdi.
      frag.appendChild(cleanFragment(n, doc, depth + 1, inTable));
      continue;
    }
    // Bağlantı hedefi hayatta kalmadıysa etiketi tutmanın anlamı yok, açılır.
    if (tag === "A" && !out.hasAttribute("href") && !out.hasAttribute("data-task")){
      frag.appendChild(cleanFragment(n, doc, depth + 1, inTable));
      continue;
    }
    out.appendChild(cleanFragment(n, doc, depth + 1, inTable || tag === "TABLE"));
    frag.appendChild(out);
  }
  return frag;
}

/* ============ SUNUM BİÇİMİNİ ANLAMSAL ETİKETE ÇEVİRME (Word/OneNote) ======
 * Word ve OneNote biçimi neredeyse tamamen style="font-weight:700" gibi
 * niteliklerle taşır. Süzgeç style'ı attığı için geriye çıplak metin kalıyordu.
 * Çözüm: ATMADAN ÖNCE niteliğin anlamını okuyup izinli etiketlere çevirmek.
 *
 * Naif "öğeyi <b> ile sar" yaklaşımı iç içe çelişen stillerde bozulur:
 * font-weight:700 içindeki font-weight:400 temsil edilemez. Bu yüzden çeviri
 * ÇALIŞMA TABANLIDIR — her metin parçası için etkin biçim atalardan hesaplanır
 * ve çıktı sıfırdan, sabit bir sırayla üretilir. İdempotentlik bunun sonucudur:
 * f(f(x)) === f(x). */

const CSS_NAMES = {
  black:"#000000", silver:"#c0c0c0", gray:"#808080", grey:"#808080", white:"#ffffff",
  maroon:"#800000", red:"#ff0000", purple:"#800080", fuchsia:"#ff00ff", magenta:"#ff00ff",
  green:"#008000", lime:"#00ff00", olive:"#808000", yellow:"#ffff00", navy:"#000080",
  blue:"#0000ff", teal:"#008080", aqua:"#00ffff", cyan:"#00ffff", orange:"#ffa500",
  windowtext:"#000000"
};
/** Yalnızca hex, rgb() ve temel adlar. rgba/hsl/yüzde/transparent/currentColor
 *  bilerek desteklenmiyor — değer daima #rrggbb olarak YENİDEN ÜRETİLİR, ham
 *  dize hiçbir yoldan geçmez. */
function normColor(v){
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (!s) return null;
  if (CSS_NAMES[s]) return CSS_NAMES[s];
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return "#" + m[1].charAt(0) + m[1].charAt(0) + m[1].charAt(1) + m[1].charAt(1) + m[1].charAt(2) + m[1].charAt(2);
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return "#" + m[1];
  m = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(s);
  if (m){
    const h = n => { const x = Math.max(0, Math.min(255, parseInt(n, 10))); return (x < 16 ? "0" : "") + x.toString(16); };
    return "#" + h(m[1]) + h(m[2]) + h(m[3]);
  }
  return null;
}

/* Serbest px saklanmaz, beş kademeye yuvarlanır: sayfa düzenini bozmasın.
   Aralıklar Word'ün gerçek puntolarına göre seçildi — 11pt (=14.67px) Word'ün
   varsayılan gövde puntosudur ve "normal" sayılmalıdır, aksi halde her Word
   belgesi küçük görünürdü. 14pt=18.67 ve 16pt=21.3 başlık sayılır. */
const FS_RANGES = [
  [12.5, "fs-xs"],   // < 12.5px  (≤ 9pt)
  [14.0, "fs-s"],    // 12.5–14   (10pt)
  [18.0, null],      // 14–18     (11pt, 12pt, 13pt → normal)
  [26.0, "fs-l"],    // 18–26     (14pt, 16pt, 18pt)
  [Infinity, "fs-xl"]
];
function normFontSize(v){
  const s = String(v == null ? "" : v).trim().toLowerCase();
  let px = null, m;
  if ((m = /^([\d.]+)\s*pt$/.exec(s))) px = parseFloat(m[1]) * 4 / 3;
  else if ((m = /^([\d.]+)\s*px$/.exec(s))) px = parseFloat(m[1]);
  else if ((m = /^([\d.]+)\s*em$/.exec(s))) px = parseFloat(m[1]) * 16;
  else if ((m = /^([\d.]+)\s*%$/.exec(s))) px = parseFloat(m[1]) / 100 * 16;
  if (px === null || !isFinite(px) || px <= 0) return null;
  for (let i = 0; i < FS_RANGES.length; i++) if (px < FS_RANGES[i][0]) return FS_RANGES[i][1];
  return "fs-xl";
}

function parseStyleDecls(styleStr){
  const out = {};
  String(styleStr == null ? "" : styleStr).split(";").forEach(part => {
    const i = part.indexOf(":");
    if (i < 0) return;
    const k = part.slice(0, i).trim().toLowerCase();
    const v = part.slice(i + 1).replace(/!important/ig, "").trim();
    if (k && v) out[k] = v;
  });
  return out;
}

const EMPTY_STYLE = { b:false, i:false, u:false, s:false, color:null, bg:null, fs:null };

/** Bir öğenin etkin biçime katkısı. Sıfırlayan değerler (normal / 400 / none)
 *  bayrağı KAPATIR — iç içe çelişkinin doğru çözüldüğü yer burası. */
function styleContribution(el, st){
  const n = { b:st.b, i:st.i, u:st.u, s:st.s, color:st.color, bg:st.bg, fs:st.fs };
  const tag = el.tagName.toUpperCase();
  if (tag === "B" || tag === "STRONG") n.b = true;
  if (tag === "I" || tag === "EM") n.i = true;
  if (tag === "U" || tag === "INS") n.u = true;
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") n.s = true;
  if (tag === "MARK" && !n.bg) n.bg = "#fde68a";
  if (tag === "FONT"){
    const c = normColor(el.getAttribute("color"));
    if (c) n.color = c;
    const sz = parseInt(el.getAttribute("size"), 10);
    if (isFinite(sz)) n.fs = normFontSize([10,13,16,18,24,32,48][Math.max(1, Math.min(7, sz)) - 1] + "px");
  }
  // Kendi çıktımızı geri okumak zorundayız, yoksa ikinci geçiş bilgiyi düşürür
  // ve f(f(x)) === f(x) bozulur.
  const ownCls = String(el.className || "");
  const fsm = /(^|\s)(fs-(?:xs|s|m|l|xl))(\s|$)/.exec(ownCls);
  if (fsm) n.fs = fsm[2] === "fs-m" ? null : fsm[2];
  const hlm = /(^|\s)hl-([ygbp])(\s|$)/.exec(ownCls);   // eski notlardaki vurgu sınıfları
  if (hlm) n.bg = { y:"#fde68a", g:"#bbf7d0", b:"#bfdbfe", p:"#f5d0fe" }[hlm[2]];

  const d = parseStyleDecls(el.getAttribute("style"));
  if (d["font-weight"]){
    const w = d["font-weight"].toLowerCase(), num = parseFloat(w);
    if (w === "bold" || w === "bolder" || (isFinite(num) && num >= 600)) n.b = true;
    else if (w === "normal" || w === "lighter" || (isFinite(num) && num < 600)) n.b = false;
  }
  if (d["font-style"]){
    const v = d["font-style"].toLowerCase();
    if (v === "italic" || v === "oblique") n.i = true;
    else if (v === "normal") n.i = false;
  }
  const td = String(d["text-decoration"] || d["text-decoration-line"] || "").toLowerCase();
  if (td){
    if (/\bnone\b/.test(td)){ n.u = false; n.s = false; }
    if (/underline/.test(td)) n.u = true;
    if (/line-through/.test(td)) n.s = true;
  }
  if (d["color"]){ const c = normColor(d["color"]); if (c) n.color = c; }
  const bgRaw = d["background-color"] || d["background"];
  if (bgRaw){ const c = normColor(String(bgRaw).split(/\s+/)[0]); if (c) n.bg = c; }
  if (d["font-size"]) n.fs = normFontSize(d["font-size"]);
  return n;
}

/** Metin parçasını etkin biçimden SIFIRDAN sarar. Sıra sabittir (b > i > u > s
 *  > span), böylece ikinci geçiş aynı çıktıyı üretir. */
function wrapRun(doc, text, st){
  let node = doc.createTextNode(text);
  if (st.color || st.bg || st.fs){
    const span = doc.createElement("span");
    const decls = [];
    if (st.color) decls.push("color:" + st.color);
    if (st.bg) decls.push("background-color:" + st.bg);
    if (decls.length) span.setAttribute("style", decls.join(";"));
    if (st.fs) span.setAttribute("class", st.fs);
    span.appendChild(node);
    node = span;
  }
  const order = [["s","s"],["u","u"],["i","i"],["b","b"]];
  for (let i = 0; i < order.length; i++){
    if (st[order[i][0]]){
      const e = doc.createElement(order[i][1]);
      e.appendChild(node);
      node = e;
    }
  }
  return node;
}

const KEEP_BLOCK = { P:1, DIV:1, H1:1, H2:1, H3:1, UL:1, OL:1, LI:1, BLOCKQUOTE:1, PRE:1,
                     TABLE:1, THEAD:1, TBODY:1, TFOOT:1, TR:1, TD:1, TH:1, CAPTION:1 };
const KEEP_VOID2 = { BR:1, HR:1, IMG:1 };
const KEEP_INLINE = { A:1, CODE:1 };

function copyStructAttrs(src, dst, tag){
  if (tag === "A" && src.getAttribute("href")) dst.setAttribute("href", src.getAttribute("href"));
  if (tag === "IMG"){
    if (src.getAttribute("src")) dst.setAttribute("src", src.getAttribute("src"));
    if (src.getAttribute("alt")) dst.setAttribute("alt", src.getAttribute("alt"));
    if (src.getAttribute("width")) dst.setAttribute("width", src.getAttribute("width"));
  }
  if (tag === "TD" || tag === "TH"){
    ["colspan","rowspan"].forEach(a => { if (src.getAttribute(a)) dst.setAttribute(a, src.getAttribute(a)); });
  }
  // Yalnızca kendi sınıflarımız taşınır; Mso* ve benzeri düşer.
  const cls = String(src.className || "").split(/\s+/).filter(c => OK_CLASS[c]);
  if (cls.length) dst.setAttribute("class", cls.join(" "));
  if (src.hasAttribute && src.hasAttribute("data-task")) dst.setAttribute("data-task", src.getAttribute("data-task"));
}

function rebuildRuns(src, doc, st, depth){
  const frag = doc.createDocumentFragment();
  for (let n = src.firstChild; n; n = n.nextSibling){
    if (n.nodeType === 3){
      if (!n.nodeValue) continue;
      // Yalnızca boşluktan ibaret parçaları sarmalamak <b> </b> gibi artık üretir.
      if (!/\S/.test(n.nodeValue)) frag.appendChild(doc.createTextNode(n.nodeValue));
      else frag.appendChild(wrapRun(doc, n.nodeValue, st));
      continue;
    }
    if (n.nodeType !== 1) continue;
    const tag = n.tagName.toUpperCase();
    if (DROP_TAGS[tag]) continue;
    if (depth > MAX_DEPTH){ frag.appendChild(rebuildRuns(n, doc, st, depth + 1)); continue; }
    if (KEEP_VOID2[tag]){
      const e = doc.createElement(tag);
      copyStructAttrs(n, e, tag);
      frag.appendChild(e);
      continue;
    }
    // Görev bağlantısı (data-task) korunmalı: notlar arasında kopyala-yapıştır
    // yaptığında bağ kopmasın.
    if (n.hasAttribute && n.hasAttribute("data-task")){
      const e = doc.createElement(tag === "A" ? "a" : "span");
      copyStructAttrs(n, e, tag);
      e.setAttribute("data-task", n.getAttribute("data-task"));
      const cls = String(n.className || "");
      if (/note-link/.test(cls)) e.setAttribute("class", "note-link");
      e.appendChild(rebuildRuns(n, doc, styleContribution(n, st), depth + 1));
      frag.appendChild(e);
      continue;
    }
    if (KEEP_BLOCK[tag] || KEEP_INLINE[tag]){
      const e = doc.createElement(tag);
      copyStructAttrs(n, e, tag);
      e.appendChild(rebuildRuns(n, doc, styleContribution(n, st), depth + 1));
      frag.appendChild(e);
      continue;
    }
    // span, font, b, i, u, s, mark, section, o:p … : açılır, biçimi biriktirilir
    frag.appendChild(rebuildRuns(n, doc, styleContribution(n, st), depth + 1));
  }
  return frag;
}

/* ------------------------------------------------ Word listeleri (tek seviye)
 * DESTEKLENEN: tek seviyeli madde işaretli ve ondalık numaralı listeler.
 * DESTEKLENMEYEN ama KAYBOLMAYAN: çok seviyeli (level2+), a./A./i./IV. biçimleri,
 * 1'den farklı başlangıç — bunlar paragraf olarak korunur. */
const WL_BULLET = /^\s*[·•●▪■◦§]\s*/;
const WL_DECIMAL = /^\s*\d{1,3}[.)]\s+/;

function wordListInfo(el){
  const style = String(el.getAttribute("style") || "");
  const cls = String(el.className || "");
  const isWord = /mso-list/i.test(style) || /MsoListParagraph|MsoListBullet|MsoListNumber/i.test(cls);
  const lvl = /level\s*(\d+)/i.exec(style);
  if (isWord && lvl && parseInt(lvl[1], 10) > 1) return null;   // çok seviyeli: paragraf kalsın
  const text = String(el.textContent || "");
  if (WL_DECIMAL.test(text)) return { type:"ol", re: WL_DECIMAL };
  if (WL_BULLET.test(text)) return { type:"ul", re: WL_BULLET };
  if (isWord && /^\s*o\s+\S/.test(text)) return { type:"ul", re: /^\s*o\s+/ };  // Word'ün "o" madde işareti
  if (isWord) return { type:"ul", re: null };
  return null;
}
function firstTextNode(el){
  const w = [el];
  while (w.length){
    const n = w.shift();
    if (n.nodeType === 3 && /\S/.test(n.nodeValue)) return n;
    for (let c = n.firstChild; c; c = c.nextSibling) w.push(c);
  }
  return null;
}
function wordListPass(doc){
  // Word işaretçiyi ayrı bir kapta taşır. Çok seviyeli maddeleri listeye
  // ÇEVİRMİYORUZ ama işaretçi kabını yine de atmalıyız; yoksa paragrafın
  // başında yazım hatası gibi duran bir "o" ya da "·" kalır.
  const markers = doc.body.querySelectorAll('span[style*="mso-list"]');
  for (let m = 0; m < markers.length; m++){
    const el = markers[m];
    if (/ignore/i.test(el.getAttribute("style") || "") && el.parentNode) el.parentNode.removeChild(el);
  }
  const blocks = [].slice.call(doc.body.querySelectorAll("p,div"));
  let i = 0;
  while (i < blocks.length){
    const info = wordListInfo(blocks[i]);
    if (!info){ i++; continue; }
    const group = [blocks[i]];
    let j = i + 1;
    while (j < blocks.length){
      const inf2 = wordListInfo(blocks[j]);
      if (!inf2 || inf2.type !== info.type) break;
      if (blocks[j].parentNode !== blocks[j - 1].parentNode) break;
      if (blocks[j].previousElementSibling !== blocks[j - 1]) break;  // araya normal paragraf girdiyse kes
      group.push(blocks[j]); j++;
    }
    const list = doc.createElement(info.type);
    for (let k = 0; k < group.length; k++){
      const p = group[k];
      if (info.re){
        const tn = firstTextNode(p);
        if (tn) tn.nodeValue = tn.nodeValue.replace(info.re, "");
      }
      const li = doc.createElement("li");
      while (p.firstChild) li.appendChild(p.firstChild);
      list.appendChild(li);
    }
    group[0].parentNode.insertBefore(list, group[0]);
    for (let k = 0; k < group.length; k++) if (group[k].parentNode) group[k].parentNode.removeChild(group[k]);
    i = j;
  }
}

function presentationalToSemantic(html){
  let doc;
  try { doc = scratchDoc(html); } catch(e){ return String(html == null ? "" : html); }
  try { wordListPass(doc); } catch(e){ /* liste sezimi başarısızsa içerik yine gelsin */ }
  const out = document.implementation.createHTMLDocument("");
  out.body.appendChild(rebuildRuns(doc.body, out, EMPTY_STYLE, 0));
  return out.body.innerHTML;
}

/** Canlı belgeye hiç değmeden ayrıştırır: createHTMLDocument'in tarama bağlamı
 *  olmadığı için ayrıştırma sırasında script çalışmaz, resim yüklenmez. */
function scratchDoc(html){
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = String(html == null ? "" : html);
  return doc;
}

function sanitizeHtml(html){
  let doc;
  try { doc = scratchDoc(html); } catch(e){ return ""; }
  const out = document.implementation.createHTMLDocument("");
  out.body.appendChild(cleanFragment(doc.body, out, 0, false));
  return out.body.innerHTML;
}

/** Biçimli içerikten düz metin — arama ve önizleme için.
 *  textContent blok sınırlarını yok sayar ve "…maddeleriBu satır…" gibi
 *  yapışık çıktı verir; bu hem önizlemeyi okunmaz yapar hem de bloklar arası
 *  geçen bir arama ifadesinin eşleşmesini engeller. Bloklardan sonra boşluk
 *  eklenir. */
const BLOCK_SEL = "p,div,h1,h2,h3,li,blockquote,pre,br,hr,tr,td";
function noteText(html){
  let doc;
  try { doc = scratchDoc(html); } catch(e){ return ""; }
  const blocks = doc.body.querySelectorAll(BLOCK_SEL);
  for (let i = 0; i < blocks.length; i++){
    const b = blocks[i];
    if (b.parentNode) b.parentNode.insertBefore(doc.createTextNode(" "), b.nextSibling);
  }
  return String(doc.body.textContent || "").replace(/\s+/g, " ").trim();
}

