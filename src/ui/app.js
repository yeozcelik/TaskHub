/* ------------------------------------------------------------ uygulama durumu */
let state = defaultState();
let notes = defaultNotes();
let today = ymd(new Date());
let openTaskId = null;
let lastFocused = null;
const ui = {
  q:"", status:"all", prios:new Set(), tags:new Set(), showCompleted:true, nagHidden:false,
  view:"tasks",          // "tasks" | "notes"
  taskView:"list",       // "list" | "board" | "calendar" — AYNI veriye izdüşümler (Notion yasası)
  sel:new Set(),         // seçili görev kimlikleri
  selAnchor:null,        // aralık seçiminin çapası
  selOrder:[],           // görünen anahtarlar, EKRANDAKİ sırayla (aralık/klavye için)
  calYm:null,            // takvimde görüntülenen ay: { y, m } — null = bu ay
  nbId:null, pageId:null // seçili defter ve sayfa
};

/* ------------------------------------------------------------- DOM yardımcısı */
function el(tag, props, ...children){
  const n = document.createElement(tag);
  if (props) for (const k in props){
    const v = props[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "svg") n.innerHTML = v;               // yalnızca sabit ICON değerleri
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.slice(0,2) === "on") n.addEventListener(k.slice(2).toLowerCase(), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  // Array.prototype.flat yerine elle düzleştirme — eski motorlarda da çalışsın.
  (function walk(items){
    for (let i = 0; i < items.length; i++){
      const c = items[i];
      if (c === null || c === undefined || c === false || c === "") continue;
      if (Array.isArray(c)){ walk(c); continue; }
      n.appendChild(c && c.nodeType ? c : document.createTextNode(String(c)));
    }
  })(children);
  return n;
}
const icon = (name, cls) => el("span", { class: cls || "", svg: ICON[name], "aria-hidden":"true" });

/* ------------------------------------------------------------------ toast */
function toast(msg, action, ms){
  const box = document.getElementById("toasts");
  if (!box) return;
  const node = el("div", { class:"toast", role:"status" }, el("span", { class:"grow", text: msg }));
  let timer = null;
  const kill = () => { clearTimeout(timer); node.remove(); };
  if (action){
    node.append(el("button", { class:"btn", onclick(){ kill(); action.run(); } }, action.label));
  }
  node.append(el("button", { class:"btn btn-ghost btn-icon", "aria-label": t("dismiss"), onclick: kill }, icon("x")));
  box.append(node);
  timer = setTimeout(kill, ms || 4500);
}

/* --------------------------------------------------------- görev işlemleri */
function stamp(task){ task.updatedAt = new Date().toISOString(); }
const getTask = id => state.tasks.find(x => x.id === id) || null;

/* `fields` verilmezse davranış eskisiyle birebir aynıdır — nottan görev yapma
   yolu (taskifySelection) düz metin gönderir ve ayrıştırılmamalıdır: not
   içindeki "yarın" kelimesi bir son tarih emri değildir. */
function addTask(title, fields){
  const now = new Date().toISOString();
  const f = fields || {};
  const task = {
    id: uid(), title: title.trim(), notes:"",
    dueDate: f.dueDate || null,
    priority: ["low","med","high"].includes(f.priority) ? f.priority : "med",
    tags: Array.isArray(f.tags) ? f.tags.slice(0, 30) : [],
    recur: normalizeRule(f.recur),
    subtasks:[], done:false, createdAt:now, updatedAt:now, completedAt:null
  };
  state.tasks.push(task);
  scheduleSave(); render();
  return task;
}

/* ------------------------------------------------------------- seçim ---
 * Linear yasası: her şey klavyeden. Things vetosu: seçim YOKKEN ekran
 * bugünküyle birebir aynı — toplu işlem çubuğu ancak seçimle belirir. */
function selCount(){ return ui.sel.size; }

function announceSelection(){
  const live = document.getElementById("selLive");
  if (live) live.textContent = ui.sel.size ? t("selN", { n: ui.sel.size }) : "";
}

function applySel(keys, mode){
  ui.sel = pruneSelection(nextSelection(ui.sel, keys, mode), ui.selOrder);
  renderList();
  announceSelection();
}

function selToggle(id){
  ui.selAnchor = id;
  applySel([id], "toggle");
}

function selRangeTo(id){
  const anchor = ui.selAnchor && ui.selOrder.includes(ui.selAnchor) ? ui.selAnchor : id;
  ui.selAnchor = anchor;
  applySel(rangeBetween(ui.selOrder, anchor, id), "add");
}

function clearSelection(){
  if (!ui.sel.size && !ui.selAnchor) return false;
  ui.sel = new Set();
  ui.selAnchor = null;
  renderList();
  announceSelection();
  return true;
}

/* Klavyeyle gezinme: oklar odağı taşır, Shift+ok seçimi genişletir.
   Uçlarda sarmaz (src/core/selection.js) — listede aşağı basarken başa
   dönmek kullanıcının nerede olduğunu kaybettirir. */
function selArrow(fromId, delta, extend){
  const next = stepKey(ui.selOrder, fromId, delta);
  if (!next) return;
  if (extend){
    if (!ui.selAnchor) ui.selAnchor = fromId;
    ui.sel = pruneSelection(nextSelection(new Set(), rangeBetween(ui.selOrder, ui.selAnchor, next), "add"), ui.selOrder);
    renderList();
    announceSelection();
  }
  const node = document.querySelector('#list .card[data-id="' + CSS.escape(next) + '"]');
  if (node) node.focus({ preventScroll:false });
}

/* ------------------------------------------------------- toplu işlemler ---
 * TEK GERİ ALMA ADIMI. Yarım geri alma — üç görevden ikisinin dönmesi —
 * kullanıcının güvenini tamamen kaybettirir; o yüzden anlık görüntü işlemin
 * TAMAMINI kapsar: etkilenen her görevin önceki hâli VE listedeki konumu.
 *
 * Konum neden saklanıyor: toplu silmeyi geri alırken görevleri sona eklemek
 * sırayı bozar ve "geri alma" bir başka değişiklik hâline gelir. */
function snapshotTasks(ids){
  const out = [];
  for (const id of ids){
    const i = state.tasks.findIndex(x => x.id === id);
    if (i < 0) continue;
    const t0 = state.tasks[i];
    out.push({ i, task: { ...t0, tags: t0.tags.slice(),
      subtasks: t0.subtasks.map(sx => ({ ...sx })) } });
  }
  return out;
}

function restoreSnapshot(snap, spawnedIds){
  // Üretilmiş tekrar örnekleri de geri alınır: yoksa geri alma yarım kalır.
  if (spawnedIds && spawnedIds.length){
    const drop = new Set(spawnedIds);
    state.tasks = state.tasks.filter(x => !drop.has(x.id));
  }
  const ids = new Set(snap.map(x => x.task.id));
  state.tasks = state.tasks.filter(x => !ids.has(x.id));
  for (const { i, task } of snap.slice().sort((a, b) => a.i - b.i)){
    state.tasks.splice(Math.min(i, state.tasks.length), 0, task);
  }
  scheduleSave(); render();
  toast(t("restored"));
}

/** `mutate(ids)` seçimi değiştirir; geri alma tek adımda kurtarır.
 *  @returns üretilen tekrar örneklerinin kimlikleri (varsa) */
function bulkApply(msgKey, mutate, opts){
  const ids = [...ui.sel];
  if (!ids.length) return;
  const snap = snapshotTasks(ids);
  const spawned = mutate(ids) || [];
  if ((opts || {}).clearSelection) { ui.sel = new Set(); ui.selAnchor = null; }
  scheduleSave(); render(); announceSelection();
  toast(t(msgKey, { n: snap.length }),
    { label: t("undo"), run(){ restoreSnapshot(snap, spawned); } }, 8000);
}

const selTasks = ids => ids.map(getTask).filter(Boolean);

function bulkDone(done){
  bulkApply(done ? "bulkDone" : "bulkUndone", ids => {
    const spawned = [];
    for (const task of selTasks(ids)){
      if (task.done === done) continue;
      task.done = done;
      task.completedAt = done ? new Date().toISOString() : null;
      if (done){ const nx = spawnNextOccurrence(task); if (nx) spawned.push(nx.id); }
      stamp(task);
    }
    return spawned;
  });
}

function bulkPriority(p){
  bulkApply("bulkPrio", ids => { for (const task of selTasks(ids)){ task.priority = p; stamp(task); } });
}

function bulkDue(value){
  bulkApply("bulkDue", ids => { for (const task of selTasks(ids)){ task.dueDate = value; stamp(task); } });
}

function bulkTag(tag){
  const v = String(tag || "").trim().replace(/^#/, "");
  if (!v) return;
  bulkApply("bulkTag", ids => {
    for (const task of selTasks(ids)){
      if (!task.tags.includes(v) && task.tags.length < 30){ task.tags.push(v); stamp(task); }
    }
  });
}

function bulkDelete(){
  bulkApply("bulkDeleted", ids => {
    const drop = new Set(ids);
    if (openTaskId && drop.has(openTaskId)) closePanel();
    state.tasks = state.tasks.filter(x => !drop.has(x.id));
  }, { clearSelection: true });
}

/* Toplu işlem çubuğu. SEÇİM YOKSA HİÇ ÇİZİLMEZ (S8): varsayılan ekranda
   kalıcı bir kontrol belirmez. */
function renderBulkBar(){
  const host = document.getElementById("bulkHost");
  if (!host) return;
  host.textContent = "";
  if (!ui.sel.size) return;

  const allDone = [...ui.sel].every(id => { const x = getTask(id); return x && x.done; });
  const btn = (cls, label, title, onclick, ic) => el("button", {
    class:"btn " + cls, title, "aria-label": title, onclick }, ic ? icon(ic) : null, label);

  const tagInput = el("input", { class:"input bulk-tag", type:"text", maxlength:"30",
    placeholder: t("bulkTagPh"), "aria-label": t("bulkTagPh"),
    onkeydown(e){ if (e.key === "Enter"){ e.preventDefault(); bulkTag(e.target.value); e.target.value = ""; } }
  });

  host.append(el("div", { class:"bulkbar", role:"toolbar", "aria-label": t("bulkLbl") },
    el("span", { class:"bulk-n", text: t("selN", { n: ui.sel.size }) }),
    btn("btn-ghost", t(allDone ? "bulkUndoneAct" : "bulkDoneAct"), t(allDone ? "bulkUndoneAct" : "bulkDoneAct"),
        () => bulkDone(!allDone), "check"),
    el("span", { class:"bulk-sep", "aria-hidden":"true" }),
    ...["high","med","low"].map(p => el("button", {
      class:"btn btn-ghost bulk-prio", title: t("bulkPrioTo", { p: t(p) }), "aria-label": t("bulkPrioTo", { p: t(p) }),
      onclick(){ bulkPriority(p); } }, el("span", { class:"dot " + p }), t(p))),
    el("span", { class:"bulk-sep", "aria-hidden":"true" }),
    btn("btn-ghost", t("today"), t("bulkDueToday"), () => bulkDue(today), "cal"),
    btn("btn-ghost", t("bulkDueClear"), t("bulkDueClear"), () => bulkDue(null)),
    tagInput,
    el("span", { class:"grow" }),
    btn("btn-danger", t("delete"), t("bulkDeleteAct"), bulkDelete, "trash"),
    btn("btn-ghost", t("selClear"), t("selClear"), clearSelection, "x")
  ));
}

/* ------------------------------------------------------- yakalama önizleme
 * Todoist yasası: yeni form yok. Yazdığın satırdan okunanlar kutunun ALTINDA
 * çip olarak görünür; yanlışsa çipe basıp reddedersin, metin yerinde kalır.
 *
 * Things vetosu (S8): hiçbir şey tanınmazsa bu alan GİZLİDİR. Varsayılan
 * ekranda kalıcı yeni bir kontrol belirmiyor — yalnız yazarken beliriyor. */
const captureIgnored = new Set();

function readCapture(raw){
  return parseCapture(raw, { today, lang: state.settings.lang, ignore: [...captureIgnored] });
}

/* Kuralı okunur metne çevirir. Saf çekirdek dil bilmez (describeRule yalnız
   anahtar döner); çeviri arayüzün işi. Gün adları Intl'den gelir. */
function recurText(rule){
  const d = describeRule(rule);
  if (!d) return "";
  if (d.key === "rec_weekly_days"){
    const fmt = new Intl.DateTimeFormat(LOCALE(), { weekday: "short" });
    // 2026-03-01 bir pazar; 0..6 oradan sayılır.
    const names = d.days.map(n => fmt.format(new Date(2026, 2, 1 + n))).join(", ");
    return d.interval === 1 ? t("rec_weekly_days", { d: names })
                            : t("rec_weekly_days_n", { n: d.interval, d: names });
  }
  return d.interval === 1 ? t(d.key) : t(d.key + "_n", { n: d.interval });
}

function captureChip(m){
  const label = m.kind === "date" ? t("capDate")
              : m.kind === "priority" ? t("capPriority")
              : m.kind === "recur" ? t("capRecur") : t("capTag");
  const shown = m.kind === "date" ? formatDue(m.value).text || m.value
              : m.kind === "priority" ? t(m.value)
              : m.kind === "recur" ? recurText({ ...m.value, anchor: today })
              : "#" + m.value;
  return el("button", {
    type:"button", class:"cap-chip cap-" + m.kind,
    title: t("capRemove") + ": " + m.text,
    "aria-label": label + ": " + shown + " — " + t("capRemove"),
    onclick(){
      captureIgnored.add(m.text);
      renderCaptureHint(document.getElementById("quick").value);
      document.getElementById("quick").focus();
    }
  }, el("span", { class:"cap-k", text: label }), el("span", { text: shown }), icon("x"));
}

function captureRestoreChip(text){
  return el("button", {
    type:"button", class:"cap-chip cap-off",
    "aria-label": text + " — " + t("capRestore"),
    onclick(){
      captureIgnored.delete(text);
      renderCaptureHint(document.getElementById("quick").value);
      document.getElementById("quick").focus();
    }
  }, el("span", { text }), el("span", { class:"cap-k", text: t("capRestore") }));
}

function renderCaptureHint(raw){
  const host = document.getElementById("captureHint");
  if (!host) return;
  const r = readCapture(raw || "");
  const applied = r.matches.filter(m => m.applied);
  const ignoredHere = [...captureIgnored].filter(x => (raw || "").includes(x));

  if (!applied.length && !ignoredHere.length && !r.unsupported.length){
    host.hidden = true; host.textContent = ""; return;
  }
  host.textContent = "";
  host.hidden = false;
  host.append(el("span", { class:"cap-lead", text: t("capRead") + ":" }));
  for (const m of applied) host.append(captureChip(m));
  for (const x of ignoredHere) host.append(captureRestoreChip(x));
  for (const u of r.unsupported){
    host.append(el("span", { class:"cap-note", text: u.text + " — " + t("capTimeUnsupported") }));
  }
  // Yok sayılan ikinci tarih/öncelik de görünür olsun: sessizce kaybolmaz.
  for (const m of r.matches.filter(x => !x.applied)){
    host.append(el("span", { class:"cap-note", text: m.text + " — " + t("capIgnored") }));
  }
}

function submitQuickAdd(raw){
  const r = readCapture(raw);
  const task = addTask(r.title || raw,
    { dueDate: r.dueDate, priority: r.priority, tags: r.tags, recur: r.recur });
  captureIgnored.clear();
  if (!matches(task)) toast(t("filterOn"), { label: t("clearFilters"), run: clearFilters });
  return task;
}

/* Tekrarlayan görev tamamlanınca BİR SONRAKİ örnek üretilir. Tamamlanan görev
 * SİLİNMEZ — geçmiş olarak kalır, tamamlananlar kovasına düşer.
 *
 * YIĞILMA NEDEN OLMAZ: üretim yalnız tamamlama anında olur, zamana göre değil.
 * Uygulama üç hafta kapalı kalsa bile açılışta hiçbir şey üretilmez; kullanıcı
 * görevi tamamladığında TEK bir sonraki örnek doğar.
 *
 * KAÇIRILAN TEKRARLAR ATLANIR: son tarihi geçmişte kalmış bir görevi bugün
 * tamamlarsanız, sonraki örnek BUGÜNDEN sonrasına düşer — dünden sonrasına
 * değil. Yoksa yeni görev doğar doğmaz gecikmiş olurdu. Üç hafta geç
 * tamamlanan "her pazartesi" üç pazartesi kuyruğa koymaz.
 *
 * `taban = max(sonTarih, bugün)` — erken tamamlarsanız seri kaymaz. */
function spawnNextOccurrence(task){
  if (!task.recur) return null;
  const base = (task.dueDate && task.dueDate > today) ? task.dueDate : today;
  let next;
  try { next = nextOccurrence(task.recur, base); }
  catch (e){ console.error(e); return null; }      // ilerlemeyen kural: sessiz kalma
  if (!next) return null;

  const now = new Date().toISOString();
  const copy = {
    ...task, id: uid(), dueDate: next, done: false, completedAt: null,
    createdAt: now, updatedAt: now,
    subtasks: task.subtasks.map(s => ({ id: uid(), title: s.title, done: false })),
    tags: task.tags.slice(),
  };
  state.tasks.push(copy);
  return copy;
}

function toggleDone(id, done){
  const task = getTask(id); if (!task) return;
  task.done = done;
  task.completedAt = done ? new Date().toISOString() : null;
  const spawned = done ? spawnNextOccurrence(task) : null;
  stamp(task); scheduleSave(); render();
  if (spawned) toast(t("recurSpawned", { d: formatDue(spawned.dueDate).text || spawned.dueDate }), null, 6000);
  // Paneli baştan çizmek yerine yerinde güncelle — aksi halde işaret kutusundaki odak kaybolur.
  if (openTaskId === id) syncPanelDone(task);
}

function syncPanelDone(task){
  const cb = document.getElementById("f-done");
  if (cb) cb.checked = task.done;
  const lbl = document.getElementById("f-done-label");
  if (lbl) lbl.textContent = task.done ? t("yes") : t("no");
  renderPanelMeta(task);
}

function deleteTask(id){
  const i = state.tasks.findIndex(x => x.id === id);
  if (i < 0) return;
  const [task] = state.tasks.splice(i, 1);
  if (openTaskId === id) closePanel();
  scheduleSave(); render();
  toast(t("deleted"), { label: t("undo"), run(){
    state.tasks.splice(Math.min(i, state.tasks.length), 0, task);
    scheduleSave(); render();
    toast(t("restored"));
  }}, 8000);
}

/* ---------------------------------------------------------------- filtreler */
const filtersActive = () => !!(ui.q.trim() || ui.status !== "all" || ui.prios.size || ui.tags.size);
function clearFilters(){
  ui.q = ""; ui.status = "all"; ui.prios.clear(); ui.tags.clear();
  const s = document.getElementById("q"); if (s) s.value = "";
  render();
}
function matches(task){
  if (ui.status === "active" && task.done) return false;
  if (ui.status === "done" && !task.done) return false;
  if (ui.prios.size && !ui.prios.has(task.priority)) return false;
  if (ui.tags.size && !task.tags.some(tg => ui.tags.has(tg))) return false;
  const q = foldTr(ui.q.trim());
  if (!q) return true;
  const hay = foldTr([task.title, task.notes, task.tags.join(" "), task.subtasks.map(s => s.title).join(" ")].join(" "));
  return q.split(/\s+/).every(term => hay.indexOf(term) !== -1);
}

/* ------------------------------------------------------------ tarih biçimi */
function formatDue(due){
  const d = daysBetween(today, due), dt = parseYmd(due);
  if (d === null || !dt) return { text:"", cls:"" };
  if (d === 0) return { text: t("today"), cls:"due-today" };
  if (d === 1) return { text: t("tomorrow"), cls:"" };
  if (d === -1) return { text: t("yesterday"), cls:"due-over" };
  const full = new Intl.DateTimeFormat(LOCALE(), { day:"2-digit", month:"2-digit", year:"numeric" }).format(dt);
  if (d < 0) return { text: full, cls:"due-over" };
  if (d <= 7) return { text: new Intl.DateTimeFormat(LOCALE(), { weekday:"long" }).format(dt), cls:"" };
  return { text: full, cls:"" };
}
function formatStamp(iso){
  if (!ts(iso)) return "";
  return new Intl.DateTimeFormat(LOCALE(), { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" }).format(new Date(iso));
}

/* ============================== ARAYÜZ ================================== */

/* Liste ↔ pano geçişi bölüm anahtarlarını tümden değiştirir (kova → sütun).
   Uzlaştırıcıya "hepsini sil, hepsini ekle" dedirtmek yerine durumu bırakıp
   baştan kurmak hem daha hızlı hem daha az sürprizli. */
function switchTaskView(v){
  if (ui.taskView === v) return;
  ui.taskView = v;
  const box = document.getElementById("list");
  if (box){ box.__taskList = null; box.textContent = ""; }
  render();
}

function switchView(v){
  if (ui.view === v) return;
  if (ui.view === "notes"){ flushEditor(); saveNotesNow(); }
  ui.view = v;
  ui.q = "";
  buildShell();
}

function buildShell(){
  const root = document.getElementById("root");
  root.textContent = "";
  closeImgPopover(); closeMenu();
  const isNotes = ui.view === "notes";

  const onSearch = (val) => {
    ui.q = val;
    if (isNotes){ renderBanners(); renderPageList(); }
    else { renderBanners(); renderSidebar(); renderList(); }
  };
  const searchInput = el("input", {
    id:"q", class:"input", type:"search", autocomplete:"off",
    "aria-label": t("search"), placeholder: isNotes ? t("notesSearchPh") : t("searchPh"), value: ui.q,
    oninput(e){ onSearch(e.target.value); },
    onkeydown(e){
      if (e.key === "Escape"){
        e.stopPropagation();
        if (ui.q){ e.target.value = ""; onSearch(""); } else e.target.blur();
      }
    }
  });

  const tab = (view, iconName, label) => el("button", {
    class:"tab", role:"tab", "aria-selected": String(ui.view === view),
    onclick(){ switchView(view); }
  }, icon(iconName), label);

  const topbar = el("header", { class:"topbar" },
    el("div", { class:"brand" }, el("span", { class:"mark", svg:ICON.check, "aria-hidden":"true" }), el("span", { text: t("appName") })),
    el("div", { class:"tabs", role:"tablist" },
      tab("tasks", "list", t("tabTasks")),
      tab("notes", "book", t("tabNotes"))
    ),
    el("div", { class:"search" },
      el("span", { class:"ico", svg:ICON.search, "aria-hidden":"true" }),
      searchInput
    ),
    el("div", { class:"spacer" }),
    el("div", { class:"topbar-actions" },
      el("button", { class:"btn btn-ghost btn-icon", id:"themeBtn", title: themeTitle(), "aria-label": themeTitle(), onclick: cycleTheme }, icon(themeIcon())),
      el("button", { class:"btn btn-ghost", title: t("lang"), "aria-label": t("lang"), onclick: toggleLang }, state.settings.lang === "tr" ? "TR" : "EN"),
      el("div", { class:"sep" }),
      el("button", { class:"btn btn-ghost btn-icon", title: t("exportJson"), "aria-label": t("exportJson"), onclick: exportJson }, icon("down2")),
      el("button", { class:"btn btn-ghost btn-icon", title: t("importJson"), "aria-label": t("importJson"), onclick: pickImport }, icon("up2")),
      // Dışa aktarma biçimi görünüme göre: CSV görevler için, HTML notlar için.
      isNotes
        ? el("button", { class:"btn btn-ghost btn-icon", id:"expNotes", title: t("exportNotesHtml"), "aria-label": t("exportNotesHtml"), onclick: exportNotesHtml }, icon("page"))
        : el("button", { class:"btn btn-ghost btn-icon", id:"expCsv", title: t("exportCsv"), "aria-label": t("exportCsv"), onclick: exportCsv }, icon("sheet"))
    )
  );

  root.append(
    topbar,
    el("div", { id:"viewHost" }),
    el("div", { class:"toasts", id:"toasts", "aria-live":"polite", "aria-atomic":"false" }),
    buildImportDialog(),
    // Gizli dosya girdileri düğmelerden tetiklenir: erişilebilirlik ağacında
    // adsız durmasınlar, sekme sırasında da yer kaplamasınlar.
    el("input", { type:"file", id:"fileInput", accept:".json,application/json", class:"sr-only",
      "aria-label": t("importJson"), tabindex:"-1", onchange: onFileChosen }),
    el("input", { type:"file", id:"imgInput", accept:"image/*", class:"sr-only",
      "aria-label": t("tbImage"), tabindex:"-1", onchange(e){
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) insertImageFile(f);
    }})
  );

  mountView();
}

function mountView(){
  const host = document.getElementById("viewHost");
  host.textContent = "";

  if (ui.view === "notes"){
    ensureNotebook();
    editorPageId = null;                    // görünüm yeniden kurulduğu için editör de kurulmalı
    host.append(el("div", { class:"notes-shell" },
      el("div", { id:"banners" }),
      el("div", { class:"notes-app" },
        el("nav", { class:"nb-pane", id:"nbPane", "aria-label": t("notebooks") }),
        el("div", { class:"pg-pane", id:"pgPane", "aria-label": t("pages") }),
        el("div", { class:"ed-pane", id:"edPane" })
      )
    ));
    render();
    return;
  }

  const quick = el("input", {
    id:"quick", class:"input", autocomplete:"off", "aria-label": t("add"), placeholder: t("quickAddPh"),
    oninput(e){ renderCaptureHint(e.target.value); },
    onkeydown(e){
      if (e.key === "Enter" && e.target.value.trim()){
        submitQuickAdd(e.target.value);
        e.target.value = "";
        renderCaptureHint("");
      }
      if (e.key === "Escape"){
        // Önce çipleri temizle, sonra kutudan çık: iki kademeli Esc.
        if (captureIgnored.size || e.target.value){ captureIgnored.clear(); e.target.value = ""; renderCaptureHint(""); }
        else e.target.blur();
      }
    }
  });
  const quickBtn = el("button", { class:"btn btn-primary", onclick(){
    if (quick.value.trim()){ submitQuickAdd(quick.value); quick.value = ""; renderCaptureHint(""); quick.focus(); }
  }}, icon("plus"), t("add"));

  host.append(
    el("div", { class:"app" },
      el("nav", { class:"sidebar", id:"sidebar", "aria-label": t("filter") }),
      el("main", { class:"main" },
        el("div", { id:"banners" }),
        el("div", { class:"quickadd" }, quick, quickBtn),
        el("div", { class:"capture", id:"captureHint", hidden:true, "aria-live":"polite" }),
        el("div", { id:"bulkHost" }),
        el("div", { id:"selLive", class:"sr-only", "aria-live":"polite" }),
        el("div", { id:"list" })
      )
    ),
    buildPanel()
  );
  render();
}

/* ---------------------------------------------------------------- şeritler */
function renderBanners(){
  const box = document.getElementById("banners");
  if (!box) return;
  box.textContent = "";

  if (!storageOK){
    box.append(el("div", { class:"banner danger", role:"alert" },
      el("span", { svg:ICON.warn, "aria-hidden":"true" }),
      el("span", { class:"grow" }, el("strong", { text: t("storageFailTitle") }), " ", t("storageFailText")),
      el("button", { class:"btn", onclick: exportJson }, t("backupNow"))
    ));
  }
  if (notesQuotaHit){
    box.append(el("div", { class:"banner danger", role:"alert" },
      el("span", { svg:ICON.warn, "aria-hidden":"true" }),
      el("span", { class:"grow", text: t("notesQuotaFail") }),
      el("button", { class:"btn", onclick: exportJson }, t("backupNow"))
    ));
  }
  if (storageOK && !notesQuotaHit && storagePercent() >= 80){
    box.append(el("div", { class:"banner warn" },
      el("span", { svg:ICON.info, "aria-hidden":"true" }),
      el("span", { class:"grow", text: t("storageWarn", { n: storagePercent() }) }),
      el("button", { class:"btn", onclick: exportJson }, t("backupNow"))
    ));
  }
  if (corruptRecovered){
    box.append(el("div", { class:"banner warn", role:"alert" },
      el("span", { svg:ICON.warn, "aria-hidden":"true" }),
      el("span", { class:"grow", text: t("corrupt") }),
      el("button", { class:"btn", onclick(){ corruptRecovered = false; renderBanners(); } }, t("dismiss"))
    ));
  }

  // Yedek hatırlatması: 14 günden eski (veya hiç yedeklenmemiş, en az 14 günlük görev varsa)
  if (storageOK && !ui.nagHidden && state.tasks.length){
    const ref = state.settings.lastBackupAt || state.settings.nagDismissedAt
      || state.tasks.reduce((min, x) => Math.min(min, ts(x.createdAt) || Infinity), Infinity);
    const base = typeof ref === "string" ? ts(ref) : ref;
    if (base && base !== Infinity){
      const days = Math.floor((Date.now() - base) / 86400000);
      if (days >= 14){
        box.append(el("div", { class:"banner warn" },
          el("span", { svg:ICON.info, "aria-hidden":"true" }),
          el("span", { class:"grow", text: t("backupNag", { n: days }) }),
          el("button", { class:"btn", onclick: exportJson }, t("backupNow")),
          el("button", { class:"btn btn-ghost", onclick(){
            ui.nagHidden = true;
            state.settings.nagDismissedAt = new Date().toISOString();
            scheduleSave(); renderBanners();
          }}, t("dismiss"))
        ));
      }
    }
  }

  if (filtersActive()){
    box.append(el("div", { class:"banner" },
      el("span", { svg:ICON.filter, "aria-hidden":"true" }),
      el("span", { class:"grow", text: t("filterOn") }),
      el("button", { class:"btn", onclick: clearFilters }, t("clearFilters"))
    ));
  }
}

/* ----------------------------------------------------------------- kenar */
function renderSidebar(){
  const bar = document.getElementById("sidebar");
  if (!bar) return;
  bar.textContent = "";

  /* Görünüm seçimi kenar çubuğunun EN ÜSTÜNDE. Things'in kendi yaptığı da bu:
     kalıcı bir kenar çubuğunda görünüm listesi. Bu ekleme S8'in envanterine
     ADIYLA yazıldı — sessizce büyüyen arayüz, S8'in tam olarak engellemeye
     çalıştığı şey. */
  const viewGroup = el("div", { class:"side-group" }, el("h2", { class:"side-title", text: t("viewLbl") }));
  const viewList = el("ul", { class:"side-list" });
  for (const v of ["list", "board", "calendar"]){
    viewList.append(el("li", {}, el("button", {
      class:"side-item", "aria-pressed": String(ui.taskView === v),
      onclick(){ switchTaskView(v); }
    }, icon(v === "list" ? "list" : v === "board" ? "grid" : "cal"),
       el("span", { text: t("view_" + v) }))));
  }
  viewGroup.append(viewList);

  const statusCounts = {
    all: state.tasks.length,
    active: state.tasks.filter(x => !x.done).length,
    done: state.tasks.filter(x => x.done).length
  };
  const statusGroup = el("div", { class:"side-group" }, el("h2", { class:"side-title", text: t("status") }));
  const statusList = el("ul", { class:"side-list" });
  for (const key of ["all","active","done"]){
    statusList.append(el("li", {}, el("button", {
      class:"side-item", "aria-pressed": String(ui.status === key),
      onclick(){ ui.status = key; render(); }
    }, el("span", { text: t(key) }), el("span", { class:"count", text: String(statusCounts[key]) }))));
  }
  statusGroup.append(statusList);

  const prioGroup = el("div", { class:"side-group" }, el("h2", { class:"side-title", text: t("priority") }));
  const prioList = el("ul", { class:"side-list" });
  for (const p of ["high","med","low"]){
    const n = state.tasks.filter(x => x.priority === p).length;
    prioList.append(el("li", {}, el("button", {
      class:"side-item", "aria-pressed": String(ui.prios.has(p)),
      onclick(){ ui.prios.has(p) ? ui.prios.delete(p) : ui.prios.add(p); render(); }
    }, el("span", { class:"dot " + p }), el("span", { text: t(p) }), el("span", { class:"count", text:String(n) }))));
  }
  prioGroup.append(prioList);

  const counts = new Map();
  for (const task of state.tasks) for (const tg of task.tags) counts.set(tg, (counts.get(tg) || 0) + 1);
  const tagNames = [...counts.keys()].sort((a,b) => a.localeCompare(b, LOCALE()));
  const tagGroup = el("div", { class:"side-group" }, el("h2", { class:"side-title", text: t("tags") }));
  if (!tagNames.length){
    tagGroup.append(el("p", { class:"side-item", style:"cursor:default", text: t("noTags") }));
  } else {
    const tagList = el("ul", { class:"side-list" });
    for (const tg of tagNames){
      tagList.append(el("li", {}, el("button", {
        class:"side-item", "aria-pressed": String(ui.tags.has(tg)),
        onclick(){ ui.tags.has(tg) ? ui.tags.delete(tg) : ui.tags.add(tg); render(); }
      }, el("span", { text: "#" + tg }), el("span", { class:"count", text:String(counts.get(tg)) }))));
    }
    tagGroup.append(tagList);
  }

  bar.append(viewGroup, statusGroup, prioGroup, tagGroup);
}

/* ------------------------------------------------------------------ liste */
/* Başlıktaki [[bağlantı]]ları tıklanabilir düğümlere çevirir.
 *
 * GÜVENLİK: hiçbir yerde HTML birleştirilmez. Parçalar `document.createTextNode`
 * ve `el()` ile kurulur; bağlantı adı `textContent` olarak yazılır. Yeni bir
 * ayrıştırılmış sözdizimi yeni bir saldırı yüzeyi olabilirdi — bu yol onu
 * mevcut izin listesi süzgecine hiç uğratmadan kapatıyor. */
function titleNodes(title){
  const parts = splitByLinks(title);
  if (parts.length <= 1) return [document.createTextNode(title)];
  return parts.map(p => p.type === "text"
    ? document.createTextNode(p.text)
    : el("button", {
        class:"wikilink", title: t("wikiOpen", { p: p.text }), "aria-label": t("wikiOpen", { p: p.text }),
        onclick(e){ e.stopPropagation(); openWikiLink(p.text); }
      }, p.text));
}

/* Bağlantıya tıklamak sayfayı açar. Sayfa YOKSA kırık bağlantı göstermek
   yerine onu OLUŞTURUR: yazılmamış bir sayfaya bağlantı bir hata değil,
   bir davettir (Obsidian'ın da yaptığı budur). */
function openWikiLink(name){
  const hit = findPageByName(notes.notebooks, name);
  if (hit){
    ui.view = "notes"; ui.nbId = hit.notebookId; ui.pageId = hit.page.id;
    closePanel(); buildShell();
    return;
  }
  ensureNotebook();
  const nbId = ui.nbId || (notes.notebooks[0] && notes.notebooks[0].id);
  const page = addPage(nbId);
  if (!page){ toast(t("notesQuotaFail")); return; }
  page.title = String(name).slice(0, 300);
  stampNote(notes.notebooks.find(n => n.id === nbId), page);
  scheduleSaveNotes();
  ui.view = "notes"; ui.nbId = nbId; ui.pageId = page.id;
  closePanel(); buildShell();
  toast(t("wikiCreated", { p: page.title }), null, 5000);
}

function taskCard(task){
  const cls = ["card"];
  if (task.done) cls.push("is-done");
  if (task.id === openTaskId) cls.push("selected");
  const picked = ui.sel.has(task.id);
  if (picked) cls.push("picked");

  const cb = el("input", {
    type:"checkbox", class:"check", checked: task.done,
    "aria-label": task.title || t("titleLbl"),
    onclick(e){ e.stopPropagation(); },
    onchange(e){ toggleDone(task.id, e.target.checked); }
  });

  const meta = el("div", { class:"card-meta" });
  if (task.dueDate){
    const f = formatDue(task.dueDate);
    meta.append(el("span", { class:"m " + f.cls }, icon("cal"), el("span", { text:f.text })));
  }
  // "Orta" varsayılan olduğu için yalnızca ondan sapan öncelik gösterilir.
  if (!task.done && task.priority !== "med"){
    meta.append(el("span", { class:"m m-prio " + task.priority },
      el("span", { class:"dot " + task.priority }), el("span", { text: t(task.priority) })));
  }
  if (task.recur){
    meta.append(el("span", { class:"m m-recur", title: recurText(task.recur) },
      icon("redo"), el("span", { text: recurText(task.recur) })));
  }
  if (task.subtasks.length){
    const doneN = task.subtasks.filter(s => s.done).length;
    meta.append(el("span", { class:"m" },
      el("span", { class:"progress" }, el("i", { style:"width:" + Math.round(doneN / task.subtasks.length * 100) + "%" })),
      el("span", { text: doneN + "/" + task.subtasks.length })
    ));
  }
  for (const tg of task.tags) meta.append(el("span", { class:"chip", text:"#" + tg }));

  const card = el("li", { class: cls.join(" "), tabindex:"0", role:"button",
    /* `aria-selected` BURADA GEÇERSİZDİR: `role="button"` onu kabul etmez
       (axe: aria-allowed-attr). İlk sürümde eklenmiş ve a11y kapısı yakalamıştı.
       Seçim durumu bunun yerine erişilebilir ADIN parçası olarak veriliyor —
       her zaman geçerli, her ekran okuyucuda okunur. Canlı bölge de (#selLive)
       seçim sayısını ayrıca duyurur.
       Not: doğru uzun vadeli çözüm kartın rolünü düzeltmek, yani T2.8. */
    "data-id": task.id,
    "aria-label": task.title + (picked ? " — " + t("selSelected") : ""),
    onclick(e){
      if (e.shiftKey){ e.preventDefault(); selRangeTo(task.id); return; }
      if (e.ctrlKey || e.metaKey){ e.preventDefault(); selToggle(task.id); return; }
      // Düz tıklama seçimi sıfırlar ve paneli açar — seçim yokken davranış aynı.
      if (ui.sel.size) clearSelection();
      openPanel(task.id, card);
    },
    onkeydown(e){
      if (e.key === "Enter"){ e.preventDefault(); openPanel(task.id, card); return; }
      if (e.key === " "){ e.preventDefault(); selToggle(task.id); return; }   // Linear: boşluk seçer
      if (e.key === "ArrowDown" || e.key === "ArrowUp"){
        e.preventDefault();
        selArrow(task.id, e.key === "ArrowDown" ? 1 : -1, e.shiftKey);
      }
    }
  },
    el("span", { class:"prio-bar " + (task.done ? "" : task.priority), "aria-hidden":"true" }),
    cb,
    el("div", { class:"card-body" },
      el("div", { class:"card-title" }, ...titleNodes(task.title || "—")),
      meta.childNodes.length ? meta : null
    ),
    el("button", { class:"btn btn-ghost btn-icon card-del", title: t("deleteTask"), "aria-label": t("deleteTask"),
      onclick(e){ e.stopPropagation(); deleteTask(task.id); } }, icon("trash"))
  );
  return card;
}

/* Kartın GÖRÜNEN her şeyini tek dizeye sıkıştırır. İki çizim arasında bu dize
   aynıysa kart yeniden kurulmaz. Dil ve "bugün" de içeride: dil değişince her
   kartın metni değişir, gece yarısı geçilince tarih etiketi değişir — ikisi de
   imzaya girmezse kartlar sessizce bayat kalırdı. */
function cardSig(task){
  const subs = task.subtasks.length
    ? task.subtasks.filter(s => s.done).length + "/" + task.subtasks.length : "";
  return [
    task.title, task.done ? 1 : 0, task.priority, task.dueDate || "",
    task.tags.join(","), subs, task.id === openTaskId ? 1 : 0,
    task.recur ? task.recur.freq + ":" + task.recur.interval + ":" + (task.recur.byDay || []).join("") : "",
    ui.sel.has(task.id) ? 1 : 0,
    state.settings.lang, today,
  ].join("\u0001");
}

/* Odak korunumu. Filtre yazarken ya da bir görev sıralamada yer değiştirirken
   odağın kaybolması klavye kullanıcısını listeden atar; bu bir incelik değil.

   Yakalama ÇİZİMİN BAŞINDA yapılır, kart kart değil. Sebebi ölçüldü:
   `insertBefore` ile taşınan düğüm belgeden anlık olarak kopar ve tarayıcı
   odağı düşürür. Kart yeniden kurulurken bakmak GEÇ kalır — o anda
   activeElement çoktan body olmuştur. (tools/probe/behavior.mjs bu hatayı
   yakaladı; düzeltme oradaki iddiayla kilitlendi.) */
function captureListFocus(box){
  const a = document.activeElement;
  if (!a || !box.contains(a)) return null;
  const card = a.closest && a.closest(".card");
  if (!card) return null;
  const slot = a.classList && a.classList.contains("check") ? "check"
             : a.classList && a.classList.contains("card-del") ? "del" : "card";
  return { id: card.getAttribute("data-id"), slot };
}

/* Yalnız odak GERÇEKTEN kaybolduysa geri verilir. Kullanıcı bu sırada arama
   kutusuna geçtiyse activeElement body değildir ve odağı geri çalmayız —
   bu, düzeltmenin kendisinden daha sinir bozucu bir hata olurdu. */
function restoreListFocus(st, f){
  if (!f) return;
  const a = document.activeElement;
  if (a && a !== document.body) return;
  for (const rec of st.sections.values()){
    const node = rec.nodes.get(f.id);
    if (node && node.isConnected){ applyFocusSlot(node, f.slot); return; }
  }
}
function applyFocusSlot(card, slot){
  if (!slot) return;
  const target = slot === "check" ? card.querySelector(".check")
               : slot === "del"   ? card.querySelector(".card-del")
               : card;
  if (target) target.focus({ preventScroll:true });
}

function groupHead(group, count, expanded){
  const key = group.key;
  const label = t(group.labelKey);
  const head = el("h2", { class:"group-head" + (key === "overdue" ? " overdue" : "")
                                             + (ui.taskView === "board" ? " col-" + key : "") });
  // Katlama yalnız liste görünümünde: panoda sütunun kapanması, sütunun
  // kendisinin kaybolması gibi görünürdü.
  if (key === "completed" && ui.taskView === "list"){
    head.append(el("button", {
      class:"group-toggle", "aria-expanded": String(expanded), "aria-controls":"g-" + key,
      onclick(){ ui.showCompleted = !ui.showCompleted; renderList(); }
    }, icon("chev"), el("span", { text: label }), el("span", { class:"n", text:String(count) })));
  } else {
    head.append(el("span", { text: label }), el("span", { class:"n", text:String(count) }));
  }
  return head;
}

function makeSection(group){
  const list = el("ul", { class:"tasklist", id:"g-" + group.key });
  /* Sütun/kova ekran okuyucuda adlı olsun: "Yüksek, 3 görev" gibi bir bölge
     olmadan pano, ekranı görmeyen için yalnız bir kart yığınıdır. */
  const section = el("section", { class:"group", role:"group",
    "aria-label": t(group.labelKey) }, groupHead(group, 0, true), list);
  return { section, list, keys: [], nodes: new Map(), sigs: new Map() };
}

/* Bir kovadaki kartları uzlaştırır. Yama O(değişen); tam yıkım yok. */
function reconcileCards(rec, items){
  const keys = items.map(x => x.id);
  const byKey = new Map(items.map(x => [x.id, x]));
  const ops = diffChildren(rec.keys, keys);

  for (const op of ops){
    if (op.type !== "remove") continue;
    const n = rec.nodes.get(op.key);
    if (n) n.remove();
    rec.nodes.delete(op.key); rec.sigs.delete(op.key);
  }
  for (const op of ops){
    if (op.type === "remove") continue;
    let node = rec.nodes.get(op.key);
    if (!node){
      const task = byKey.get(op.key);
      node = taskCard(task);
      rec.nodes.set(op.key, node);
      rec.sigs.set(op.key, cardSig(task));
    }
    rec.list.insertBefore(node, op.before ? rec.nodes.get(op.before) : null);
  }
  for (const task of items){
    const sig = cardSig(task);
    if (rec.sigs.get(task.id) === sig) continue;
    const old = rec.nodes.get(task.id);
    if (!old) continue;
    const fresh = taskCard(task);
    old.replaceWith(fresh);
    rec.nodes.set(task.id, fresh);
    rec.sigs.set(task.id, sig);
  }
  rec.keys = keys;
}

/* =============================== TAKVİM ================================
 * Ay ızgarası. Liste/pano ile AYNI veriyi okur (Notion yasası) ama DOM'u
 * farklıdır: kart yığını değil, ızgara. O yüzden uzlaştırıcıyı kullanmaz —
 * 35-42 hücre zaten ucuzdur ve hücre içerikleri kart değil, kısa çipler.
 *
 * Tarihsiz görevler GİZLENMEZ: ızgaranın altında ayrı bir şeritte durur.
 * Takvimde görünmeyen görev, kullanıcı için kaybolmuş görevdir.            */
const CAL_MAX_PER_DAY = 4;      // hücrede gösterilen çip sayısı; fazlası "+N"

function calYm(){
  if (ui.calYm) return ui.calYm;
  const d = parseYmd(today) || new Date();
  return { y: d.getFullYear(), m: d.getMonth() };
}
function calShift(delta){
  const { y, m } = calYm();
  const d = new Date(y, m + delta, 1);
  ui.calYm = { y: d.getFullYear(), m: d.getMonth() };
  renderList();
}
function calToday(){ ui.calYm = null; renderList(); }

/** Hafta başlangıcı dile göre: TR pazartesi, EN pazar. */
const calWeekStart = () => state.settings.lang === "tr" ? 1 : 0;

function calDayNames(){
  const fmt = new Intl.DateTimeFormat(LOCALE(), { weekday: "short" });
  const ws = calWeekStart();
  const out = [];
  for (let i = 0; i < 7; i++){
    // 2026-03-01 bir pazar; oradan sayarak gün adlarını locale'den al.
    out.push(fmt.format(new Date(2026, 2, 1 + ((ws + i) % 7))));
  }
  return out;
}

function calChip(task){
  return el("button", {
    class:"cal-chip" + (task.done ? " done" : "") + " p-" + task.priority,
    "aria-label": task.title + " — " + t(task.priority),
    onclick(e){ e.stopPropagation(); openPanel(task.id, e.currentTarget); }
  }, el("span", { class:"dot " + task.priority, "aria-hidden":"true" }),
     el("span", { class:"cal-chip-t", text: task.title || "—" }));
}

function renderCalendar(box, visible){
  const { y, m } = calYm();
  const weeks = monthGrid(y, m, calWeekStart());
  const { map, undated } = tasksByDate(visible);
  const monthLabel = new Intl.DateTimeFormat(LOCALE(), { month: "long", year: "numeric" })
    .format(new Date(y, m, 1));

  const head = el("div", { class:"cal-head" },
    el("button", { class:"btn btn-ghost btn-icon", "aria-label": t("calPrev"),
      onclick(){ calShift(-1); } }, icon("chev")),
    el("h2", { class:"cal-title", id:"calTitle", text: monthLabel }),
    el("button", { class:"btn btn-ghost btn-icon cal-next", "aria-label": t("calNext"),
      onclick(){ calShift(1); } }, icon("chev")),
    el("button", { class:"btn btn-ghost", onclick: calToday }, t("calToday"))
  );

  const grid = el("div", { class:"cal-grid", role:"grid", "aria-labelledby":"calTitle" });
  const names = calDayNames();
  const hrow = el("div", { class:"cal-row cal-names", role:"row" });
  for (const n of names) hrow.append(el("div", { class:"cal-name", role:"columnheader", text:n }));
  grid.append(hrow);

  for (const week of weeks){
    const row = el("div", { class:"cal-row", role:"row" });
    for (const cell of week){
      const items = map.get(cell.ymd) || [];
      const isToday = cell.ymd === today;
      const day = el("div", {
        class:"cal-day" + (cell.inMonth ? "" : " out") + (isToday ? " today" : ""),
        role:"gridcell", tabindex:"-1", "data-ymd": cell.ymd,
        "aria-label": new Intl.DateTimeFormat(LOCALE(), { dateStyle:"long" }).format(parseYmd(cell.ymd))
          + (items.length ? " — " + t("calNTasks", { n: items.length }) : ""),
        onkeydown(e){ calKey(e, cell.ymd); }
      }, el("div", { class:"cal-num", text:String(cell.day) }));
      for (const task of items.slice(0, CAL_MAX_PER_DAY)) day.append(calChip(task));
      if (items.length > CAL_MAX_PER_DAY){
        day.append(el("div", { class:"cal-more", text: "+" + (items.length - CAL_MAX_PER_DAY) }));
      }
      row.append(day);
    }
    grid.append(row);
  }

  box.append(head, grid);

  /* Tarihsizler: gizlemek veriyi kaybetmek gibi görünürdü. */
  if (undated.length){
    const strip = el("section", { class:"cal-undated", role:"group", "aria-label": t("b_nodate") },
      el("h3", { class:"cal-undated-t" },
        el("span", { text: t("b_nodate") }), el("span", { class:"n", text:String(undated.length) })));
    const ul = el("ul", { class:"cal-undated-list" });
    for (const task of undated) ul.append(el("li", {}, calChip(task)));
    strip.append(ul);
    box.append(strip);
  }

  // Izgarada tek bir sekme durağı olsun; içinde ok tuşlarıyla gezilir.
  const first = grid.querySelector('.cal-day:not(.out)') || grid.querySelector(".cal-day");
  if (first) first.setAttribute("tabindex", "0");
}

/* Ok tuşları gün gün gezer; ay sınırını geçince ay değişir. Izgarada
   Tab ile 42 durak olması klavye kullanıcısını boğardı. */
function calKey(e, ymdStr){
  const map = { ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7 };
  if (e.key === "PageUp"){ e.preventDefault(); calShift(-1); return; }
  if (e.key === "PageDown"){ e.preventDefault(); calShift(1); return; }
  if (!(e.key in map)) return;
  e.preventDefault();
  const target = addDays(ymdStr, map[e.key]);
  if (!target) return;
  const d = parseYmd(target), cur = calYm();
  if (d.getFullYear() !== cur.y || d.getMonth() !== cur.m){
    ui.calYm = { y: d.getFullYear(), m: d.getMonth() };
    renderList();
  }
  const cell = document.querySelector('.cal-day[data-ymd="' + target + '"]');
  if (cell){
    for (const n of document.querySelectorAll(".cal-day")) n.setAttribute("tabindex", "-1");
    cell.setAttribute("tabindex", "0");
    cell.focus({ preventScroll:false });
  }
}

/* Çizim durumu KABIN ÜSTÜNDE durur (`box.__taskList`). Kap yeniden kurulunca
   (görünüm değişimi, mountView) durum onunla birlikte gider — ayrı bir
   geçersiz kılma mekanizması yazmaya gerek kalmaz. */
function renderList(){
  const box = document.getElementById("list");
  if (!box) return;

  const visible = state.tasks.filter(matches);
  if (!visible.length && ui.taskView !== "calendar"){
    ui.selOrder = [];
    ui.sel = pruneSelection(ui.sel, ui.selOrder);
    renderBulkBar();
    box.textContent = "";
    box.__taskList = null;
    box.classList.remove("board", "calendar");
    const filtered = filtersActive();
    box.append(el("div", { class:"empty" },
      el("span", { svg:ICON.inbox, "aria-hidden":"true" }),
      el("h2", { text: filtered ? t("emptyFilterTitle") : t("emptyTitle") }),
      el("p", { text: filtered ? t("emptyFilterText") : t("emptyText") })
    ));
    return;
  }

  /* Görünümler aynı `visible` dizisi üzerine izdüşümdür (src/core/projections.js).
     Pano ayrı bir depo açmaz, ayrı bir süzgeç uygulamaz; arama ve filtreler
     her ikisinde de aynen geçerlidir. */
  if (ui.taskView === "calendar"){
    ui.selOrder = [];
    ui.sel = pruneSelection(ui.sel, ui.selOrder);
    renderBulkBar();
    box.textContent = "";
    box.__taskList = null;
    box.classList.remove("board");
    box.classList.add("calendar");
    renderCalendar(box, visible);
    return;
  }
  box.classList.remove("calendar");

  const board = ui.taskView === "board";
  const groups = board ? boardGroups(visible) : listGroups(visible, today);
  const byKey = new Map(groups.map(g => [g.key, g]));

  /* Ekrandaki sıra: aralık seçimi ve ok tuşları buna göre çalışır. Gruplar
     arası da geçerli — kullanıcı için liste tek bir dizidir. */
  ui.selOrder = groups.flatMap(g => g.items.map(x => x.id));
  const before = ui.sel.size;
  ui.sel = pruneSelection(ui.sel, ui.selOrder);
  if (ui.sel.size !== before) announceSelection();
  renderBulkBar();
  const active = groups.map(g => g.key);
  box.classList.toggle("board", board);

  const focusBefore = captureListFocus(box);

  let st = box.__taskList;
  if (!st){ box.textContent = ""; st = box.__taskList = { order: [], sections: new Map() }; }

  for (const op of diffChildren(st.order, active)){
    if (op.type === "remove"){
      const rec = st.sections.get(op.key);
      if (rec) rec.section.remove();
      st.sections.delete(op.key);
      continue;
    }
    let rec = st.sections.get(op.key);
    if (!rec){ rec = makeSection(byKey.get(op.key)); st.sections.set(op.key, rec); }
    const beforeRec = op.before ? st.sections.get(op.before) : null;
    box.insertBefore(rec.section, beforeRec ? beforeRec.section : null);
  }
  st.order = active.slice();

  for (const key of active){
    const rec = st.sections.get(key);
    const group = byKey.get(key);
    const items = group.items;                       // izdüşüm zaten sıraladı
    const expanded = (key === "completed" && !board) ? ui.showCompleted : true;
    rec.section.replaceChild(groupHead(group, items.length, expanded), rec.section.firstChild);
    reconcileCards(rec, expanded ? items : []);
  }

  restoreListFocus(st, focusBefore);
}


/* ------------------------------------------------------------- yan panel */
function buildPanel(){
  return el("aside", { class:"panel", id:"panel", "aria-label": t("detail"), "aria-hidden":"true" },
    el("div", { class:"panel-head" },
      el("span", { class:"ttl", id:"panelTtl", text: t("detail") }),
      el("button", { class:"btn btn-ghost btn-icon", id:"panelClose", title: t("close"), "aria-label": t("close"), onclick: closePanel }, icon("x"))
    ),
    el("div", { class:"panel-body", id:"panelBody" }),
    el("div", { class:"panel-foot" },
      el("button", { class:"btn btn-danger", id:"panelDel", onclick(){ if (openTaskId) deleteTask(openTaskId); } }, icon("trash"), t("deleteTask")),
      el("div", { class:"meta", id:"panelMeta" })
    )
  );
}

function openPanel(id, source){
  const p = document.getElementById("panel");
  if (!p) return;                       // notlar görünümünde panel takılı değil
  openTaskId = id;
  lastFocused = source || document.activeElement;
  p.classList.add("open");
  p.setAttribute("aria-hidden", "false");
  renderPanel();
  renderList();
  const first = document.getElementById("f-title");
  if (first) first.focus({ preventScroll:true });
}

function closePanel(){
  openTaskId = null;
  const p = document.getElementById("panel");
  if (!p) return;
  p.classList.remove("open");
  p.setAttribute("aria-hidden", "true");
  document.getElementById("panelBody").textContent = "";
  renderList();
  if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus({ preventScroll:true });
  lastFocused = null;
}

/** Panel alanları otomatik kaydedilir; "Kaydet" butonu yoktur.
 *  Metin kutuları yazarken yeniden çizilmez, yalnızca liste tazelenir. */
function renderPanel(){
  const body = document.getElementById("panelBody");
  if (!body) return;
  const task = getTask(openTaskId);
  if (!task){ body.textContent = ""; return; }
  body.textContent = "";

  const titleInput = el("input", { id:"f-title", class:"input panel-title-input", value: task.title,
    "aria-label": t("titleLbl"),
    oninput(e){ task.title = e.target.value; stamp(task); scheduleSave(); renderList(); }
  });

  const doneToggle = el("label", { class:"done-toggle" },
    el("input", { type:"checkbox", id:"f-done", checked: task.done, onchange(e){ toggleDone(task.id, e.target.checked); } }),
    el("span", { id:"f-done-label", text: task.done ? t("yes") : t("no") })
  );

  const notes = el("textarea", { id:"f-notes", class:"input", placeholder: t("notesPh"), "aria-label": t("notesLbl"),
    oninput(e){ task.notes = e.target.value; stamp(task); scheduleSave(); }
  });
  notes.value = task.notes;

  const due = el("input", { type:"date", class:"input", value: task.dueDate || "", "aria-label": t("dueLbl"),
    onchange(e){ task.dueDate = parseYmd(e.target.value) ? e.target.value : null; stamp(task); scheduleSave(); render(); }
  });

  const prio = el("select", { class:"input", "aria-label": t("prioLbl"),
    onchange(e){ task.priority = e.target.value; stamp(task); scheduleSave(); render(); }
  }, ["high","med","low"].map(p => el("option", { value:p, selected: task.priority === p }, t(p))));

  /* Tekrar denetimi. Sıklık + aralık; hafta günleri yalnız yakalamadan gelir
     ("her pazartesi") ve burada KORUNUR — kullanıcının yazdığı kuralı bir
     açılır kutuya sığmadığı için sessizce düzleştirmek kötü olurdu. */
  const recurFreq = el("select", { class:"input", id:"f-recur", "aria-label": t("recurLbl"),
    onchange(e){
      const v = e.target.value;
      if (!v){ task.recur = null; }
      else {
        const prev = task.recur;
        task.recur = normalizeRule({
          freq: v,
          interval: prev && prev.freq === v ? prev.interval : 1,
          byDay: v === "weekly" && prev && prev.freq === "weekly" ? prev.byDay : null,
          anchor: task.dueDate || today,
        });
      }
      stamp(task); scheduleSave(); renderPanel(); renderList();
    }
  },
    el("option", { value:"", selected: !task.recur }, t("recurNone")),
    ...["daily","weekly","monthly"].map(f =>
      el("option", { value:f, selected: !!task.recur && task.recur.freq === f }, t("rec_" + f)))
  );

  const recurEvery = el("input", {
    class:"input", type:"number", min:"1", max:"365", id:"f-recur-n",
    "aria-label": t("recurEvery"), value: String(task.recur ? task.recur.interval : 1),
    disabled: !task.recur,
    onchange(e){
      if (!task.recur) return;
      const n = parseInt(e.target.value, 10);
      const next = normalizeRule({ ...task.recur, interval: n });
      if (!next){ e.target.value = String(task.recur.interval); return; }   // geçersiz giriş geri alınır
      task.recur = next;
      stamp(task); scheduleSave(); renderPanel(); renderList();
    }
  });

  const recurField = el("div", { class:"field" },
    el("label", { class:"label", for:"f-recur", text: t("recurLbl") }),
    el("div", { class:"row2" }, recurFreq, recurEvery));
  if (task.recur){
    recurField.append(el("p", { class:"recur-note", text: recurText(task.recur) }));
  }

  const tagBox = el("div", { class:"tagbox", id:"f-tagbox" });
  const tagInput = el("input", { class:"input", placeholder: t("tagsPh"), "aria-label": t("tagsLbl"),
    onkeydown(e){
      if (e.key === "Enter" || e.key === ","){
        e.preventDefault();
        const v = e.target.value.trim().replace(/^#/, "");
        if (v && !task.tags.includes(v)){ task.tags.push(v); stamp(task); scheduleSave(); renderTags(task, tagBox); renderSidebar(); renderList(); }
        e.target.value = "";
      } else if (e.key === "Backspace" && !e.target.value && task.tags.length){
        task.tags.pop(); stamp(task); scheduleSave(); renderTags(task, tagBox); renderSidebar(); renderList();
      }
    }
  });

  const subWrap = el("div", { id:"f-subs" });
  const subInput = el("input", { class:"input", placeholder: t("subPh"), "aria-label": t("subLbl"),
    onkeydown(e){
      if (e.key === "Enter" && e.target.value.trim()){
        task.subtasks.push({ id: uid(), title: e.target.value.trim(), done:false });
        stamp(task); scheduleSave(); renderSubs(task, subWrap); renderList();
        e.target.value = "";
      }
    }
  });

  body.append(
    el("div", { class:"field" }, el("label", { class:"label", for:"f-title", text: t("titleLbl") }), titleInput, doneToggle),
    el("div", { class:"field row2" },
      el("div", {}, el("label", { class:"label", text: t("dueLbl") }), due),
      el("div", {}, el("label", { class:"label", text: t("prioLbl") }), prio)
    ),
    recurField,
    el("div", { class:"field" }, el("label", { class:"label", for:"f-notes", text: t("notesLbl") }), notes),
    el("div", { class:"field" }, el("label", { class:"label", text: t("tagsLbl") }), tagBox, tagInput),
    el("div", { class:"field" }, el("label", { class:"label", text: t("subLbl") }), subWrap, subInput)
  );

  if (task.sourceNoteId){
    const src = getPage(task.sourceNoteId.notebookId, task.sourceNoteId.pageId);
    body.append(el("div", { class:"field" },
      el("label", { class:"label", text: t("sourceNote") }),
      src
        ? el("button", { class:"btn", style:"width:100%;justify-content:flex-start",
            onclick(){ openSourceNote(task); } }, icon("book"), pageTitleOf(src))
        : el("p", { style:"margin:0;font-size:13px;color:var(--faint)", text: t("noteGone") })
    ));
  }

  renderTags(task, tagBox);
  renderSubs(task, subWrap);

  renderPanelMeta(task);
}

function renderPanelMeta(task){
  const box = document.getElementById("panelMeta");
  if (!box) return;
  box.textContent = "";
  box.append(
    el("span", { text: t("created") + ": " + formatStamp(task.createdAt) }),
    el("span", { text: t("updated") + ": " + formatStamp(task.updatedAt) })
  );
}

function renderTags(task, box){
  box.textContent = "";
  for (const tg of task.tags){
    box.append(el("span", { class:"tag" }, "#" + tg,
      el("button", { "aria-label": t("removeTag") + ": " + tg, onclick(){
        task.tags = task.tags.filter(x => x !== tg);
        stamp(task); scheduleSave(); renderTags(task, box); renderSidebar(); renderList();
      }}, icon("x"))
    ));
  }
}

function renderSubs(task, box){
  box.textContent = "";
  if (!task.subtasks.length) return;
  const doneN = task.subtasks.filter(s => s.done).length;
  box.append(el("div", { class:"sub-progress" },
    el("span", { class:"progress" }, el("i", { style:"width:" + Math.round(doneN / task.subtasks.length * 100) + "%" })),
    el("span", { text: doneN + "/" + task.subtasks.length })
  ));

  const list = el("ul", { class:"sub-list" });
  task.subtasks.forEach((s, i) => {
    const move = (delta) => {
      const j = i + delta;
      if (j < 0 || j >= task.subtasks.length) return;
      const [x] = task.subtasks.splice(i, 1);
      task.subtasks.splice(j, 0, x);
      stamp(task); scheduleSave(); renderSubs(task, box);
    };
    list.append(el("li", { class:"sub" + (s.done ? " done" : "") },
      el("input", { type:"checkbox", checked: s.done, "aria-label": s.title,
        onchange(e){ s.done = e.target.checked; stamp(task); scheduleSave(); renderSubs(task, box); renderList(); } }),
      el("span", { class:"txt", text: s.title }),
      el("span", { class:"acts" },
        el("button", { title: t("moveUp"), "aria-label": t("moveUp"), disabled: i === 0, onclick(){ move(-1); } }, icon("up")),
        el("button", { title: t("moveDown"), "aria-label": t("moveDown"), disabled: i === task.subtasks.length - 1, onclick(){ move(1); } }, icon("down")),
        el("button", { title: t("removeSub"), "aria-label": t("removeSub"), onclick(){
          task.subtasks.splice(i, 1); stamp(task); scheduleSave(); renderSubs(task, box); renderList();
        }}, icon("trash"))
      )
    ));
  });
  box.append(list);
}

/* ================================ NOTLAR ================================ */

const getNotebook = id => notes.notebooks.find(n => n.id === id) || null;
function getPage(nbId, pageId){
  const nb = getNotebook(nbId);
  return nb ? (nb.pages.find(p => p.id === pageId) || null) : null;
}
const currentNotebook = () => getNotebook(ui.nbId);
const currentPage = () => getPage(ui.nbId, ui.pageId);

function stampNote(nb, page){
  const now = new Date().toISOString();
  if (page) page.updatedAt = now;
  if (nb) nb.updatedAt = now;
}

/** Son açık defter/sayfa hatırlanır: tuval modelinde her açılışta "sayfa
 *  seçilmedi" ekranına düşmek, yazmaya başlamadan önce iki tıklık bir vergi
 *  demek olurdu. Kayıt yalnızca seçim DEĞİŞTİĞİNDE yazılır. */
function rememberOpenNote(){
  const cur = state.settings.lastNote || {};
  if (cur.nbId === ui.nbId && cur.pageId === ui.pageId) return;
  state.settings.lastNote = { nbId: ui.nbId, pageId: ui.pageId };
  scheduleSave();
}

/** Seçili defter/sayfa hâlâ var mı; yoksa makul bir seçime düş. */
function ensureNotebook(){
  if (!notes.notebooks.length) addNotebook(t("firstNotebook"));
  const last = state.settings.lastNote || {};
  if (!ui.nbId && last.nbId && getNotebook(last.nbId)) ui.nbId = last.nbId;
  if (!getNotebook(ui.nbId)) { ui.nbId = notes.notebooks[0].id; ui.pageId = null; }
  if (!ui.pageId && last.pageId && getPage(ui.nbId, last.pageId)) ui.pageId = last.pageId;
  if (ui.pageId && !getPage(ui.nbId, ui.pageId)) ui.pageId = null;
  // Hatırlanan sayfa silinmişse defterin ilk sayfasına düş.
  if (!ui.pageId){
    const nb = getNotebook(ui.nbId);
    if (nb && nb.pages.length) ui.pageId = nb.pages[0].id;
  }
  rememberOpenNote();
}

function addNotebook(name){
  const now = new Date().toISOString();
  const nb = {
    id: uid(),
    name: (name || t("untitledNotebook")).trim() || t("untitledNotebook"),
    color: NB_COLORS[notes.notebooks.length % NB_COLORS.length],
    pages: [], createdAt: now, updatedAt: now
  };
  notes.notebooks.push(nb);
  ui.nbId = nb.id; ui.pageId = null;
  scheduleSaveNotes();
  return nb;
}

function addPage(nbId){
  const nb = getNotebook(nbId);
  if (!nb) return null;
  const now = new Date().toISOString();
  const page = { id: uid(), title:"", boxes: [], createdAt: now, updatedAt: now };
  nb.pages.unshift(page);
  nb.updatedAt = now;
  ui.pageId = page.id;
  scheduleSaveNotes();
  return page;
}

function deleteNotebook(id){
  const i = notes.notebooks.findIndex(n => n.id === id);
  if (i < 0) return;
  const [nb] = notes.notebooks.splice(i, 1);
  if (ui.nbId === id){ ui.nbId = null; ui.pageId = null; }
  ensureNotebook();
  scheduleSaveNotes(); renderNotesView(true);
  // Defter silmek içindeki bütün sayfaları götürür; geri alma burada kritik.
  toast(t("notebookDeleted") + " — " + nb.name, { label: t("undo"), run(){
    notes.notebooks.splice(Math.min(i, notes.notebooks.length), 0, nb);
    ui.nbId = nb.id; ui.pageId = null;
    scheduleSaveNotes(); renderNotesView(true);
    toast(t("notebookRestored"));
  }}, 10000);
}

function deletePage(nbId, pageId){
  const nb = getNotebook(nbId); if (!nb) return;
  const i = nb.pages.findIndex(p => p.id === pageId);
  if (i < 0) return;
  const [page] = nb.pages.splice(i, 1);
  dropHistory(pageId);
  plainCache.delete(pageId);
  // Açık sayfa silindiyse: aynı sıradaki, yoksa bir önceki, o da yoksa hiçbiri.
  if (ui.pageId === pageId){
    const next = nb.pages[i] || nb.pages[i - 1] || null;
    ui.pageId = next ? next.id : null;
  }
  if (editorPageId === pageId) editorPageId = null;
  nb.updatedAt = new Date().toISOString();
  scheduleSaveNotes(); renderNotesView(true);
  toast(t("pageDeleted"), { label: t("undo"), run(){
    nb.pages.splice(Math.min(i, nb.pages.length), 0, page);
    ui.nbId = nb.id; ui.pageId = page.id;
    scheduleSaveNotes(); renderNotesView(true);
    toast(t("pageRestored"));
  }}, 8000);
}

/* ------------------------------------------------------- not arama/önizleme */
/* Sayfanın düz metni hem aramada hem önizlemede gerekiyor ve noteText her
   çağrıda HTML ayrıştırıyor. Defterdeki her sayfa için her tuş vuruşunda
   yeniden çıkarmak israf; updatedAt değişene kadar sonuç saklanır. */
const plainCache = new Map();
/** Tuvalde "okuma sırası" diye bir şey DOM sırasında yok: kutular serbest
 *  konumlu. Arama ve önizleme için yukarıdan aşağıya, soldan sağa sıralanır. */
function boxesInReadingOrder(page){
  return (page.boxes || []).slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
}
function pagePlain(page){
  const hit = plainCache.get(page.id);
  if (hit && hit.stamp === page.updatedAt) return hit.text;
  const text = boxesInReadingOrder(page).map(b => noteText(b.html)).filter(Boolean).join(" ");
  plainCache.set(page.id, { stamp: page.updatedAt, text });
  return text;
}

function pageMatches(page, q){
  if (!q) return true;
  const hay = foldTr(page.title + " " + pagePlain(page));
  return foldTr(q).split(/\s+/).every(term => hay.indexOf(term) !== -1);
}
function pageTitleOf(page){ return page.title.trim() || t("untitledPage"); }

/* ------------------------------------------------------------ defter paneli */
let renamingNbId = null;

function renderNotebooks(){
  const pane = document.getElementById("nbPane");
  if (!pane) return;
  pane.textContent = "";
  pane.append(el("div", { class:"pane-head" },
    el("h2", { text: t("notebooks") }),
    el("button", { class:"btn btn-ghost btn-icon", title: t("newNotebook"), "aria-label": t("newNotebook"),
      onclick(){ addNotebook(); renamingNbId = ui.nbId; renderNotesView(); } }, icon("plus"))
  ));

  const list = el("ul", { class:"side-list" });
  for (const nb of notes.notebooks){
    if (renamingNbId === nb.id){
      const input = el("input", { class:"input", value: nb.name, style:"padding:5px 8px",
        onkeydown(e){
          if (e.key === "Enter"){ commit(e.target.value); }
          else if (e.key === "Escape"){ renamingNbId = null; renderNotebooks(); }
        },
        onblur(e){ commit(e.target.value); }
      });
      const commit = (v) => {
        if (renamingNbId !== nb.id) return;
        const name = String(v || "").trim();
        if (name && name !== nb.name){ nb.name = name.slice(0, 120); nb.updatedAt = new Date().toISOString(); scheduleSaveNotes(); }
        renamingNbId = null;
        renderNotesView();
      };
      list.append(el("li", {}, input));
      setTimeout(() => { input.focus(); input.select(); }, 0);
      continue;
    }
    const row = el("li", { class:"nb-row" },
      el("button", {
        class:"nb-item", "aria-current": String(ui.nbId === nb.id),
        onclick(){ ui.nbId = nb.id; ui.pageId = null; renderNotesView(); }
      },
        el("span", { class:"dot", style:"background:" + nb.color }),
        el("span", { class:"nb-name", text: nb.name }),
        el("span", { class:"count", text: String(nb.pages.length) })
      ),
      el("span", { class:"nb-acts" },
        el("button", { title: t("renameNotebook"), "aria-label": t("renameNotebook"),
          onclick(){ renamingNbId = nb.id; renderNotebooks(); } }, icon("pencil")),
        el("button", { title: t("deleteNotebook"), "aria-label": t("deleteNotebook"),
          onclick(){ deleteNotebook(nb.id); } }, icon("trash"))
      )
    );
    list.append(row);
  }
  pane.append(list, storageMeter());
}

function storageMeter(){
  const pct = storagePercent();
  const cls = "meter" + (pct >= 95 ? " full" : pct >= 80 ? " warn" : "");
  const used = formatBytes(storageBytes());

  /* Gösterge iki farklı soruya cevap veriyor, hangi deponun seçildiğine göre:
       localStorage → "duvara ne kadar kaldı?" (tavan ~5 MB, yakın ve gerçek)
       IndexedDB    → "ne kadar yer kaplıyorum?" (tavan ~151 GiB; yüzde
                       anlamsız, her zaman %0 gösterirdi)
     Aynı çubuğu ikisinde de göstermek, ikincisinde yalan söylemek olurdu. */
  const label = quotaMeasured
    ? used
    : used + " / " + formatBytes(quotaBytes);

  const meter = el("div", { class: cls, id:"storageMeter",
    title: (storageKind === "indexedDB" ? t("storageIdb") : t("storageLocal"))
           + (quotaMeasured ? " · " + formatBytes(quotaBytes) : "") },
    el("div", { class:"lbl" },
      el("span", { text: t("storageUsed") }),
      el("span", { text: label })
    )
  );
  // Çubuk yalnız anlamlıysa çizilir; %0'da sabit duran bir çubuk gürültüdür.
  if (!quotaMeasured || pct >= 1){
    meter.append(el("div", { class:"bar" }, el("i", { style:"width:" + Math.max(1, pct) + "%" })));
  }
  return meter;
}
function renderStorageMeter(){
  const old = document.getElementById("storageMeter");
  if (old && old.parentNode) old.parentNode.replaceChild(storageMeter(), old);
}

/* ------------------------------------------------------------ sayfa listesi */
function renderPageList(){
  const pane = document.getElementById("pgPane");
  if (!pane) return;
  /* Liste her tazelendiğinde DOM baştan kuruluyor ve odaklı sayfa düğmesi yok
     oluyordu; bu da Alt+ok ile sıralamayı imkânsız kılıyordu. Odak YALNIZCA
     zaten liste üzerindeyse geri verilir — editörde yazarken çalınmasın. */
  const hadFocus = !!(document.activeElement && document.activeElement.classList
    && document.activeElement.classList.contains("pg-item"));
  pane.textContent = "";
  const nb = currentNotebook();
  pane.append(el("div", { class:"pane-head" },
    el("h2", { text: t("pages") }),
    el("button", { class:"btn btn-ghost btn-icon", title: t("newPage"), "aria-label": t("newPage"),
      disabled: !nb,
      onclick(){ if (addPage(ui.nbId)) { renderNotesView(); focusPageTitle(); } } }, icon("plus"))
  ));
  if (!nb){
    pane.append(el("div", { class:"empty" }, el("h2", { text: t("noNotebooks") }), el("p", { text: t("noNotebooksHint") })));
    return;
  }
  const q = ui.q.trim();
  const pages = nb.pages.filter(p => pageMatches(p, q));
  if (!pages.length){
    pane.append(el("div", { class:"empty" },
      el("h2", { text: q ? t("noNoteMatch") : t("noPages") }),
      el("p", { text: q ? t("emptyFilterText") : t("noPagesHint") })
    ));
    return;
  }
  const list = el("ul", { class:"pg-list" });
  for (const page of pages){
    const preview = pagePlain(page).slice(0, 160);
    const canDrag = reorderAllowed();
    list.append(el("li", { class:"pg-row", dataset:{ id: page.id },
      draggable: canDrag ? "true" : null,
      ondragstart(e){
        if (!canDrag){ e.preventDefault(); return; }
        dragPageId = page.id;
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", page.id); } catch(err){}
      },
      ondragend(){ dragPageId = null; clearDropMarks(); },
      ondragover(e){
        if (!dragPageId || dragPageId === page.id || !canDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const r = e.currentTarget.getBoundingClientRect();
        const below = (e.clientY - r.top) > r.height / 2;
        clearDropMarks();
        e.currentTarget.classList.add(below ? "drop-below" : "drop-above");
      },
      ondragleave(e){ e.currentTarget.classList.remove("drop-above", "drop-below"); },
      ondrop(e){
        e.preventDefault();
        const rowEl = e.currentTarget;
        const below = rowEl.classList.contains("drop-below");
        clearDropMarks();
        if (!dragPageId || dragPageId === page.id) return;
        const from = nb.pages.findIndex(p => p.id === dragPageId);
        let to = nb.pages.findIndex(p => p.id === page.id);
        if (from < 0 || to < 0) return;
        if (below && from > to) to += 1;
        if (!below && from < to) to -= 1;
        if (movePage(nb.id, from, to)) renderPageList();
        dragPageId = null;
      }
    },
      el("button", {
        class:"pg-item", "aria-current": String(ui.pageId === page.id),
        onclick(){ openPage(page.id); },
        onkeydown(e){
          // Sürükle-bırak fare gerektiriyor; klavye karşılığı yalnızca liste odaklıyken.
          if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")){
            e.preventDefault();
            movePageBy(page.id, e.key === "ArrowUp" ? -1 : 1);
          }
        }
      },
        el("div", { class:"pg-title", text: pageTitleOf(page) }),
        el("div", { class:"pg-prev", text: preview || t("emptyPagePreview") }),
        el("div", { class:"pg-date", text: formatStamp(page.updatedAt) })
      ),
      el("span", { class:"pg-acts" },
        el("button", { title: t("moveUp2"), "aria-label": t("moveUp2"), disabled: !canDrag,
          onclick(e){ e.stopPropagation(); movePageBy(page.id, -1); } }, icon("up")),
        el("button", { title: t("moveDown2"), "aria-label": t("moveDown2"), disabled: !canDrag,
          onclick(e){ e.stopPropagation(); movePageBy(page.id, 1); } }, icon("down")),
        el("button", { title: t("deletePage"), "aria-label": t("deletePage") + ": " + pageTitleOf(page),
          onclick(e){ e.stopPropagation(); deletePage(nb.id, page.id); } }, icon("trash"))
      )
    ));
  }
  pane.append(list);
  if (hadFocus){
    const back = pane.querySelector('.pg-row[data-id="' + String(ui.pageId) + '"] .pg-item') || pane.querySelector(".pg-item");
    if (back) back.focus({ preventScroll:true });
  }
}

/* --------------------------------------------------------- sayfa sıralama */
let dragPageId = null;

const reorderAllowed = () => !ui.q.trim();   // filtreliyken görünen sıra gerçek sıra değil

function movePage(nbId, from, to){
  const nb = getNotebook(nbId); if (!nb) return false;
  if (from < 0 || from >= nb.pages.length) return false;
  to = Math.max(0, Math.min(nb.pages.length - 1, to));
  if (to === from) return false;
  const [p] = nb.pages.splice(from, 1);
  nb.pages.splice(to, 0, p);
  nb.updatedAt = new Date().toISOString();
  scheduleSaveNotes();
  return true;
}
function movePageBy(pageId, delta){
  if (!reorderAllowed()){ toast(t("reorderOff"), null, 5000); return; }
  const nb = currentNotebook(); if (!nb) return;
  const i = nb.pages.findIndex(p => p.id === pageId);
  if (i < 0) return;
  if (movePage(nb.id, i, i + delta)){
    renderPageList();
    const row = document.querySelector('.pg-row[data-id="' + pageId + '"] .pg-item');
    if (row) row.focus({ preventScroll:true });   // arka arkaya Alt+ok çalışsın
  }
}

function clearDropMarks(){
  const rows = document.querySelectorAll(".pg-row");
  for (let i = 0; i < rows.length; i++) rows[i].classList.remove("drop-above", "drop-below");
}

function openPage(pageId){
  if (ui.pageId === pageId) return;
  flushEditor(); saveNotesNow();
  ui.pageId = pageId;
  renderNotesView();
}

/* ================================ EDİTÖR ================================
 * Editör yalnızca açık sayfa değiştiğinde yeniden kurulur. Her çizimde
 * yeniden kurulsaydı imleç her tuşta başa atardı. */
let editorPageId = null;
let dirtyEditor = false;
let pageListTimer = null;

const FORCE_EDITOR = { force: true };   // ui.pageId ile asla eşleşmeyen nöbetçi
function renderNotesView(forceEditor){
  rememberOpenNote();
  renderNotebooks();
  renderPageList();
  if (forceEditor) editorPageId = FORCE_EDITOR;
  if (editorPageId !== ui.pageId) renderEditor();
  else updateToolbarState();
}

function schedulePageListRefresh(){
  clearTimeout(pageListTimer);
  pageListTimer = setTimeout(() => { renderPageList(); renderStorageMeter(); renderEdMeta(); }, 450);
}

/** Editördeki ham HTML'i süzüp modele yazar. Her tuşta değil, kaydetme
 *  anında çalışır — hem ucuz hem imleç güvenli (geri yazma yok). */
function flushEditor(){
  if (!dirtyEditor) return;
  dirtyEditor = false;
  const ed = document.getElementById("editor");
  const page = getPage(ui.nbId, editorPageId);
  if (!ed || !page) return;
  page.boxes = readBoxes(ed);
  stampNote(currentNotebook(), page);
}

function onEditorChanged(){
  dirtyEditor = true;
  scheduleSaveNotes();
  schedulePageListRefresh();
  updateToolbarState();
  scheduleCanvasResize();
}

function focusPageTitle(){
  const el0 = document.getElementById("pageTitle");
  if (el0) el0.focus();
}

function renderEditor(){
  const pane = document.getElementById("edPane");
  if (!pane) return;
  flushEditor();
  pane.textContent = "";
  editorPageId = ui.pageId;
  activeBoxId = null;
  closeImgPopover();

  const page = currentPage();
  if (!page){
    pane.append(el("div", { class:"ed-empty" },
      el("span", { svg:ICON.page, "aria-hidden":"true" }),
      el("div", {}, el("h2", { style:"margin:0 0 6px;font-size:16px;color:var(--muted)", text: t("noPageOpen") }),
        el("p", { style:"margin:0", text: t("noPageOpenHint") }))
    ));
    return;
  }

  const title = el("input", {
    id:"pageTitle", class:"ed-title", value: page.title, placeholder: t("pageTitlePh"),
    "aria-label": t("pageTitlePh"),
    oninput(e){
      page.title = e.target.value.slice(0, 300);
      stampNote(currentNotebook(), page);
      scheduleSaveNotes(); schedulePageListRefresh();
    },
    onkeydown(e){
      if (e.key === "Enter"){ e.preventDefault(); requireBody(); }
    }
  });

  // Olaylar TEK TEK kutulara değil, tuvale bağlanır. Geri alma kutuları
  // yeniden kurduğu için (innerHTML) kutuya takılan dinleyici kaybolurdu.
  const canvas = el("div", {
    id:"editor", class:"canvas",
    oninput: onEditorInput,
    oncompositionstart(){ composing = true; },
    oncompositionend(){ composing = false; onEditorInput(); },
    onkeyup(){ updateToolbarState(); },
    onmouseup(){ updateToolbarState(); },
    onpaste: onEditorPaste,
    ondragover(e){ if (e.dataTransfer && e.dataTransfer.types && [].indexOf.call(e.dataTransfer.types, "Files") !== -1) e.preventDefault(); },
    ondrop: onCanvasDrop,
    onclick: onCanvasClick,
    ondblclick(e){ if (e.target && e.target.tagName === "IMG"){ e.preventDefault(); resetImgSize(e.target); } },
    onkeydown: onEditorKeydown,
    onpointerdown: onCanvasPointerDown,
    onfocusin: onCanvasFocusIn,
    onfocusout: onCanvasFocusOut
  });
  for (let i = 0; i < page.boxes.length; i++) canvas.appendChild(buildBoxEl(page.boxes[i]));

  const wrap = el("div", { id:"canvasWrap",
    class: "canvas-wrap" + (state.settings.noteGrid ? "" : " plain") }, canvas);

  pane.append(
    el("div", { class:"ed-head" },
      title,
      el("button", { class:"btn btn-ghost btn-icon", title: t("deletePage"), "aria-label": t("deletePage"),
        onclick(){ deletePage(ui.nbId, page.id); } }, icon("trash"))
    ),
    el("div", { class:"ed-meta", id:"edMeta" }),
    el("aside", { class:"backlinks", id:"edBacklinks", hidden:true, "aria-label": t("backlinks") }),
    buildToolbar(),
    wrap
  );

  renderEdMeta();
  refreshCanvasHint();
  resizeCanvas();

  // Geçmişin tabanı: bu sayfanın yığını korunur, geri dönünce devam eder.
  clearTimeout(burstTimer); burstTimer = null; burstOpen = false; composing = false;
  lastHtml = packImages(canvas.innerHTML);
  updateUndoButtons();

  // Etiket tabanlı biçimlendirme: kapalıyken tarayıcılar <span style> üretir,
  // süzgeç style'ı attığı için biçim kaybolurdu.
  try { document.execCommand("styleWithCSS", false, false); } catch(e){}
  updateToolbarState();
}

/** Ekran okuyucu için: on kutunun hepsi aynı adı söylerse ayırt edilemezler.
 *  Numaralandırma DOM sırasına göre değil OKUMA SIRASINA göre yapılır — DOM
 *  sırası sürüklemede öne alma yüzünden değişir, konum ise kutunun kimliğidir. */
function relabelBoxes(){
  const ed = canvasEl(); if (!ed) return;
  const els = [].slice.call(ed.querySelectorAll(".nbox"));
  els.sort((a, b) => (a.offsetTop - b.offsetTop) || (a.offsetLeft - b.offsetLeft));
  for (let i = 0; i < els.length; i++){
    const body = bodyOf(els[i]);
    if (body) body.setAttribute("aria-label", t("boxLabel", { n: i + 1 }));
  }
}

function renderEdMeta(){
  const host = document.getElementById("edMeta");
  const page = currentPage();
  if (!host || !page) return;
  const ed = canvasEl();
  const n = ed ? ed.querySelectorAll(".nbox").length : (page.boxes || []).length;
  host.textContent = "";
  host.append(
    el("span", { text: t("updated") + ": " + formatStamp(page.updatedAt) }),
    el("span", { class:"chip" }, icon("sticky"), String(n))
  );
  // Kutu sayısı değişen her yol zaten buradan geçiyor; etiketler de burada tazelenir.
  relabelBoxes();
  renderBacklinks();
}

/* ------------------------------------------------- geri-bağlantı paneli ---
 * Açık sayfaya bağlanan görevler ve sayfalar. BAĞLANTI YOKSA HİÇ ÇİZİLMEZ:
 * boş bir "Geri bağlantılar (0)" başlığı yer kaplar ve hiçbir şey söylemez. */
function renderBacklinks(){
  const host = document.getElementById("edBacklinks");
  const page = currentPage();
  if (!host) return;
  host.textContent = "";
  host.hidden = true;
  if (!page || !page.title.trim()) return;

  const index = buildLinkIndex(state.tasks, notes.notebooks, pagePlain);
  const back = backlinksFor(index, page.title);
  const items = [
    ...back.tasks.map(x => ({ kind: "task", id: x.id, label: noteTextOfTitle(x.title) })),
    ...back.pages.filter(x => x.page.id !== page.id)
        .map(x => ({ kind: "page", nbId: x.notebookId, id: x.page.id, label: pageTitleOf(x.page) })),
  ];
  if (!items.length) return;

  host.hidden = false;
  host.append(el("h3", { class:"bl-title" },
    icon("link"), el("span", { text: t("backlinks") }),
    el("span", { class:"n", text: String(items.length) })));
  const list = el("ul", { class:"bl-list" });
  for (const it of items){
    list.append(el("li", {}, el("button", {
      class:"bl-item",
      onclick(){
        if (it.kind === "task"){ ui.view = "tasks"; buildShell(); openPanel(it.id); }
        else { ui.nbId = it.nbId; ui.pageId = it.id; renderNotesView(FORCE_EDITOR); }
      }
    }, icon(it.kind === "task" ? "check" : "page"), el("span", { class:"bl-label", text: it.label }))));
  }
  host.append(list);
}

/* Görev başlığını geri-bağlantı listesinde düz metin göster: [[…]] işaretleri
   listede gürültü, çünkü hangi sayfaya bağlandığı zaten belli. */
function noteTextOfTitle(title){
  return splitByLinks(title).map(p => p.text).join("").replace(/\s+/g, " ").trim();
}

/* ================================ TUVAL =================================
 * OneNote modeli: sayfa bir yüzey, içerik ise o yüzeye konmuş not kutuları.
 * Boş bir yere tıkla — kutu orada açılır, imleç içine girer.
 *
 * GEÇMİŞİN KÖKÜ TUVALİN KENDİSİDİR, tek bir kutu değil. Anlık görüntü her
 * kutunun konumunu ve genişliğini de taşıdığı için taşıma, boyutlandırma ve
 * kutu silme metinle AYNI geri alma yığınına düşer; ikinci bir mekanizma
 * yazmaya gerek kalmaz. Bunun bedeli, kutuların olay dinleyicilerinin
 * yeniden kurulan DOM'da kaybolmasıdır — bu yüzden her şey tuvalde
 * delegasyonla dinlenir. */

const CANVAS_PAD = 340;      // en sağdaki/alttaki kutunun ötesinde bırakılan boş alan
let activeBoxId = null;

function canvasEl(){ return document.getElementById("editor"); }

/** node'u saran .nbox (yoksa null). parentNode ile yürünüyor: metin
 *  düğümlerinde closest yok. */
function boxOf(node){
  let n = node;
  while (n && n !== document.body){
    if (n.nodeType === 1 && n.classList && n.classList.contains("nbox")) return n;
    n = n.parentNode;
  }
  return null;
}
function boxElById(id){
  const ed = canvasEl();
  if (!ed || !id) return null;
  const els = ed.querySelectorAll(".nbox");
  for (let i = 0; i < els.length; i++) if (els[i].getAttribute("data-id") === id) return els[i];
  return null;
}
function bodyOf(wrap){ return wrap ? wrap.querySelector(".nbox-body") : null; }
function activeBody(){ return bodyOf(boxElById(activeBoxId)); }

/** Odağı etkin kutuya verir. Araç çubuğu düğmeleri mousedown'da seçimi
 *  koruduğu için odak genelde zaten oradadır; bu, kenar durumlar için. */
function focusActive(){
  const body = activeBody();
  if (body && document.activeElement !== body) body.focus();
  return body;
}

/** Biçimlendirme komutlarının hedefi. Hiç kutu yoksa bir tane açılır —
 *  araç çubuğuna basmak sessizce hiçbir şey yapmasın. */
function requireBody(){
  const cur = focusActive();
  if (cur) return cur;
  const ed = canvasEl(); if (!ed) return null;
  const first = ed.querySelector(".nbox");
  if (first){ focusBox(first.getAttribute("data-id"), true); return activeBody(); }
  const box = createBoxAt(44, 36);
  return box ? activeBody() : null;
}

function buildBoxEl(box){
  const wrap = document.createElement("div");
  wrap.className = "nbox";
  wrap.setAttribute("data-id", box.id);
  wrap.style.left = box.x + "px";
  wrap.style.top = box.y + "px";
  wrap.style.width = box.w + "px";

  const grip = document.createElement("div");
  grip.className = "nbox-grip";
  grip.setAttribute("title", t("boxMove"));

  const del = document.createElement("button");
  del.className = "nbox-del";
  del.setAttribute("type", "button");
  del.setAttribute("title", t("boxDelete"));
  del.setAttribute("aria-label", t("boxDelete"));
  del.innerHTML = ICON.x;

  const body = document.createElement("div");
  body.className = "nbox-body";
  body.setAttribute("contenteditable", "true");
  body.setAttribute("spellcheck", "false");
  body.setAttribute("role", "textbox");
  body.setAttribute("aria-multiline", "true");
  body.setAttribute("aria-label", t("boxLabel", { n: "" }).trim());
  body.innerHTML = sanitizeHtml(box.html || "");
  if (!body.innerHTML.trim()) body.innerHTML = "<p><br></p>";
  wrapWideTables(body);

  const rz = document.createElement("div");
  rz.className = "nbox-rz";
  rz.setAttribute("title", t("boxResize"));

  wrap.appendChild(grip);
  wrap.appendChild(del);
  wrap.appendChild(body);
  wrap.appendChild(rz);
  return wrap;
}

/** DOM -> model. Boş kutular KAYDEDİLMEZ: yazılmamış bir kutu içerik değil,
 *  imlecin o an durduğu yerdir; saklanırsa her açılışta hayalet kutular
 *  birikirdi. */
function readBoxes(ed){
  const out = [];
  const els = ed.querySelectorAll(".nbox");
  for (let i = 0; i < els.length; i++){
    const n = els[i], body = bodyOf(n);
    if (!body || boxIsEmpty(n)) continue;
    out.push({
      id: n.getAttribute("data-id") || uid(),
      x: clamp(Math.round(parseFloat(n.style.left) || 0), 0, CANVAS_MAX),
      y: clamp(Math.round(parseFloat(n.style.top) || 0), 0, CANVAS_MAX),
      w: clamp(Math.round(parseFloat(n.style.width) || BOX_DEF_W), BOX_MIN_W, BOX_MAX_W),
      html: sanitizeHtml(body.innerHTML)
    });
  }
  return out;
}

function boxIsEmpty(wrap){
  const body = bodyOf(wrap);
  if (!body) return true;
  if (body.querySelector("img, table, hr")) return false;
  return String(body.textContent || "").replace(/​/g, "").trim() === "";
}

/** Tuval, en dıştaki kutunun ötesinde de tıklanacak yer bırakacak kadar
 *  büyür: "istediğin yere" demek, görünen alanla sınırlı olmamak demek. */
let canvasResizeReq = 0;
function resizeCanvas(){
  const ed = canvasEl(); if (!ed) return;
  const wrap = ed.parentNode;
  let right = 0, bottom = 0;
  const els = ed.querySelectorAll(".nbox");
  for (let i = 0; i < els.length; i++){
    right = Math.max(right, els[i].offsetLeft + els[i].offsetWidth);
    bottom = Math.max(bottom, els[i].offsetTop + els[i].offsetHeight);
  }
  const vw = wrap ? wrap.clientWidth : 0, vh = wrap ? wrap.clientHeight : 0;
  ed.style.width = Math.max(vw, right + CANVAS_PAD) + "px";
  ed.style.height = Math.max(vh, bottom + CANVAS_PAD) + "px";
}
function scheduleCanvasResize(){
  if (canvasResizeReq) return;
  const raf = window.requestAnimationFrame || (f => setTimeout(f, 16));
  canvasResizeReq = 1;
  raf(() => { canvasResizeReq = 0; resizeCanvas(); });
}
window.addEventListener("resize", () => { if (ui.view === "notes") scheduleCanvasResize(); });

/* İpucu TUVALİN İÇİNE konmaz: tuvalin innerHTML'i geri alma yığınına giriyor,
   içine konan her süs anlık görüntülere sızardı. Kaydırma kabına konur. */
function refreshCanvasHint(){
  const ed = canvasEl(), wrap = document.getElementById("canvasWrap");
  if (!ed || !wrap) return;
  const old = wrap.querySelector(".canvas-hint");
  const empty = !ed.querySelector(".nbox");
  if (empty && !old){
    wrap.appendChild(el("div", { class:"canvas-hint" },
      el("b", { text: t("canvasHintTitle") }),
      t("canvasHintBody")
    ));
  } else if (!empty && old){
    old.parentNode.removeChild(old);
  }
}

function setActiveBox(id){
  const ed = canvasEl(); if (!ed) return;
  activeBoxId = id || null;
  const els = ed.querySelectorAll(".nbox");
  for (let i = 0; i < els.length; i++){
    els[i].classList.toggle("focus", els[i].getAttribute("data-id") === activeBoxId);
  }
}

function focusBox(id, toEnd){
  const wrap = boxElById(id); if (!wrap) return;
  const body = bodyOf(wrap); if (!body) return;
  setActiveBox(id);
  body.focus();
  try {
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(body);
    r.collapse(!toEnd);
    sel.removeAllRanges(); sel.addRange(r);
  } catch(e){}
}

/** Yeni boş kutu AYRI BİR GERİ ALMA ADIMI AÇMAZ: henüz içerik yok, adım
 *  açmak Ctrl+Z'yi "hiçbir şey olmadı" gibi görünen adımlarla doldururdu.
 *  Geçmişin tabanı sessizce güncellenir; ilk tuşa basıldığında o taban
 *  geri alma adımına dönüşür. */
function createBoxAt(x, y){
  const ed = canvasEl(); if (!ed) return null;
  closeBurst();
  x = clamp(Math.round(x), 0, CANVAS_MAX);
  y = clamp(Math.round(y), 0, CANVAS_MAX);
  // Sağ kenara yakın tıklandığında varsayılan genişlik görünen alandan taşar
  // ve kutu daha ilk harften önce yatay kaydırma açardı. Önce daralt, yine
  // sığmıyorsa sola kaydır; ikisi de olmuyorsa asgari genişlikte bırak.
  const wrap = document.getElementById("canvasWrap");
  let w = BOX_DEF_W;
  if (wrap && wrap.clientWidth){
    const visRight = wrap.scrollLeft + wrap.clientWidth - 24;
    if (x + w > visRight){
      w = Math.max(BOX_MIN_W, visRight - x);
      if (x + w > visRight) x = Math.max(0, visRight - w);
    }
  }
  const box = { id: uid(), x, y, w: clamp(Math.round(w), BOX_MIN_W, BOX_MAX_W), html: "" };
  ed.appendChild(buildBoxEl(box));
  lastHtml = packImages(ed.innerHTML);
  refreshCanvasHint();
  renderEdMeta();
  focusBox(box.id, false);
  scheduleCanvasResize();
  return box;
}

/** Yazılmamış kutuyu sessizce toplar (OneNote de böyle yapar). Geri alma
 *  adımı açılmaz ama TABAN GÜNCELLENİR — yoksa bir sonraki adım silinen
 *  kutuyu geri getirirdi. */
function dropEmptyBox(id){
  const wrap = boxElById(id);
  if (!wrap || !boxIsEmpty(wrap)) return false;
  wrap.parentNode.removeChild(wrap);
  if (activeBoxId === id) activeBoxId = null;
  const ed = canvasEl();
  if (ed) lastHtml = packImages(ed.innerHTML);
  refreshCanvasHint();
  scheduleCanvasResize();
  renderEdMeta();
  return true;
}

/** Dolu kutuyu silmek gerçek bir içerik kaybıdır: geri alınabilir olmalı. */
function removeBox(id){
  const wrap = boxElById(id); if (!wrap) return;
  if (boxIsEmpty(wrap)){ dropEmptyBox(id); return; }
  closeImgPopover();
  withUndo(() => {
    wrap.parentNode.removeChild(wrap);
    if (activeBoxId === id) activeBoxId = null;
    onEditorChanged();
  });
  refreshCanvasHint();
  renderEdMeta();
  toast(t("boxDeleted"), { label: t("undo"), run: doUndo }, 7000);
}

function canvasPoint(e){
  const ed = canvasEl();
  const r = ed.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/** Görünen alanın sol üstüne yakın, boş bir yer. Klavye ve dokunmatik için:
 *  fare olmadan da "buraya not al" diyebilmek gerekiyor. */
function addBoxInView(){
  const ed = canvasEl(), wrap = document.getElementById("canvasWrap");
  if (!ed || !wrap) return null;
  let x = wrap.scrollLeft + 40, y = wrap.scrollTop + 32;
  // Var olan bir kutunun tam üstüne düşmesin: boş yer bulunana dek aşağı kay.
  const els = ed.querySelectorAll(".nbox");
  for (let guard = 0; guard < 60; guard++){
    let clash = false;
    for (let i = 0; i < els.length; i++){
      const n = els[i];
      if (Math.abs(n.offsetLeft - x) < 60 && Math.abs(n.offsetTop - y) < 60){ clash = true; break; }
    }
    if (!clash) break;
    y += 46;
  }
  return createBoxAt(x, y);
}

/* ----------------------------------------------- kutu taşıma / genişletme */
let boxDrag = null;

function onCanvasPointerDown(e){
  if (e.button !== 0) return;
  const target = e.target;
  if (!target || target.nodeType !== 1 || !target.classList) return;
  const wrap = boxOf(target);
  if (!wrap) return;
  if (target.classList.contains("nbox-grip")) startBoxDrag(e, wrap, "move");
  else if (target.classList.contains("nbox-rz")) startBoxDrag(e, wrap, "size");
}

function startBoxDrag(e, wrap, mode){
  e.preventDefault();
  closeBurst();
  closeImgPopover();
  const ed = canvasEl(); if (!ed) return;
  boxDrag = {
    mode, wrap,
    sx: e.clientX, sy: e.clientY,
    ox: parseFloat(wrap.style.left) || 0,
    oy: parseFloat(wrap.style.top) || 0,
    ow: parseFloat(wrap.style.width) || BOX_DEF_W,
    before: packImages(ed.innerHTML),
    moved: false
  };
  wrap.classList.add("dragging");
  // Taşınan kutu öne gelsin: üst üste binen kutularda başka türlü tutulamaz.
  if (mode === "move" && ed.lastChild !== wrap) ed.appendChild(wrap);
  document.addEventListener("pointermove", onBoxDragMove, true);
  document.addEventListener("pointerup", endBoxDrag, true);
  document.addEventListener("pointercancel", endBoxDrag, true);
}

function onBoxDragMove(e){
  if (!boxDrag) return;
  const dx = e.clientX - boxDrag.sx, dy = e.clientY - boxDrag.sy;
  if (!boxDrag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
  boxDrag.moved = true;
  if (boxDrag.mode === "move"){
    boxDrag.wrap.style.left = clamp(Math.round(boxDrag.ox + dx), 0, CANVAS_MAX) + "px";
    boxDrag.wrap.style.top  = clamp(Math.round(boxDrag.oy + dy), 0, CANVAS_MAX) + "px";
  } else {
    boxDrag.wrap.style.width = clamp(Math.round(boxDrag.ow + dx), BOX_MIN_W, BOX_MAX_W) + "px";
  }
}

function endBoxDrag(){
  if (!boxDrag) return;
  const d = boxDrag;
  boxDrag = null;
  document.removeEventListener("pointermove", onBoxDragMove, true);
  document.removeEventListener("pointerup", endBoxDrag, true);
  document.removeEventListener("pointercancel", endBoxDrag, true);
  d.wrap.classList.remove("dragging");
  const ed = canvasEl(); if (!ed) return;
  if (!d.moved){
    // Yalnızca öne alındı; içerik değişmedi ama sıralama değişmiş olabilir.
    lastHtml = packImages(ed.innerHTML);
    dirtyEditor = true; scheduleSaveNotes();
    return;
  }
  pushUndo(d.before);
  lastHtml = packImages(ed.innerHTML);
  dirtyEditor = true;
  scheduleSaveNotes(); schedulePageListRefresh();
  scheduleCanvasResize(); updateUndoButtons();
}

/** Klavyeyle taşıma: Alt+ok. Fare kullanamayan biri için tek yol bu. */
function nudgeBox(dx, dy){
  const wrap = boxElById(activeBoxId); if (!wrap) return false;
  const ed = canvasEl(); if (!ed) return false;
  closeBurst();
  const before = packImages(ed.innerHTML);
  wrap.style.left = clamp(Math.round((parseFloat(wrap.style.left) || 0) + dx), 0, CANVAS_MAX) + "px";
  wrap.style.top  = clamp(Math.round((parseFloat(wrap.style.top)  || 0) + dy), 0, CANVAS_MAX) + "px";
  pushUndo(before);
  lastHtml = packImages(ed.innerHTML);
  dirtyEditor = true;
  scheduleSaveNotes(); scheduleCanvasResize(); updateUndoButtons();
  return true;
}

/** Kâğıtta kutular DOM sırasına göre akardı; DOM sırası tuvalde okuma sırası
 *  DEĞİL (kutular serbest konumlu, sıra da öne alma ile değişiyor). Yazdırmadan
 *  önce her kutuya konumundan hesaplanan bir `order` yazılır, sonra silinir —
 *  kalıcı olsaydı geçmiş anlık görüntülerine de sızardı. */
function orderBoxesForPrint(){
  const ed = canvasEl(); if (!ed) return;
  const els = [].slice.call(ed.querySelectorAll(".nbox"));
  els.sort((a, b) => (a.offsetTop - b.offsetTop) || (a.offsetLeft - b.offsetLeft));
  for (let i = 0; i < els.length; i++) els[i].style.order = String(i + 1);
}
function clearPrintOrder(){
  const ed = canvasEl(); if (!ed) return;
  const els = ed.querySelectorAll(".nbox");
  for (let i = 0; i < els.length; i++) els[i].style.order = "";
}
window.addEventListener("beforeprint", orderBoxesForPrint);
window.addEventListener("afterprint", clearPrintOrder);

/* ------------------------------------------------------- tuval olayları */
function onCanvasFocusIn(e){
  const wrap = boxOf(e.target);
  if (wrap) setActiveBox(wrap.getAttribute("data-id"));
}

/** Kutudan çıkınca boşsa toplanır. activeBoxId BİLEREK temizlenmez: araç
 *  çubuğu düğmeleri odağı almasa da menüler alabiliyor ve komutun hedefi
 *  "en son yazdığın kutu" olmalı. */
function onCanvasFocusOut(e){
  const leaving = boxOf(e.target);
  if (!leaving) return;
  const id = leaving.getAttribute("data-id");
  setTimeout(() => {
    const wrap = boxElById(id);
    if (!wrap || wrap.contains(document.activeElement)) return;
    if (boxDrag) return;
    dropEmptyBox(id);
  }, 0);
}

function onCanvasClick(e){
  const del = boxOf(e.target) && upClass(e.target, "nbox-del");
  if (del){
    e.preventDefault();
    const wrap = boxOf(del);
    if (wrap) removeBox(wrap.getAttribute("data-id"));
    return;
  }
  if (boxOf(e.target)){ onEditorClick(e); return; }
  // Boş tuval: OneNote'un can alıcı davranışı — tıkladığın yere kutu açılır.
  if (e.target !== canvasEl()) return;
  const pt = canvasPoint(e);
  createBoxAt(pt.x - 12, pt.y - 15);
}

function upClass(node, cls){
  let n = node;
  while (n && n !== document.body){
    if (n.nodeType === 1 && n.classList && n.classList.contains(cls)) return n;
    n = n.parentNode;
  }
  return null;
}

/** Resim sürüklenip bırakıldığında BIRAKILAN NOKTA kutu olur: dosyayı
 *  tuvalin ortasına atıp "nereye gitti" dedirtmenin anlamı yok. */
function onCanvasDrop(e){
  const dt = e.dataTransfer;
  if (!dt || !dt.files || !dt.files.length) return;
  const f = dt.files[0];
  if (!/^image\//.test(f.type || "")) return;
  e.preventDefault();
  if (!boxOf(e.target)){
    const pt = canvasPoint(e);
    createBoxAt(pt.x - 12, pt.y - 15);
  }
  insertImageFile(f);
}

/* ========================= GERİ ALMA / YİNELEME =========================
 * Tarayıcının kendi yığını yalnızca execCommand'i ve doğal yazmayı görür.
 * Vurgu, kutucuk, resim ve boyutlandırma DOM'u doğrudan değiştirdiği için
 * oraya hiç yazılmıyordu — üstelik araya giren doğrudan değişiklik mevcut
 * geçmişi de tutarsızlaştırıyordu. Bu yüzden kendi anlık görüntü yığınımız. */

const HIST_MAX_STEPS = 80;                    // sayfa başına adım
const HIST_MAX_TOTAL = 12 * 1024 * 1024;      // UYGULAMA GENELİ bütçe
const HIST_MAX_STATE = 2 * 1024 * 1024;       // tek durumun tavanı
const BURST_MS = 500;

const HISTORY = { perPage: new Map(), images: new Map(), totalBytes: 0 };
let lastHtml = "";        // geçmişteki en son bilinen durum (seri açıkken güncellenmez)
let burstTimer = null, burstOpen = false, composing = false, applyingHistory = false;

/** Anlık görüntülerde resim verisi TEKRARLANMAZ: her data URL içerik anahtarıyla
 *  tek bir haritada tutulur, HTML'de yalnızca "ref:" yer tutucusu kalır.
 *  Aksi halde tek bir resim her tuş vuruşunda yeniden kopyalanır ve bütçe
 *  birkaç adımda dolardı. */
function imgKey(url){
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++){
    h = (h ^ url.charCodeAt(i)) >>> 0;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36) + "z" + url.length.toString(36);
}
function packImages(html){
  return String(html).replace(/src="(data:image\/[^"]*)"/g, (m, url) => {
    const k = imgKey(url);
    if (!HISTORY.images.has(k)) HISTORY.images.set(k, url);
    return 'src="ref:' + k + '"';
  });
}
function unpackImages(html){
  return String(html).replace(/src="ref:([a-z0-9]+z[a-z0-9]+)"/g, (m, k) => {
    const url = HISTORY.images.get(k);
    return url ? 'src="' + url + '"' : 'src=""';
  });
}

/* --- seçim: düğüm yolu + düz metin sırası (yol geçersizse ona düşülür) --- */
function nodePath(root, node){
  const path = [];
  let n = node;
  while (n && n !== root){
    const p = n.parentNode;
    if (!p) return null;
    path.unshift([].indexOf.call(p.childNodes, n));
    n = p;
  }
  return n === root ? path : null;
}
function nodeAtPath(root, path){
  let n = root;
  for (let i = 0; i < path.length; i++){
    if (!n || !n.childNodes || !n.childNodes[path[i]]) return null;
    n = n.childNodes[path[i]];
  }
  return n;
}
function textOffsetOf(root, node, offset){
  let total = 0, found = false;
  (function walk(n){
    if (found) return;
    if (n === node && n.nodeType !== 3){
      // eleman içi konum: ilk `offset` çocuğun metni kadar ilerle
      for (let i = 0; i < offset && i < n.childNodes.length; i++) total += String(n.childNodes[i].textContent || "").length;
      found = true; return;
    }
    if (n.nodeType === 3){
      if (n === node){ total += offset; found = true; return; }
      total += n.nodeValue.length; return;
    }
    for (let i = 0; i < n.childNodes.length; i++){ walk(n.childNodes[i]); if (found) return; }
  })(root);
  return found ? total : null;
}
function locateTextOffset(root, target){
  let seen = 0, hit = null;
  (function walk(n){
    if (hit) return;
    if (n.nodeType === 3){
      const len = n.nodeValue.length;
      if (seen + len >= target){ hit = { node: n, offset: Math.max(0, target - seen) }; return; }
      seen += len; return;
    }
    for (let i = 0; i < n.childNodes.length; i++){ walk(n.childNodes[i]); if (hit) return; }
  })(root);
  return hit || { node: root, offset: root.childNodes.length };
}
function selectionBackward(sel){
  if (!sel.anchorNode || !sel.focusNode || sel.isCollapsed) return false;
  const pos = sel.anchorNode.compareDocumentPosition(sel.focusNode);
  if (pos & Node.DOCUMENT_POSITION_PRECEDING) return true;
  if (pos === 0) return sel.focusOffset < sel.anchorOffset;
  return false;
}
function captureSel(ed){
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  if (!ed.contains(sel.anchorNode) || !ed.contains(sel.focusNode)) return null;
  return {
    aPath: nodePath(ed, sel.anchorNode), aOff: sel.anchorOffset,
    fPath: nodePath(ed, sel.focusNode),  fOff: sel.focusOffset,
    aText: textOffsetOf(ed, sel.anchorNode, sel.anchorOffset),
    fText: textOffsetOf(ed, sel.focusNode, sel.focusOffset),
    backward: selectionBackward(sel)
  };
}
function restoreSel(ed, s){
  if (!s) return;
  const sel = window.getSelection(); if (!sel) return;
  const resolve = (path, off, textOff) => {
    let node = path ? nodeAtPath(ed, path) : null;
    if (node){
      const max = node.nodeType === 3 ? node.nodeValue.length : node.childNodes.length;
      return { node, offset: Math.min(off, max) };
    }
    return locateTextOffset(ed, textOff == null ? 0 : textOff);   // yol geçersiz → metin sırası
  };
  const a = resolve(s.aPath, s.aOff, s.aText);
  const f = resolve(s.fPath, s.fOff, s.fText);
  try {
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStart(a.node, a.offset); r.setEnd(a.node, a.offset);
    sel.addRange(r);
    if (sel.extend && (f.node !== a.node || f.offset !== a.offset)) sel.extend(f.node, f.offset);
  } catch(e){ /* yapı çok değiştiyse imleç neredeyse oraya düşer, sorun değil */ }
}

/* ------------------------------------------------------------ yığın işlemleri */
function histFor(pageId){
  let h = HISTORY.perPage.get(pageId);
  if (!h){ h = { undo: [], redo: [], bytes: 0 }; HISTORY.perPage.set(pageId, h); }
  return h;
}
function dropHistory(pageId){
  const h = HISTORY.perPage.get(pageId);
  if (!h) return;
  HISTORY.totalBytes -= h.bytes;
  HISTORY.perPage.delete(pageId);
  gcHistoryImages();
}
function stateOf(html, sel){ return { html, sel, size: html.length * 2 }; }

function pushUndo(html){
  if (!editorPageId || applyingHistory) return;
  const ed = editorEl(); if (!ed) return;
  const h = histFor(editorPageId);
  const last = h.undo[h.undo.length - 1];
  if (last && last.html === html) return;         // değişmemişse adım açma
  const st = stateOf(html, captureSel(ed));
  if (st.size > HIST_MAX_STATE){
    // Tek durum tavanı aşıldı: geçmişi tutmak belleği yer, kesip haber veriyoruz.
    HISTORY.totalBytes -= h.bytes;
    h.undo.length = 0; h.redo.length = 0; h.bytes = 0;
    toast(t("histTooBig"), null, 7000);
    return;
  }
  h.undo.push(st); h.bytes += st.size; HISTORY.totalBytes += st.size;
  h.redo.length = 0;                              // yeni düzenleme ileri alma dalını siler
  pruneHistory();
  updateUndoButtons();
}

function pruneHistory(){
  const h = histFor(editorPageId);
  while (h.undo.length > HIST_MAX_STEPS){
    const s = h.undo.shift(); h.bytes -= s.size; HISTORY.totalBytes -= s.size;
  }
  if (HISTORY.totalBytes <= HIST_MAX_TOTAL){ return; }
  // Bütçe aşıldı: önce AKTİF OLMAYAN sayfaların geçmişi budanır.
  const others = [];
  HISTORY.perPage.forEach((v, k) => { if (k !== editorPageId) others.push(k); });
  for (const id of others){
    const hh = HISTORY.perPage.get(id);
    while ((hh.undo.length || hh.redo.length) && HISTORY.totalBytes > HIST_MAX_TOTAL){
      const s = hh.undo.length ? hh.undo.shift() : hh.redo.shift();
      hh.bytes -= s.size; HISTORY.totalBytes -= s.size;
    }
    if (!hh.undo.length && !hh.redo.length) HISTORY.perPage.delete(id);
    if (HISTORY.totalBytes <= HIST_MAX_TOTAL) break;
  }
  while (HISTORY.totalBytes > HIST_MAX_TOTAL && h.undo.length > 1){
    const s = h.undo.shift(); h.bytes -= s.size; HISTORY.totalBytes -= s.size;
  }
  gcHistoryImages();
}

/** Artık hiçbir anlık görüntünün atıfta bulunmadığı resimleri haritadan at. */
function gcHistoryImages(){
  if (!HISTORY.images.size) return;
  const alive = new Set();
  const scan = (html) => {
    const re = /src="ref:([a-z0-9]+z[a-z0-9]+)"/g;
    let m; while ((m = re.exec(html))) alive.add(m[1]);
  };
  HISTORY.perPage.forEach(h => { h.undo.forEach(s => scan(s.html)); h.redo.forEach(s => scan(s.html)); });
  scan(lastHtml);
  HISTORY.images.forEach((v, k) => { if (!alive.has(k)) HISTORY.images.delete(k); });
}

/* ---------------------------------------------------- seri (burst) yönetimi */
function closeBurst(){
  clearTimeout(burstTimer); burstTimer = null;
  if (!burstOpen) return;
  burstOpen = false;
  const ed = editorEl();
  if (ed) lastHtml = packImages(ed.innerHTML);
  updateUndoButtons();
}

/** Yapısal değişiklikler bunun içinde yapılır: açık seriyi kapatır, DEĞİŞİKLİKTEN
 *  ÖNCEKİ durumu geçmişe yazar, sonra yeni durumu taban alır. */
function withUndo(fn){
  const ed = editorEl(); if (!ed) return;
  if (applyingHistory) { fn(); return; }
  closeBurst();
  pushUndo(packImages(ed.innerHTML));
  fn();
  lastHtml = packImages(ed.innerHTML);
  updateUndoButtons();
}

function onEditorInput(){
  if (composing) return;                       // IME bileşimi bitene kadar bekle
  if (!burstOpen){ pushUndo(lastHtml); burstOpen = true; }
  clearTimeout(burstTimer);
  burstTimer = setTimeout(closeBurst, BURST_MS);
  onEditorChanged();
}

function applyState(ed, st){
  applyingHistory = true;
  ed.innerHTML = unpackImages(st.html);
  restoreSel(ed, st.sel);
  applyingHistory = false;
  dirtyEditor = true;
  scheduleSaveNotes();
  schedulePageListRefresh();
  updateToolbarState();
  updateUndoButtons();
  closeImgPopover();
  // Kutular baştan kuruldu: seçili kutu vurgusu, ipucu ve tuval boyu tazelenir.
  setActiveBox(boxElById(activeBoxId) ? activeBoxId : null);
  refreshCanvasHint();
  renderEdMeta();
  resizeCanvas();
}

function doUndo(){
  const ed = editorEl(); if (!ed || !editorPageId) return;
  closeBurst();
  const h = histFor(editorPageId);
  if (!h.undo.length) return;
  const cur = stateOf(packImages(ed.innerHTML), captureSel(ed));
  const prev = h.undo.pop();
  h.bytes -= prev.size; HISTORY.totalBytes -= prev.size;
  h.redo.push(cur); h.bytes += cur.size; HISTORY.totalBytes += cur.size;
  applyState(ed, prev);
  lastHtml = prev.html;
}
function doRedo(){
  const ed = editorEl(); if (!ed || !editorPageId) return;
  closeBurst();
  const h = histFor(editorPageId);
  if (!h.redo.length) return;
  const cur = stateOf(packImages(ed.innerHTML), captureSel(ed));
  const next = h.redo.pop();
  h.bytes -= next.size; HISTORY.totalBytes -= next.size;
  h.undo.push(cur); h.bytes += cur.size; HISTORY.totalBytes += cur.size;
  applyState(ed, next);
  lastHtml = next.html;
}

function updateUndoButtons(){
  const h = editorPageId ? HISTORY.perPage.get(editorPageId) : null;
  const u = document.getElementById("tbUndo"), r = document.getElementById("tbRedo");
  if (u) u.disabled = !(h && h.undo.length);
  if (r) r.disabled = !(h && h.redo.length);
}

/* ------------------------------------------------------------ araç çubuğu */
/* Vurgu artık Word'den gelenle AYNI temsili yazar: doğrulanmış satır içi
   background-color + okunabilir bir color. Böylece tek kanonik model var.
   (Eski notlardaki hl-* sınıfları okunur kalmaya devam eder.) */
const HILITES = [["#fde68a","#3a2f05"],["#bbf7d0","#05321d"],["#bfdbfe","#0a2540"],["#f5d0fe","#3b0a3e"]];

function tbBtn(key, iconName, onclick, label){
  return el("button", { type:"button", "data-tb":key, title: label, "aria-label": label,
    onmousedown(e){ e.preventDefault(); },   // seçim kaybolmasın
    onclick }, iconName ? icon(iconName) : null);
}
function tbText(key, textLabel, onclick, label){
  return el("button", { type:"button", "data-tb":key, class:"tb-txt", title: label, "aria-label": label,
    onmousedown(e){ e.preventDefault(); }, onclick }, textLabel);
}

function buildToolbar(){
  const bar = el("div", { class:"toolbar", id:"toolbar", role:"toolbar", "aria-label": t("tbToolbar") });
  bar.append(
    el("button", { type:"button", id:"tbAddBox", title: t("tbAddBox"), "aria-label": t("tbAddBox"),
      onmousedown(e){ e.preventDefault(); }, onclick(){ addBoxInView(); } }, icon("sticky")),
    el("span", { class:"tb-sep" }),
    el("button", { type:"button", id:"tbUndo", title: t("tbUndo"), "aria-label": t("tbUndo"),
      onmousedown(e){ e.preventDefault(); }, onclick: doUndo }, icon("undo")),
    el("button", { type:"button", id:"tbRedo", title: t("tbRedo"), "aria-label": t("tbRedo"),
      onmousedown(e){ e.preventDefault(); }, onclick: doRedo }, icon("redo")),
    el("span", { class:"tb-sep" }),
    tbBtn("bold", "bold", () => exec("bold"), t("tbBold")),
    tbBtn("italic", "italic", () => exec("italic"), t("tbItalic")),
    tbBtn("underline", "underline", () => exec("underline"), t("tbUnderline")),
    tbBtn("strikeThrough", "strike", () => exec("strikeThrough"), t("tbStrike")),
    el("span", { class:"tb-sep" }),
    tbText("h1", "H1", () => block("h1"), t("tbH1")),
    tbText("h2", "H2", () => block("h2"), t("tbH2")),
    tbText("h3", "H3", () => block("h3"), t("tbH3")),
    tbText("p", "¶", () => block("p"), t("tbP")),
    el("span", { class:"tb-sep" }),
    tbBtn("insertUnorderedList", "ul", () => exec("insertUnorderedList"), t("tbUl")),
    tbBtn("insertOrderedList", "ol", () => exec("insertOrderedList"), t("tbOl")),
    tbBtn("todo", "todo", toggleTodo, t("tbTodo")),
    tbBtn("blockquote", "quote", () => block("blockquote"), t("tbQuote")),
    tbBtn("pre", "code", () => block("pre"), t("tbCode")),
    el("span", { class:"tb-sep" })
  );
  bar.append(
    el("button", { type:"button", id:"tbHl", title: t("tbHl"), "aria-label": t("tbHl"),
      onmousedown(e){ e.preventDefault(); }, onclick(e){ openHiliteMenu(e.currentTarget); } }, icon("marker")),
    el("span", { class:"tb-sep" }),
    el("button", { type:"button", title: t("tbTable"), "aria-label": t("tbTable"),
      onmousedown(e){ e.preventDefault(); }, onclick(e){ openTableMenu(e.currentTarget); } }, icon("table")),
    el("button", { type:"button", title: t("tbColor"), "aria-label": t("tbColor"),
      onmousedown(e){ e.preventDefault(); }, onclick(e){ openColorMenu(e.currentTarget); } }, icon("palette")),
    el("button", { type:"button", title: t("tbSize"), "aria-label": t("tbSize"),
      onmousedown(e){ e.preventDefault(); }, onclick(e){ openSizeMenu(e.currentTarget); } }, icon("fontsize")),
    el("span", { class:"tb-sep" }),
    tbBtn("link", "link", insertLink, t("tbLink")),
    tbBtn("image", "image", () => document.getElementById("imgInput").click(), t("tbImage")),
    tbBtn("removeFormat", "eraser", () => { exec("removeFormat"); highlight(null, null); }, t("tbClear")),
    el("span", { class:"tb-sep" }),
    tbBtn("taskify", "taskify", taskifySelection, t("tbTaskify")),
    el("span", { class:"tb-sep" }),
    el("button", { type:"button", id:"tbGrid", class: state.settings.noteGrid ? "on" : "",
      title: t("tbGrid"), "aria-label": t("tbGrid"),
      onmousedown(e){ e.preventDefault(); }, onclick: toggleNoteGrid }, icon("grid"))
  );
  return bar;
}

function toggleNoteGrid(){
  state.settings.noteGrid = !state.settings.noteGrid;
  scheduleSave();
  const w = document.getElementById("canvasWrap");
  if (w) w.classList.toggle("plain", !state.settings.noteGrid);
  const b = document.getElementById("tbGrid");
  if (b) b.classList.toggle("on", !!state.settings.noteGrid);
}

/* Geçmişin kökü ile tuval AYNI elemandır: anlık görüntü bütün kutuları ve
   konumlarını kapsasın diye böyle. Ad, geçmiş modülünün diliyle korunuyor. */
function editorEl(){ return canvasEl(); }

function exec(cmd, val){
  if (!requireBody()) return;
  withUndo(() => {
    try { document.execCommand(cmd, false, val === undefined ? null : val); } catch(e){}
    onEditorChanged();
  });
}
function block(tag){
  const cur = currentBlockTag();
  // Aynı biçime ikinci kez basmak normal metne döndürür.
  exec("formatBlock", "<" + (cur === tag.toUpperCase() ? "p" : tag) + ">");
}

function currentBlockTag(){
  const ed = editorEl(); if (!ed) return null;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  let n = sel.getRangeAt(0).startContainer;
  while (n && n !== ed){
    if (n.nodeType === 1 && /^(H1|H2|H3|P|PRE|BLOCKQUOTE|LI)$/.test(n.tagName)) return n.tagName;
    n = n.parentNode;
  }
  return null;
}
function closestInEditor(node, test){
  const ed = editorEl(); if (!ed) return null;
  let n = node;
  while (n && n !== ed){
    if (n.nodeType === 1 && test(n)) return n;
    n = n.parentNode;
  }
  return null;
}
function currentLi(){
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  return closestInEditor(sel.getRangeAt(0).startContainer, n => n.tagName === "LI");
}

function toggleTodo(){
  if (!requireBody()) return;
  let li = currentLi();
  if (!li){ try { document.execCommand("insertUnorderedList"); } catch(e){} li = currentLi(); }
  if (!li) return;
  withUndo(() => {
    if (li.classList.contains("todo")) li.classList.remove("todo", "done");
    else li.classList.add("todo");
    onEditorChanged();
  });
}

/** Vurgu: execCommand("hiliteColor") style niteliği üretir, süzgeç onu attığı
 *  için burada doğrudan izinli sınıfla sarılır. cls null ise vurgu kaldırılır. */
const HL_SEL = 'span.hl-y, span.hl-g, span.hl-b, span.hl-p, span[style*="background-color"]';
function highlight(bg, fg){
  if (!focusActive()){ toast(t("selectFirst")); return; }
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed){ toast(t("selectFirst")); return; }
  const range = sel.getRangeAt(0);
  withUndo(() => {
  if (bg === null){
    const frag = range.extractContents();
    const tmp = document.createElement("div");
    tmp.appendChild(frag);
    const spans = tmp.querySelectorAll(HL_SEL);
    for (let i = 0; i < spans.length; i++){
      const s = spans[i];
      while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
      s.parentNode.removeChild(s);
    }
    const out = document.createDocumentFragment();
    while (tmp.firstChild) out.appendChild(tmp.firstChild);
    range.insertNode(out);
  } else {
    const span = document.createElement("span");
    span.setAttribute("style", "background-color:" + bg + ";color:" + fg);
    try { range.surroundContents(span); }
    catch(e){ span.appendChild(range.extractContents()); range.insertNode(span); }
  }
  sel.removeAllRanges();
  onEditorChanged();
  });
}

/* ================================ TABLOLAR ============================== */
const TBL_MAX = 10;
const currentTable = () => { const s = window.getSelection(); return (s && s.rangeCount) ? closestInEditor(s.getRangeAt(0).startContainer, n => n.tagName === "TABLE") : null; };
const currentCell = () => { const s = window.getSelection(); return (s && s.rangeCount) ? closestInEditor(s.getRangeAt(0).startContainer, n => n.tagName === "TD" || n.tagName === "TH") : null; };

/** Birleştirilmiş hücre içeren tabloda yapısal düzenleme kapalı: tam ızgara
 *  modeli yazmadan satır/sütun eklemek düzeni sessizce bozar. */
function hasMergedCells(table){
  const c = table.querySelectorAll("[colspan],[rowspan]");
  for (let i = 0; i < c.length; i++){
    if (parseInt(c[i].getAttribute("colspan") || "1", 10) > 1) return true;
    if (parseInt(c[i].getAttribute("rowspan") || "1", 10) > 1) return true;
  }
  return false;
}
function removeTableEl(table){
  const wrap = (table.parentNode && table.parentNode.classList && table.parentNode.classList.contains("tbl-wrap"))
    ? table.parentNode : table;
  if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
}

function insertTable(rows, cols, header){
  const ed = editorEl(); if (!ed || !requireBody()) return;
  if (currentTable()){ toast(t("tblNested")); return; }
  const cell = "<td><br></td>";
  let html = "<table>";
  if (header){
    html += "<thead><tr>";
    for (let c = 0; c < cols; c++) html += "<th><br></th>";
    html += "</tr></thead>";
    rows = Math.max(1, rows - 1);
  }
  html += "<tbody>";
  for (let r = 0; r < rows; r++){
    html += "<tr>";
    for (let c = 0; c < cols; c++) html += cell;
    html += "</tr>";
  }
  html += "</tbody></table><p><br></p>";
  withUndo(() => {
    try { document.execCommand("insertHTML", false, html); } catch(e){}
    wrapWideTables(ed);
    onEditorChanged();
  });
}

function tableOp(op){
  const ed = editorEl(); if (!ed) return;
  focusActive();
  const cell = currentCell(), table = currentTable();
  if (!cell || !table){ toast(t("tblNoCell")); return; }
  if (hasMergedCells(table)){ toast(t("tblMerged"), null, 6000); return; }
  const row = cell.parentNode;
  const idx = [].indexOf.call(row.children, cell);
  const allRows = table.querySelectorAll("tr");
  withUndo(() => {
    if (op === "rowAbove" || op === "rowBelow"){
      const tr = document.createElement("tr");
      for (let i = 0; i < row.children.length; i++){
        const td = document.createElement("td");
        td.innerHTML = "<br>";
        tr.appendChild(td);
      }
      row.parentNode.insertBefore(tr, op === "rowBelow" ? row.nextSibling : row);
    } else if (op === "colLeft" || op === "colRight"){
      for (let i = 0; i < allRows.length; i++){
        const cells = allRows[i].children;
        const ref = cells[Math.min(idx, cells.length - 1)];
        if (!ref) continue;
        const nc = document.createElement(ref.tagName);
        nc.innerHTML = "<br>";
        allRows[i].insertBefore(nc, op === "colRight" ? ref.nextSibling : ref);
      }
    } else if (op === "rowDel"){
      if (allRows.length <= 1){ removeTableEl(table); toast(t("tblGone")); }
      else row.parentNode.removeChild(row);
    } else if (op === "colDel"){
      if (row.children.length <= 1){ removeTableEl(table); toast(t("tblGone")); }
      else for (let i = 0; i < allRows.length; i++){
        const c = allRows[i].children[Math.min(idx, allRows[i].children.length - 1)];
        if (c) allRows[i].removeChild(c);
      }
    } else if (op === "header"){
      const first = allRows[0];
      if (!first) return;
      const toTh = first.children.length && first.children[0].tagName === "TD";
      for (let i = first.children.length - 1; i >= 0; i--){
        const old = first.children[i];
        const nc = document.createElement(toTh ? "th" : "td");
        while (old.firstChild) nc.appendChild(old.firstChild);
        ["colspan","rowspan"].forEach(a => { if (old.getAttribute(a)) nc.setAttribute(a, old.getAttribute(a)); });
        first.replaceChild(nc, old);
      }
    }
    onEditorChanged();
  });
}

/** Son hücrede Tab yeni satır açar; aradaki hücrelerde bir sonrakine geçer. */
function tabInTable(shift){
  const cell = currentCell(), table = currentTable();
  if (!cell || !table) return false;
  const cells = [].slice.call(table.querySelectorAll("td,th"));
  const i = cells.indexOf(cell);
  if (i < 0) return false;
  if (!shift && i === cells.length - 1 && !hasMergedCells(table)){
    tableOp("rowBelow");
    const after = [].slice.call(table.querySelectorAll("td,th"));
    const next = after[after.length - table.querySelectorAll("tr")[0].children.length];
    if (next) placeCaretIn(next);
    return true;
  }
  const target = cells[shift ? i - 1 : i + 1];
  if (!target) return false;
  placeCaretIn(target);
  return true;
}
function placeCaretIn(el){
  const sel = window.getSelection(); if (!sel) return;
  const r = document.createRange();
  r.selectNodeContents(el); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
}

/* -------------------------------------------- renk / punto / açılır kutular */
const TEXT_COLORS = ["#16181d","#c92a2a","#a86100","#0b7a55","#0369a1","#5b5bd6","#b4309b","#666e7d"];

let menuEl = null;
function closeMenu(){
  if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
  menuEl = null;
}
function openMenu(anchor, content){
  closeMenu();
  const r = anchor.getBoundingClientRect();
  menuEl = el("div", { class:"tb-menu", style:"top:" + (r.bottom + 6) + "px;left:" + Math.max(8, Math.min(r.left, window.innerWidth - 260)) + "px",
    onmousedown(e){ e.preventDefault(); } }, content);
  document.body.appendChild(menuEl);
}
document.addEventListener("mousedown", e => {
  if (menuEl && !menuEl.contains(e.target)) closeMenu();
});

/** Seçimi bir span'a sarar. Renk ve punto aynı yolu kullanır; vurgu ile aynı
 *  kanonik temsil (doğrulanmış satır içi renk / izinli punto sınıfı). */
function wrapSelectionWith(mutate){
  if (!focusActive()){ toast(t("selectFirst")); return; }
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed){ toast(t("selectFirst")); return; }
  const range = sel.getRangeAt(0);
  withUndo(() => {
    const span = document.createElement("span");
    mutate(span);
    try { range.surroundContents(span); }
    catch(e){ span.appendChild(range.extractContents()); range.insertNode(span); }
    sel.removeAllRanges();
    onEditorChanged();
  });
}

function openTableMenu(btn){
  let sel = { r:0, c:0 };
  const grid = el("div", { class:"tb-grid" });
  const label = el("div", { class:"tb-menu-lbl", text: t("tbTable") });
  const header = el("label", { class:"tb-menu-row" },
    el("input", { type:"checkbox", id:"tblHeaderChk", checked:true }), t("tblHeader"));
  for (let r = 1; r <= TBL_MAX; r++){
    for (let c = 1; c <= TBL_MAX; c++){
      grid.append(el("i", { class:"gc", dataset:{ r:String(r), c:String(c) },
        onmouseenter(){
          sel = { r, c };
          label.textContent = t("tblRows", { r, c });
          const cells = grid.querySelectorAll(".gc");
          for (let k = 0; k < cells.length; k++){
            const rr = +cells[k].dataset.r, cc = +cells[k].dataset.c;
            cells[k].classList.toggle("on", rr <= r && cc <= c);
          }
        },
        onclick(){
          const h = document.getElementById("tblHeaderChk");
          insertTable(sel.r, sel.c, !!(h && h.checked));
          closeMenu();
        }
      }));
    }
  }
  const ops = el("div", { class:"tb-menu-ops" },
    [["rowAbove","tblRowAbove"],["rowBelow","tblRowBelow"],["rowDel","tblRowDel"],
     ["colLeft","tblColLeft"],["colRight","tblColRight"],["colDel","tblColDel"],
     ["header","tblHeader"]].map(([op, key]) =>
       el("button", { class:"btn", onclick(){ tableOp(op); closeMenu(); } }, t(key)))
  );
  openMenu(btn, [label, grid, header, el("div", { class:"tb-menu-sep" }), ops]);
}

function openColorMenu(btn){
  const sw = TEXT_COLORS.map(c => el("i", { class:"cs", style:"background:" + c, title:c,
    onclick(){ wrapSelectionWith(sp => sp.setAttribute("style", "color:" + c)); closeMenu(); } }));
  openMenu(btn, [
    el("div", { class:"tb-menu-lbl", text: t("tbColor") }),
    el("div", { class:"tb-colors" }, sw),
    el("button", { class:"btn", style:"width:100%;margin-top:8px",
      onclick(){ exec("removeFormat"); closeMenu(); } }, t("colorDefault"))
  ]);
}

function openSizeMenu(btn){
  const steps = [["fs-xs","fsXs"],["fs-s","fsS"],["fs-m","fsM"],["fs-l","fsL"],["fs-xl","fsXl"]];
  openMenu(btn, [
    el("div", { class:"tb-menu-lbl", text: t("tbSize") }),
    el("div", { class:"tb-menu-ops" }, steps.map(([cls, key]) =>
      el("button", { class:"btn " + cls, onclick(){
        wrapSelectionWith(sp => { if (cls !== "fs-m") sp.setAttribute("class", cls); });
        closeMenu();
      }}, t(key))))
  ]);
}

function openHiliteMenu(anchor){
  openMenu(anchor, [
    el("div", { class:"tb-menu-lbl", text: t("tbHl") }),
    el("div", { class:"tb-colors" }, HILITES.map(([bg, fg]) =>
      el("button", { class:"cs", style:"background:" + bg, title: t("tbHl"), "aria-label": t("tbHl"),
        onclick(){ highlight(bg, fg); closeMenu(); } }))),
    el("div", { class:"tb-menu-sep" }),
    el("div", { class:"tb-menu-ops" },
      el("button", { class:"btn", onclick(){ highlight(null, null); closeMenu(); } }, t("tbHlNone")))
  ]);
}

function insertLink(){
  if (!focusActive()){ toast(t("selectFirst")); return; }
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed){ toast(t("selectFirst")); return; }
  const url = window.prompt(t("linkPrompt"), "https://");
  if (!url) return;
  if (!safeUrl(url)){ toast(t("importBad")); return; }
  try { document.execCommand("createLink", false, url); } catch(e){}
  onEditorChanged();
}

function updateToolbarState(){
  const bar = document.getElementById("toolbar");
  if (!bar) return;
  const blockTag = currentBlockTag();
  const btns = bar.querySelectorAll("[data-tb]");
  for (let i = 0; i < btns.length; i++){
    const b = btns[i], key = b.getAttribute("data-tb");
    let on = false;
    if (/^(bold|italic|underline|strikeThrough|insertUnorderedList|insertOrderedList)$/.test(key)){
      try { on = document.queryCommandState(key); } catch(e){ on = false; }
    } else if (/^(h1|h2|h3|p|pre|blockquote)$/.test(key)){
      on = blockTag === key.toUpperCase();
    } else if (key === "todo"){
      const li = currentLi();
      on = !!(li && li.classList.contains("todo"));
    }
    b.classList.toggle("on", !!on);
  }
}

/* ------------------------------------------------------------ resim hattı */
const IMG_MAX = 1600, IMG_QUALITY = 0.82;
const IMG_MIN_W = 40;
const GIF_KEEP_MAX = 512 * 1024;   // bu boyuta kadar GIF'e dokunulmaz (animasyon korunsun)

function readAsDataUrl(file, cb){
  const r = new FileReader();
  r.onerror = () => cb(null);
  r.onload = () => cb(String(r.result || ""));
  r.readAsDataURL(file);
}

/** Kaynağı çizilebilir hale getirir. createImageBitmap varsa EXIF yönü
 *  uygulanır; yoksa <img> yoluna düşülür (o yolda yan yatmış fotoğraf riski var). */
function loadDrawable(file, cb){
  if (window.createImageBitmap){
    let p = null;
    try { p = createImageBitmap(file, { imageOrientation: "from-image" }); } catch(e){ p = null; }
    if (p && p.then){ p.then(bmp => cb(bmp), () => viaImg()); return; }
  }
  viaImg();
  function viaImg(){
    readAsDataUrl(file, url => {
      if (!url) return cb(null);
      const img = new Image();
      img.onload = () => cb(img);
      img.onerror = () => cb(null);
      img.src = url;
    });
  }
}

function hasAlpha(ctx, w, h){
  try {
    const d = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
    return false;
  } catch(e){ return true; }   // okuyamıyorsak güvenli taraf: PNG olarak sakla
}

/** Kodlama politikası: saydam PNG PNG kalır, küçük GIF olduğu gibi saklanır
 *  (animasyon), gerisi JPEG. Eskiden her şey beyaz zeminli JPEG'e çevriliyordu;
 *  bu saydamlığı ve animasyonu öldürüyordu. */
function processImage(file, cb){
  const type = String(file.type || "").toLowerCase();

  if (type === "image/gif"){
    if (file.size <= GIF_KEEP_MAX){
      readAsDataUrl(file, url => cb(safeImgSrc(url) ? { url, note: t("imgGifKept", { n: formatBytes(file.size) }) } : null));
      return;
    }
    // Çok büyük: ilk kare düzleştirilir, kullanıcıya söylenir.
  }

  loadDrawable(file, src => {
    if (!src){ readAsDataUrl(file, url => cb(safeImgSrc(url) ? { url } : null)); return; }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    if (!w || !h) return cb(null);
    const scale = Math.min(1, IMG_MAX / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    let out = null, note = null;
    try {
      const c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      const g = c.getContext("2d");
      g.drawImage(src, 0, 0, cw, ch);
      const keepPng = type === "image/png" && hasAlpha(g, cw, ch);
      if (keepPng){
        out = c.toDataURL("image/png");
      } else {
        const c2 = document.createElement("canvas");
        c2.width = cw; c2.height = ch;
        const g2 = c2.getContext("2d");
        g2.fillStyle = "#ffffff"; g2.fillRect(0, 0, cw, ch);   // JPEG saydamlık taşımaz
        g2.drawImage(src, 0, 0, cw, ch);
        out = c2.toDataURL("image/jpeg", IMG_QUALITY);
        if (type === "image/gif") note = t("imgGifFlattened");
      }
    } catch(e){ out = null; }
    if (src.close) { try { src.close(); } catch(e){} }
    if (!out || !safeImgSrc(out)) return cb(null);
    cb({ url: out, width: cw, note });
  });
}

function insertImageFile(file, opts){
  if (!file || !/^image\//.test(file.type || "")) return;
  /* Eşik artık GERÇEK kotaya göre. localStorage'ta ~5 MB'ın %95'i resimleri
     erkenden kilitliyordu; IndexedDB'de o duvar yok ve kilit de olmamalı. */
  if (storagePercent() >= 95){ toast(t("imgTooBig"), null, 10000); return; }
  processImage(file, res => {
    if (!res || !res.url){ toast(t("imgFailed")); return; }
    const ed = editorEl(); if (!ed || !requireBody()) return;
    withUndo(() => {
      const img = document.createElement("img");
      img.src = res.url;
      img.alt = "";
      insertNodeAtCaret(img);
      // Doğal genişlik yüklenince sınırlanmış başlangıç genişliği yazılır.
      const applyWidth = () => {
        const nat = img.naturalWidth || res.width || 0;
        if (nat) img.setAttribute("width", String(Math.min(nat, IMG_MAX)));
        lastHtml = packImages(ed.innerHTML);
        onEditorChanged();
      };
      if (img.complete && img.naturalWidth) applyWidth(); else img.onload = applyWidth;
      onEditorChanged();
    });
    renderStorageMeter();
    toast(res.note || t("imgAdded", { n: formatBytes(Math.round(res.url.length * 0.75)) }));
    if (opts && opts.note) toast(opts.note, null, 7000);
  });
}

function insertNodeAtCaret(node){
  const ed = editorEl(); if (!ed) return;
  const sel = window.getSelection();
  if (sel && sel.rangeCount && ed.contains(sel.getRangeAt(0).startContainer)){
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(node);
    range.setStartAfter(node); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  } else {
    // Seçim tuvalin dışındaysa düğüm etkin kutunun sonuna eklenir; tuvale
    // doğrudan eklemek onu hiçbir kutuya ait olmayan bir öksüz yapardı.
    const body = requireBody();
    if (body) body.appendChild(node);
  }
}

/** Geniş tablolar sayfayı taşırmasın: her tablo kendi kaydırma kabına alınır.
 *  Kap süzgeçte kalıcı değil, yalnızca görüntüleme için eklenir. */
function wrapWideTables(root){
  const tables = root.querySelectorAll("table");
  for (let i = 0; i < tables.length; i++){
    const tb = tables[i];
    if (tb.parentNode && tb.parentNode.classList && tb.parentNode.classList.contains("tbl-wrap")) continue;
    const w = document.createElement("div");
    w.className = "tbl-wrap";
    tb.parentNode.insertBefore(w, tb);
    w.appendChild(tb);
  }
}

function clipboardImageFiles(dt){
  const out = [];
  const items = dt.items || [];
  for (let i = 0; i < items.length; i++){
    if (items[i].kind === "file" && /^image\//.test(items[i].type || "")){
      const f = items[i].getAsFile();
      if (f) out.push(f);
    }
  }
  if (!out.length && dt.files){
    for (let i = 0; i < dt.files.length; i++){
      if (/^image\//.test(dt.files[i].type || "")) out.push(dt.files[i]);
    }
  }
  return out;
}
function countImgs(html){
  try { return scratchDoc(html).body.querySelectorAll("img").length; } catch(e){ return 0; }
}

/* Karar ağacı — eski sürüm panoda resim görünce hemen dönüyor ve Word'ün
   zengin metnini tamamen düşürüyordu ("sadece resim geliyor" şikâyeti):
     1. text/html varsa süz; içinde metin YA DA kullanılabilir resim varsa onu kullan
     2. süzgeçte resim kaybolduysa ve panoda tam bir resim dosyası varsa,
        onu metnin SONUNA ekle (özgün konum korunamaz, bunu söylüyoruz)
     3. kullanılabilir HTML yoksa pano resmini kullan
     4. o da yoksa tarayıcının düz metin davranışı                                */
function onEditorPaste(e){
  const dt = e.clipboardData || window.clipboardData;
  if (!dt) return;
  const files = clipboardImageFiles(dt);

  let html = "";
  try { html = dt.getData("text/html") || ""; } catch(err){ html = ""; }

  if (html){
    // Önce sunum biçimi anlamsal etikete çevrilir, SONRA süzgeç çalışır.
    const normalized = sanitizeHtml(presentationalToSemantic(html));
    const srcImgs = countImgs(html), keptImgs = countImgs(normalized);
    const hasText = noteText(normalized).length > 0;
    if (hasText || keptImgs > 0){
      e.preventDefault();
      closeBurst();
      withUndo(() => {
        try { document.execCommand("insertHTML", false, normalized); } catch(err){}
        const ed = editorEl(); if (ed) wrapWideTables(ed);
        onEditorChanged();
      });
      const lost = Math.max(0, srcImgs - keptImgs);
      if (lost > 0 && keptImgs === 0 && files.length === 1){
        // Word resimleri file:/// ile bağlar; süzgeç reddeder. En az birini kurtar.
        insertImageFile(files[0], { note: t("imgAppended") });
      } else if (lost > 0){
        toast(t("imgLost", { n: lost }), null, 7000);   // sessiz kayıp yok
      }
      return;
    }
  }
  if (files.length){ e.preventDefault(); insertImageFile(files[0]); return; }
  // Düz metin: tarayıcının varsayılan davranışı yeterli, ama seri kapansın.
  closeBurst();
}

function onEditorClick(e){
  // Resim, kendisini saran bir görev bağlantısından önce gelir: resme tıklamak
  // resmi seçmelidir, sayfayı terk etmemeli.
  if (e.target && e.target.tagName === "IMG"){ selectImage(e.target); return; }
  const link = closestInEditor(e.target, n => n.hasAttribute && n.hasAttribute("data-task"));
  if (link){
    e.preventDefault();
    const id = link.getAttribute("data-task");
    if (getTask(id)){ ui.view = "tasks"; buildShell(); setTimeout(() => openPanel(id, null), 0); }
    else { link.classList.add("dead"); toast(t("taskGone")); }
    return;
  }
  const li = closestInEditor(e.target, n => n.tagName === "LI" && n.classList.contains("todo"));
  if (li){
    // İşaretleyici madde kutusunun solunda çizildiği için tıklama oraya düşer.
    const r = li.getBoundingClientRect();
    if (e.clientX < r.left){
      e.preventDefault();
      withUndo(() => { li.classList.toggle("done"); onEditorChanged(); });
    }
  }
}

/** Vurgu bir kip değil, kalemle işaretlemedir: paragraf sonunda bitmeli.
 *  Aksi halde Enter'dan sonra yazılan her şey vurgulu çıkar ve kullanıcının
 *  onu kapatması için metin seçmesi gerekirdi. Kalın/italik taşınmaya devam
 *  eder — orada Ctrl+B imleçte çalıştığı için kaçış yolu var. */
function stripCaretHighlight(){
  const ed = editorEl(); if (!ed) return;
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  const span = closestInEditor(sel.getRangeAt(0).startContainer,
    n => n.tagName === "SPAN" &&
      (/(^|\s)hl-[ygbp](\s|$)/.test(n.className || "") ||
       /background-color/i.test(n.getAttribute("style") || "")));
  if (!span) return;
  if (String(span.textContent || "").trim() !== "") return;   // yalnızca boş vurgu kabuğu
  const parent = span.parentNode; if (!parent) return;
  while (span.firstChild) parent.insertBefore(span.firstChild, span);
  parent.removeChild(span);
  const r = document.createRange();
  r.selectNodeContents(parent); r.collapse(false);
  sel.removeAllRanges(); sel.addRange(r);
  lastHtml = packImages(ed.innerHTML);   // kendi başına bir geri alma adımı değil
}

function onEditorKeydown(e){
  if ((e.ctrlKey || e.metaKey) && !e.altKey){
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey){ e.preventDefault(); doUndo(); return; }
    if ((k === "z" && e.shiftKey) || k === "y"){ e.preventDefault(); doRedo(); return; }
  }
  if (e.key === "Escape"){
    if (resizing){ e.preventDefault(); e.stopPropagation(); cancelResize(); return; }
    e.stopPropagation(); e.target.blur(); return;
  }
  // Alt + ok: kutuyu klavyeyle taşı. Fare kullanamayan biri için tek yol bu.
  if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.slice(0, 5) === "Arrow"){
    const step = e.shiftKey ? 4 : 16;
    const d = { ArrowUp:[0,-step], ArrowDown:[0,step], ArrowLeft:[-step,0], ArrowRight:[step,0] }[e.key];
    if (d && nudgeBox(d[0], d[1])){ e.preventDefault(); return; }
  }
  // Enter, kes ve yapıştır açık yazma serisini kapatır: ayrı geri alma adımları olsun.
  if (e.key === "Enter"){ closeBurst(); setTimeout(stripCaretHighlight, 0); return; }
  if (e.key === "Tab"){
    if (currentCell()){
      e.preventDefault();
      if (!tabInTable(e.shiftKey)) { /* tablo dışına çıkmaya çalışma */ }
      return;
    }
    // Liste içinde girinti; dışarıda odak sırası bozulmasın diye dokunulmaz.
    if (currentLi()){
      e.preventDefault();
      try { document.execCommand(e.shiftKey ? "outdent" : "indent"); } catch(err){}
      onEditorChanged();
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey){
    const k = e.key.toLowerCase();
    if (k === "b" || k === "i" || k === "u"){
      // Tarayıcı biçimi kendi uyguluyor; biz yalnızca ayrı bir geri alma adımı
      // açılsın diye seriyi kapatıyoruz. Kayıt `input` olayından geliyor.
      closeBurst();
    }
  }
}

/* ------------------------------------------- resim seçimi, tutamak, boyut */
let imgPopover = null, handleBox = null, resizing = null;

/** Üst sınır işlenmiş doğal genişliktir — resim zaten en fazla IMG_MAX'e
 *  indirildiği için ötesi anlamsız büyütme ve bulanıklık olurdu. */
function maxImgWidth(img){ return Math.min(img.naturalWidth || IMG_MAX, IMG_MAX); }
function currentImgWidth(img){ return Math.round(img.getBoundingClientRect().width); }

function setImgWidth(img, w){
  img.style.width = "";
  img.setAttribute("width", String(Math.max(IMG_MIN_W, Math.min(maxImgWidth(img), Math.round(w)))));
  // Hazır boyut sınıfları serbest genişlikle çakışmasın.
  img.className = String(img.className || "").replace(/\bimg-(sm|md|lg)\b/g, "").replace(/\s+/g, " ").trim();
}

function closeImgPopover(){
  if (imgPopover && imgPopover.parentNode) imgPopover.parentNode.removeChild(imgPopover);
  imgPopover = null;
  hideHandles();
  const ed = editorEl();
  if (ed){ const s = ed.querySelectorAll("img.sel"); for (let i = 0; i < s.length; i++) s[i].classList.remove("sel"); }
}

function positionHandles(){
  if (!handleBox || !handleBox.__img || !handleBox.__img.isConnected) return;
  const r = handleBox.__img.getBoundingClientRect();
  handleBox.style.left = r.left + "px"; handleBox.style.top = r.top + "px";
  handleBox.style.width = r.width + "px"; handleBox.style.height = r.height + "px";
  if (imgPopover) {
    imgPopover.style.top = Math.max(8, r.top - 46) + "px";
    imgPopover.style.left = Math.max(8, r.left) + "px";
  }
}
function hideHandles(){
  if (!handleBox) return;
  window.removeEventListener("scroll", positionHandles, true);
  window.removeEventListener("resize", positionHandles);
  if (handleBox.parentNode) handleBox.parentNode.removeChild(handleBox);
  handleBox = null;
}
function showHandles(img){
  hideHandles();
  handleBox = el("div", { class:"img-handles" },
    ["nw","ne","sw","se"].map(p => el("i", { class:"h h-" + p, dataset:{ pos:p } }))
  );
  handleBox.__img = img;
  document.body.appendChild(handleBox);
  positionHandles();
  handleBox.addEventListener("pointerdown", onHandleDown);
  window.addEventListener("scroll", positionHandles, true);
  window.addEventListener("resize", positionHandles);
}

function onHandleDown(e){
  const h = e.target && e.target.classList && e.target.classList.contains("h") ? e.target : null;
  if (!h || !handleBox) return;
  e.preventDefault();
  const img = handleBox.__img;
  const ed = editorEl(); if (!ed) return;
  closeBurst();
  resizing = {
    img, dir: h.dataset.pos, startX: e.clientX,
    startW: currentImgWidth(img),
    prevHtml: packImages(ed.innerHTML),
    prevAttr: img.getAttribute("width"),
    prevClass: img.className,
    handle: h, pointerId: e.pointerId
  };
  try { h.setPointerCapture(e.pointerId); } catch(err){}
  h.addEventListener("pointermove", onHandleMove);
  h.addEventListener("pointerup", onHandleUp);
  h.addEventListener("pointercancel", cancelResize);
}
function onHandleMove(e){
  if (!resizing) return;
  const dx = e.clientX - resizing.startX;
  const sign = /e$/.test(resizing.dir) ? 1 : -1;
  const w = Math.max(IMG_MIN_W, Math.min(maxImgWidth(resizing.img), Math.round(resizing.startW + sign * dx)));
  resizing.img.style.width = w + "px";      // sürükleme boyunca YALNIZCA önizleme
  positionHandles();
}
function endResizeListeners(){
  if (!resizing) return;
  const h = resizing.handle;
  h.removeEventListener("pointermove", onHandleMove);
  h.removeEventListener("pointerup", onHandleUp);
  h.removeEventListener("pointercancel", cancelResize);
  try { h.releasePointerCapture(resizing.pointerId); } catch(err){}
}
function onHandleUp(){
  if (!resizing) return;
  const { img, prevHtml } = resizing;
  const w = currentImgWidth(img);
  endResizeListeners();
  resizing = null;
  // Bırakınca TEK model güncellemesi ve TEK geri alma adımı.
  pushUndo(prevHtml);
  setImgWidth(img, w);
  const ed = editorEl();
  if (ed) lastHtml = packImages(ed.innerHTML);
  onEditorChanged();
  positionHandles();
}
function cancelResize(){
  if (!resizing) return;
  // Önizleme yalnızca satır içi stille yapıldığı için geri almak onu silmek kadar basit.
  resizing.img.style.width = "";
  endResizeListeners();
  resizing = null;
  positionHandles();
}

function selectImage(img){
  closeImgPopover();
  img.classList.add("sel");
  showHandles(img);
  const preset = (frac) => () => {
    const ed = editorEl(); if (!ed) return;
    withUndo(() => { setImgWidth(img, maxImgWidth(img) * frac); onEditorChanged(); });
    positionHandles();
  };
  imgPopover = el("div", { class:"toast img-pop", style:"position:fixed;z-index:71;padding:6px;gap:4px" },
    el("button", { class:"btn", onclick: preset(0.25) }, t("imgSmall")),
    el("button", { class:"btn", onclick: preset(0.55) }, t("imgMedium")),
    el("button", { class:"btn", onclick: preset(1) }, t("imgLarge")),
    el("button", { class:"btn btn-danger", onclick(){
      const ed = editorEl(); if (!ed) return;
      withUndo(() => {
        if (img.parentNode) img.parentNode.removeChild(img);
        onEditorChanged();
      });
      closeImgPopover(); renderStorageMeter();
    }}, icon("trash"))
  );
  document.body.appendChild(imgPopover);
  positionHandles();
}

/** Çift tıklama işlenmiş doğal genişliğe döndürür — yüklemeden önceki özgün
 *  boyuta değil; o veri saklanmıyor. */
function resetImgSize(img){
  withUndo(() => { setImgWidth(img, maxImgWidth(img)); onEditorChanged(); });
  positionHandles();
  toast(t("imgResetSize"));
}

document.addEventListener("mousedown", e => {
  if (resizing) return;
  const inPop = imgPopover && imgPopover.contains(e.target);
  const inHandles = handleBox && handleBox.contains(e.target);
  if (imgPopover && !inPop && !inHandles && !(e.target && e.target.tagName === "IMG")) closeImgPopover();
});

/* ----------------------------------------------------- nottan görev yapma */
function taskifySelection(){
  if (!focusActive()){ toast(t("selectFirst")); return; }
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed){ toast(t("selectFirst")); return; }
  const text = String(sel.toString()).replace(/\s+/g, " ").trim();
  if (!text){ toast(t("selectFirst")); return; }

  const range = sel.getRangeAt(0).cloneRange();
  const nb = currentNotebook(), page = currentPage();
  const task = addTask(text.slice(0, 300));
  task.sourceNoteId = (nb && page) ? { notebookId: nb.id, pageId: page.id } : null;
  stamp(task); scheduleSave();

  const span = document.createElement("span");
  span.className = "note-link";
  span.setAttribute("data-task", task.id);
  try { range.surroundContents(span); }
  catch(e){ span.appendChild(range.extractContents()); range.insertNode(span); }
  sel.removeAllRanges();
  onEditorChanged();
  toast(t("taskFromNote") + " " + text.slice(0, 48));
}

/** Görev panelinden kaynak nota gitmek için. */
function openSourceNote(task){
  const link = task && task.sourceNoteId;
  if (!link) return;
  const page = getPage(link.notebookId, link.pageId);
  if (!page){ toast(t("noteGone")); return; }
  ui.view = "notes"; ui.nbId = link.notebookId; ui.pageId = link.pageId;
  closePanel();
  buildShell();
}

/* --------------------------------------------------------- tema ve dil */
function themeIcon(){ return { auto:"auto", light:"sun", dark:"moon" }[state.settings.theme]; }
function themeTitle(){ return { auto:t("themeAuto"), light:t("themeLight"), dark:t("themeDark") }[state.settings.theme]; }
function applyTheme(){
  const th = state.settings.theme;
  if (th === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", th);
}
function cycleTheme(){
  state.settings.theme = { auto:"light", light:"dark", dark:"auto" }[state.settings.theme];
  applyTheme(); scheduleSave();
  // Yalnızca düğmeyi tazele — kabuğu baştan kurmak açık paneli kapatırdı.
  const b = document.getElementById("themeBtn");
  if (b){
    b.textContent = "";
    b.append(icon(themeIcon()));
    b.title = themeTitle();
    b.setAttribute("aria-label", themeTitle());
  }
}
function toggleLang(){
  flushEditor();
  state.settings.lang = state.settings.lang === "tr" ? "en" : "tr";
  document.documentElement.lang = state.settings.lang;
  scheduleSave();
  const wasOpen = openTaskId;
  buildShell();
  if (wasOpen && getTask(wasOpen)) openPanel(wasOpen, null);
}

/* -------------------------------------------------------- içe / dışa aktarma */
function download(filename, text, mime){
  const blob = new Blob([text], { type: mime || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href:url, download:filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson(){
  flushEditor();
  const payload = {
    version: SCHEMA_VERSION, exportedAt: new Date().toISOString(),
    settings: state.settings, tasks: state.tasks, notebooks: notes.notebooks
  };
  download("taskhub-" + ymd(new Date()) + ".json", JSON.stringify(payload, null, 2), "application/json");
  state.settings.lastBackupAt = new Date().toISOString();
  ui.nagHidden = true;
  scheduleSave(); renderBanners();
  toast(t("exported"));
}

function tasksToCsv(tasks, lang){
  const dict = I18N[lang] || I18N.tr;
  const rows = [dict.csvHead.map(h => csvEscape(h)).join(CSV_DELIM)];
  for (const task of tasks){
    rows.push([
      task.title,
      task.notes,
      task.dueDate || "",
      dict[task.priority] || task.priority,
      task.done ? dict.yes : dict.no,
      task.tags.join(", "),
      // Ayırıcıyla aynı karakter kullanılmaz.
      task.subtasks.map(s => (s.done ? "[x] " : "[ ] ") + s.title).join(" | "),
      task.createdAt || ""
    ].map(v => csvEscape(v)).join(CSV_DELIM));
  }
  return rows.join("\r\n");
}

function exportCsv(){
  // BOM: Excel'in UTF-8 Türkçe karakterleri doğru okuması için.
  download("taskhub-" + ymd(new Date()) + ".csv", "\uFEFF" + tasksToCsv(sortTasks(state.tasks), state.settings.lang), "text/csv;charset=utf-8");
  toast(t("exported"));
}

/* Notları tek başına yeten bir HTML dosyasına döker. Zengin metnin kendi
   biçimine kilitlenmesine karşı çıkış kapısı: dosya herhangi bir tarayıcıda
   açılır, okunur ve yazdırılır. */
function notesToHtml(){
  const esc = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const out = [
    '<!doctype html><html lang="' + state.settings.lang + '"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>" + esc(t("notesHtmlTitle")) + "</title><style>",
    "body{max-width:820px;margin:40px auto;padding:0 20px;font:16px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#16181d}",
    "h1.nb{margin:44px 0 4px;font-size:26px;border-bottom:2px solid #5b5bd6;padding-bottom:6px}",
    "h2.pg{margin:30px 0 2px;font-size:20px}",
    ".meta{color:#6b7280;font-size:12.5px;margin:0 0 12px}",
    "img{max-width:100%;height:auto;border-radius:8px}",
    "img.img-sm{max-width:220px}img.img-md{max-width:460px}",
    ".hl-y{background:#fde68a}.hl-g{background:#bbf7d0}.hl-b{background:#bfdbfe}.hl-p{background:#f5d0fe}",
    "ul li.todo{list-style:none}ul li.todo::before{content:'☐ ';margin-left:-1.2em}",
    "ul li.todo.done::before{content:'☑ '}ul li.todo.done{color:#8b93a3;text-decoration:line-through}",
    "blockquote{margin:0 0 10px;padding-left:14px;border-left:3px solid #c8cedb;color:#666e7d}",
    "code{background:#f1f3f5;border-radius:4px;padding:1px 5px}",
    "pre{background:#f1f3f5;border-radius:8px;padding:11px 13px;overflow-x:auto}",
    "hr{border:0;border-top:1px solid #dfe3e9;margin:18px 0}",
    ".box{margin:0 0 16px;padding-left:14px;border-left:2px solid #e6e8f2}",
    ".box > *:last-child{margin-bottom:0}",
    "table{border-collapse:collapse;margin:0 0 12px;font-size:.95em}",
    "th,td{border:1px solid #c8cedb;padding:6px 9px;vertical-align:top}",
    "th{background:#f1f3f5;text-align:left}",
    ".fs-xs{font-size:.78em}.fs-s{font-size:.9em}.fs-l{font-size:1.3em}.fs-xl{font-size:1.7em}",
    "@media print{body{margin:0}h1.nb{page-break-before:always}}",
    "</style></head><body>",
    "<p class=\"meta\">" + esc(t("notesHtmlTitle")) + " · " + esc(formatStamp(new Date().toISOString())) + "</p>"
  ];
  for (const nb of notes.notebooks){
    out.push('<h1 class="nb">' + esc(nb.name) + "</h1>");
    if (!nb.pages.length) out.push('<p class="meta">' + esc(t("noPages")) + "</p>");
    for (const page of nb.pages){
      out.push('<h2 class="pg">' + esc(pageTitleOf(page)) + "</h2>");
      out.push('<p class="meta">' + esc(formatStamp(page.updatedAt)) + "</p>");
      // Tuvaldeki serbest konum kâğıda taşınmaz; kutular okuma sırasına
      // (yukarıdan aşağı, soldan sağa) dizilip ayrı bloklar olarak yazılır.
      const boxes = boxesInReadingOrder(page);
      if (!boxes.length) out.push('<p class="meta">' + esc(t("emptyPagePreview")) + "</p>");
      for (const box of boxes) out.push('<div class="box">' + sanitizeHtml(box.html) + "</div>");
    }
  }
  out.push("</body></html>");
  return out.join("\n");
}

function exportNotesHtml(){
  flushEditor();
  download("taskhub-notlar-" + ymd(new Date()) + ".html", notesToHtml(), "text/html;charset=utf-8");
  toast(t("exportedNotes"));
}

function pickImport(){ document.getElementById("fileInput").click(); }

/** Defterleri iki kademede birleştirir: defter kabuğu için "yeni kazanır",
 *  sayfalar için mevcut mergeImport. Tek kademe olsaydı yeni bir defter
 *  sürümü, yalnızca eskisinde bulunan sayfaları düşürürdü. */
function mergeNotebooks(current, incoming){
  const out = current.slice();
  const idx = new Map();
  out.forEach((n, i) => idx.set(n.id, i));
  let added = 0, updated = 0, kept = 0, pAdded = 0, pUpdated = 0, pKept = 0;
  for (const inc of incoming){
    if (!idx.has(inc.id)){
      idx.set(inc.id, out.length); out.push(inc);
      added++; pAdded += inc.pages.length;
      continue;
    }
    const i = idx.get(inc.id), cur = out[i];
    const pr = mergeImport(cur.pages, inc.pages);
    const incNewer = ts(inc.updatedAt) > ts(cur.updatedAt);
    out[i] = {
      id: cur.id,
      name: incNewer ? inc.name : cur.name,
      color: incNewer ? inc.color : cur.color,
      createdAt: cur.createdAt,
      updatedAt: incNewer ? inc.updatedAt : cur.updatedAt,
      pages: pr.tasks
    };
    if (incNewer) updated++; else kept++;
    pAdded += pr.added; pUpdated += pr.updated; pKept += pr.kept;
  }
  return { notebooks: out, added, updated, kept, pAdded, pUpdated, pKept };
}

let pendingImport = null;
function onFileChosen(e){
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try { parsed = JSON.parse(String(reader.result)); } catch(err){ toast(t("importBad")); return; }
    const rawTasks = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.tasks) ? parsed.tasks : []);
    const rawNbs = (parsed && Array.isArray(parsed.notebooks)) ? parsed.notebooks : [];
    const tasks = rawTasks.map(normalizeTask).filter(Boolean);
    const notebooks = rawNbs.map(normalizeNotebook).filter(Boolean);
    if (!tasks.length && !notebooks.length){ toast(t("importBad")); return; }
    pendingImport = { tasks, notebooks };
    const pageCount = notebooks.reduce((n, nb) => n + nb.pages.length, 0);
    document.getElementById("importText").textContent = t("importCounts", { t: tasks.length, p: pageCount });
    openImportDlg();
  };
  reader.onerror = () => toast(t("importBad"));
  reader.readAsText(file);
}

/* <dialog> desteklenmeyen tarayıcılarda öğe normal blok gibi akar; o yüzden
   açma/kapama tek yerden geçirilir ve yedek yol CSS ile ortalanır. */
function openImportDlg(){
  const dlg = document.getElementById("importDlg");
  if (typeof dlg.showModal === "function") dlg.showModal();
  else { dlg.setAttribute("open", ""); dlg.classList.add("dlg-fallback"); }
}
function closeImportDlg(){
  const dlg = document.getElementById("importDlg");
  if (typeof dlg.close === "function") dlg.close();
  else { dlg.removeAttribute("open"); dlg.classList.remove("dlg-fallback"); }
}
const importDlgOpen = () => !!document.getElementById("importDlg").hasAttribute("open");

function buildImportDialog(){
  return el("dialog", { id:"importDlg", "aria-labelledby":"importTitle" },
    el("div", { class:"dlg-body" },
      el("h2", { id:"importTitle", text: t("importTitle") }),
      el("p", { id:"importText" })
    ),
    el("div", { class:"dlg-foot" },
      el("button", { class:"btn", onclick(){ closeImportDlg(); pendingImport = null; } }, t("cancel")),
      el("button", { class:"btn", onclick(){
        const n = pendingImport.tasks.length;
        state.tasks = pendingImport.tasks;
        notes.notebooks = pendingImport.notebooks;
        pendingImport = null;
        closeImportDlg(); closePanel();
        ui.nbId = null; ui.pageId = null; editorPageId = null; dirtyEditor = false;
        scheduleSave(); scheduleSaveNotes();
        mountView();
        toast(t("importReplaced", { n }));
      }}, t("replace")),
      el("button", { class:"btn btn-primary", onclick(){
        const r = mergeImport(state.tasks, pendingImport.tasks);
        const nr = mergeNotebooks(notes.notebooks, pendingImport.notebooks);
        pendingImport = null;
        state.tasks = r.tasks;
        notes.notebooks = nr.notebooks;
        closeImportDlg();
        if (openTaskId && !getTask(openTaskId)) closePanel();
        editorPageId = null; dirtyEditor = false;
        scheduleSave(); scheduleSaveNotes();
        mountView();
        toast(t("importDone", { a: r.added + nr.added + nr.pAdded, u: r.updated + nr.updated + nr.pUpdated, k: r.kept + nr.kept + nr.pKept }));
      }}, t("merge"))
    )
  );
}

/* ------------------------------------------------------------- kısayollar */
function isTyping(e){
  const n = e.target;
  return n && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT" || n.isContentEditable);
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape"){
    if (importDlgOpen()) return;
    if (typeof paletteOpen === "function" && paletteOpen()) return;   // palet kendi kapanır
    if (ui.view !== "notes" && clearSelection()){ e.preventDefault(); return; }
    if (menuEl){ e.preventDefault(); closeMenu(); return; }
    if (imgPopover){ e.preventDefault(); closeImgPopover(); return; }
    if (openTaskId) { e.preventDefault(); closePanel(); }
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e)) return;
  if (e.key === "/"){
    e.preventDefault(); // Firefox'un hızlı bulma çubuğunu engelle
    const q = document.getElementById("q"); if (q){ q.focus(); q.select(); }
  } else if (e.key === "n" || e.key === "N"){
    e.preventDefault();
    // Kısayol bağlama duyarlı: görevlerde yeni görev, notlarda yeni sayfa.
    if (ui.view === "notes"){
      if (currentNotebook() && addPage(ui.nbId)){ renderNotesView(); focusPageTitle(); }
    } else {
      const q = document.getElementById("quick"); if (q) q.focus();
    }
  }
});

/* --------------------------------------------------- gün değişimi takibi */
function checkRollover(){
  const now = ymd(new Date());
  if (now !== today){ today = now; render(); }
}
function scheduleMidnight(){
  const n = new Date();
  const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5);
  setTimeout(() => { checkRollover(); scheduleMidnight(); }, Math.max(1000, next - n));
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkRollover(); });
window.addEventListener("focus", checkRollover);

/* ------------------------------------------------------------------ çizim */
function render(){
  renderBanners();
  if (ui.view === "notes") renderNotesView();
  else { renderSidebar(); renderList(); }
}

/* =============================== TESTLER ================================ */
function runTests(){
  const results = [];
  const ok = (name, cond) => results.push({ name, pass: !!cond });
  const eq = (name, a, b) => results.push({ name: name + "  →  " + JSON.stringify(a), pass: JSON.stringify(a) === JSON.stringify(b), want: b });

  // --- foldTr: arama için harf katlama ---
  eq('foldTr("İstanbul")', foldTr("İstanbul"), "istanbul");
  eq('foldTr("ISTANBUL")', foldTr("ISTANBUL"), "istanbul");
  eq('foldTr("ıspanak")', foldTr("ıspanak"), "ispanak");
  eq('foldTr("Sıkça Ödeme")', foldTr("Sıkça Ödeme"), "sikca odeme");
  eq('foldTr("ÇĞİÖŞÜ")', foldTr("ÇĞİÖŞÜ"), "cgiosu");
  eq('foldTr("çğıöşü")', foldTr("çğıöşü"), "cgiosu");
  ok('"istanbul" araması "İstanbul"u bulur', foldTr("İstanbul").indexOf(foldTr("istanbul")) !== -1);
  ok('"sık" araması "Sıkça"yı bulur', foldTr("Sıkça").indexOf(foldTr("sık")) !== -1);
  eq("foldTr(null)", foldTr(null), "");

  // --- tarih aritmetiği (yerel saat) ---
  eq('parseYmd("2026-03-01") yerel gün', parseYmd("2026-03-01").getDate(), 1);
  eq('parseYmd("2026-03-01") yerel ay', parseYmd("2026-03-01").getMonth(), 2);
  eq("parseYmd geçersiz", parseYmd("olmaz"), null);
  eq("daysBetween aynı gün", daysBetween("2026-05-10","2026-05-10"), 0);
  eq("daysBetween ay atlama", daysBetween("2026-01-31","2026-02-01"), 1);
  eq("daysBetween geriye", daysBetween("2026-05-10","2026-05-03"), -7);
  eq("daysBetween DST (TR yok ama genel)", daysBetween("2026-03-28","2026-03-30"), 2);

  // --- bucketOf ---
  const T = "2026-05-10";
  const mk = (o) => Object.assign({ done:false, dueDate:null }, o);
  eq("bucket: tamamlanan her şeyden önce gelir", bucketOf(mk({ done:true, dueDate:"2020-01-01" }), T), "completed");
  eq("bucket: tarihsiz", bucketOf(mk({}), T), "nodate");
  eq("bucket: dün → gecikmiş", bucketOf(mk({ dueDate:"2026-05-09" }), T), "overdue");
  eq("bucket: bugün", bucketOf(mk({ dueDate:"2026-05-10" }), T), "today");
  eq("bucket: yarın", bucketOf(mk({ dueDate:"2026-05-11" }), T), "tomorrow");
  eq("bucket: +2 gün → 7 gün grubu", bucketOf(mk({ dueDate:"2026-05-12" }), T), "week");
  eq("bucket: +7 gün → 7 gün grubu (sınır)", bucketOf(mk({ dueDate:"2026-05-17" }), T), "week");
  eq("bucket: +8 gün → sonra (sınır)", bucketOf(mk({ dueDate:"2026-05-18" }), T), "later");
  eq("bucket: bozuk tarih → tarihsiz", bucketOf(mk({ dueDate:"14/02/2026" }), T), "nodate");

  // --- csvEscape ---
  eq("csv: düz metin", csvEscape("merhaba"), "merhaba");
  eq("csv: ayırıcı içeren", csvEscape("a;b"), '"a;b"');
  eq("csv: tırnak içeren", csvEscape('de"me'), '"de""me"');
  eq("csv: satır sonu içeren", csvEscape("a\nb"), '"a\nb"');
  eq("csv: virgül kaçışsız (ayırıcı ; olduğu için)", csvEscape("a,b"), "a,b");
  eq("csv: null", csvEscape(null), "");
  ok("csv başlığı ayırıcıyla bölünmüş", tasksToCsv([], "tr").split(CSV_DELIM).length === I18N.tr.csvHead.length);

  // --- mergeImport: yeni olan kazanır ---
  const cur = [
    { id:"a", title:"eski A", updatedAt:"2026-01-01T00:00:00.000Z" },
    { id:"b", title:"B",      updatedAt:"2026-06-01T00:00:00.000Z" }
  ];
  const inc = [
    { id:"a", title:"yeni A", updatedAt:"2026-02-01T00:00:00.000Z" },
    { id:"b", title:"eski B", updatedAt:"2026-03-01T00:00:00.000Z" },
    { id:"c", title:"C",      updatedAt:"2026-04-01T00:00:00.000Z" }
  ];
  const m = mergeImport(cur, inc);
  eq("merge: toplam görev", m.tasks.length, 3);
  eq("merge: gelen yeniyse üzerine yazar", m.tasks.find(x => x.id === "a").title, "yeni A");
  eq("merge: gelen eskiyse korunur", m.tasks.find(x => x.id === "b").title, "B");
  eq("merge: yeni id eklenir", m.tasks.find(x => x.id === "c").title, "C");
  eq("merge: sayaçlar", [m.added, m.updated, m.kept], [1,1,1]);
  eq("merge: girdi dizisi değişmedi", cur.length, 2);
  eq("merge: updatedAt yoksa gelen kazanmaz", mergeImport([{id:"x",title:"var",updatedAt:"2026-01-01T00:00:00.000Z"}], [{id:"x",title:"yok"}]).tasks[0].title, "var");

  // --- sıralama ---
  const sorted = sortTasks([
    { id:"1", dueDate:null, priority:"high", createdAt:"2026-01-01T00:00:00Z" },
    { id:"2", dueDate:"2026-05-20", priority:"low", createdAt:"2026-01-01T00:00:00Z" },
    { id:"3", dueDate:"2026-05-10", priority:"low", createdAt:"2026-01-01T00:00:00Z" },
    { id:"4", dueDate:"2026-05-10", priority:"high", createdAt:"2026-01-01T00:00:00Z" }
  ]).map(x => x.id);
  eq("sıralama: tarih → öncelik, tarihsiz sonda", sorted, ["4","3","2","1"]);

  // --- normalizeTask savunması ---
  eq("normalize: geçersiz öncelik düzeltilir", normalizeTask({ title:"x", priority:"hyper" }).priority, "med");
  eq("normalize: geçersiz tarih atılır", normalizeTask({ title:"x", dueDate:"31-12-2026" }).dueDate, null);
  eq("normalize: etiket dizisi değilse boşalır", normalizeTask({ title:"x", tags:"iş" }).tags, []);
  eq("normalize: boş alt görevler atılır", normalizeTask({ title:"x", subtasks:[{title:"  "},{title:"gerçek"}] }).subtasks.length, 1);
  ok("normalize: çöp girdi null döner", normalizeTask(null) === null && normalizeTask("metin") === null);
  ok("normalize: tamamlanan görevde completedAt dolar", !!normalizeTask({ title:"x", done:true }).completedAt);

  // --- sanitizeHtml: özelliğin güvenlik çekirdeği ---
  const S = sanitizeHtml;
  ok("sanitize: <script> tamamen düşer", S('<p>a</p><script>alert(1)<\/script>').indexOf("script") === -1);
  ok("sanitize: script içindeki metin de gitmeli", S('<script>KOTU<\/script>').indexOf("KOTU") === -1);
  ok("sanitize: onerror niteliği düşer", S('<img src="data:image/png;base64,AAAA" onerror="alert(1)">').indexOf("onerror") === -1);
  ok("sanitize: onclick niteliği düşer", S('<p onclick="alert(1)">x</p>').indexOf("onclick") === -1);
  ok("sanitize: style niteliği düşer", S('<p style="position:fixed">x</p>').indexOf("style") === -1);
  ok("sanitize: javascript: href reddedilir", S('<a href="javascript:alert(1)">x</a>').indexOf("javascript") === -1);
  ok("sanitize: JaVaScRiPt: de reddedilir", S('<a href="JaVaScRiPt:alert(1)">x</a>').toLowerCase().indexOf("javascript") === -1);
  ok("sanitize: data:text/html href reddedilir", S('<a href="data:text/html,<b>x">y</a>').indexOf("data:text") === -1);
  ok("sanitize: https href korunur", S('<a href="https://ornek.com/a-b">x</a>').indexOf("https://ornek.com/a-b") !== -1);
  ok("sanitize: tiredeki URL bozulmaz", S('<a href="https://a.com/bir-iki-uc">x</a>').indexOf("bir-iki-uc") !== -1);
  ok("sanitize: dış bağlantıya rel eklenir", S('<a href="https://a.com">x</a>').indexOf("noopener") !== -1);
  ok("sanitize: data:image src korunur", S('<img src="data:image/png;base64,iVBORw0KGgo=">').indexOf("data:image/png") !== -1);
  ok("sanitize: data:text/html img reddedilir", S('<img src="data:text/html;base64,AAAA">').indexOf("<img") === -1);
  ok("sanitize: http kaynaklı img reddedilir", S('<img src="http://iz.surucu/x.png">').indexOf("<img") === -1);
  ok("sanitize: iframe düşer", S('<iframe src="https://a.com"></iframe>').indexOf("iframe") === -1);
  ok("sanitize: svg düşer", S('<svg><script>alert(1)<\/script></svg>').indexOf("svg") === -1);
  eq("sanitize: <div> korunur (satır sonları için)", S("<div>a</div>"), "<div>a</div>");
  ok("sanitize: <table> açılır ama metin kalır", S("<table><tr><td>hucre</td></tr></table>").indexOf("hucre") !== -1);
  ok("sanitize: <font> açılır, metin kalır", S('<font color="red">renk</font>').indexOf("renk") !== -1);
  eq("sanitize: iç içe biçim korunur", S("<b><i>x</i></b>"), "<b><i>x</i></b>");
  eq("sanitize: izinli class kalır", S('<span class="hl-y">x</span>'), '<span class="hl-y">x</span>');
  ok("sanitize: izinsiz class atılır", S('<span class="evil">x</span>').indexOf("evil") === -1);
  eq("sanitize: todo maddesi korunur", S('<li class="todo done">x</li>'), '<li class="todo done">x</li>');
  ok("sanitize: data-task korunur", S('<span class="note-link" data-task="abc-123">x</span>').indexOf('data-task="abc-123"') !== -1);
  ok("sanitize: bozuk data-task atılır", S('<span data-task="a b<c">x</span>').indexOf("data-task") === -1);
  eq("sanitize: boş girdi", S(""), "");
  eq("sanitize: null girdi", S(null), "");
  ok("sanitize: kapanmamış etiketle çökmez", typeof S("<b><i>acik") === "string");
  ok("sanitize: yorum düğümü düşer", S("<!-- gizli --><p>x</p>").indexOf("gizli") === -1);
  ok("sanitize: iki kez süzmek sonucu değiştirmez", S(S('<p><b>x</b></p>')) === S('<p><b>x</b></p>'));

  // --- noteText ---
  eq("noteText: etiketler soyulur", noteText("<p>bir <b>iki</b></p>"), "bir iki");
  eq("noteText: boşluklar tekilleşir", noteText("<p>a</p>\n\n<p>   b   </p>"), "a b");
  eq("noteText: bloklar yapışmaz", noteText("<h2>Gündem</h2><p>Bu satır</p>"), "Gündem Bu satır");
  eq("noteText: liste maddeleri ayrılır", noteText("<ul><li>bir</li><li>iki</li></ul>"), "bir iki");
  eq("noteText: <br> boşluk sayılır", noteText("a<br>b"), "a b");
  ok("noteText: bloklar arası arama eşleşir",
     foldTr(noteText("<h2>Gündem</h2><p>maddeleri</p>")).indexOf(foldTr("gundem maddeleri")) !== -1);
  eq("noteText: varlıklar çözülür", noteText("<p>a &amp; b</p>"), "a & b");
  eq("noteText: boş girdi", noteText(""), "");
  ok("noteText + foldTr: 'istanbul' araması 'İstanbul'u bulur",
     foldTr(noteText("<p>İstanbul toplantısı</p>")).indexOf(foldTr("istanbul")) !== -1);

  // --- not şeması ---
  eq("normalizeNotePage: başlık kırpılır", normalizeNotePage({ title:"x" }).title, "x");
  ok("normalizeNotePage: eski html süzgeçten geçer",
     normalizeNotePage({ title:"x", html:"<script>k<\/script><p>iyi</p>" }).boxes[0].html.indexOf("script") === -1);
  ok("normalizeNotePage: çöp girdi null", normalizeNotePage(null) === null && normalizeNotePage(7) === null);
  eq("normalizeNotebook: isimsiz deftere ad verilir", !!normalizeNotebook({}).name, true);
  eq("normalizeNotebook: pages dizi değilse boşalır", normalizeNotebook({ name:"a", pages:"olmaz" }).pages, []);
  eq("normalizeNotebook: geçersiz renk düzeltilir", normalizeNotebook({ name:"a", color:"kirmizi" }).color, NB_COLORS[0]);
  eq("normalizeNotes: notebooks dizi değilse boşalır", normalizeNotes({ notebooks:{} }).notebooks, []);

  // --- mergeNotebooks: iki kademeli birleştirme ---
  const nbCur = [{ id:"n1", name:"Eski", color:"#111111", createdAt:"2026-01-01T00:00:00.000Z",
    updatedAt:"2026-01-01T00:00:00.000Z", pages:[
      { id:"p1", title:"Sayfa 1 eski", html:"", createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" },
      { id:"p2", title:"Yalnız burada", html:"", createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" }
    ]}];
  const nbInc = [{ id:"n1", name:"Yeni", color:"#222222", createdAt:"2026-01-01T00:00:00.000Z",
    updatedAt:"2026-06-01T00:00:00.000Z", pages:[
      { id:"p1", title:"Sayfa 1 yeni", html:"", createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-06-01T00:00:00.000Z" },
      { id:"p3", title:"Yeni sayfa", html:"", createdAt:"2026-06-01T00:00:00.000Z", updatedAt:"2026-06-01T00:00:00.000Z" }
    ]}];
  const nbr = mergeNotebooks(nbCur, nbInc);
  eq("mergeNotebooks: defter sayısı", nbr.notebooks.length, 1);
  eq("mergeNotebooks: yeni defter adı kazanır", nbr.notebooks[0].name, "Yeni");
  eq("mergeNotebooks: sayfa sayısı (hiçbiri kaybolmaz)", nbr.notebooks[0].pages.length, 3);
  eq("mergeNotebooks: yeni sayfa sürümü kazanır", nbr.notebooks[0].pages.find(p => p.id === "p1").title, "Sayfa 1 yeni");
  ok("mergeNotebooks: yalnız yerelde olan sayfa korunur", !!nbr.notebooks[0].pages.find(p => p.id === "p2"));
  eq("mergeNotebooks: girdi dizisi değişmedi", nbCur[0].pages.length, 2);
  eq("mergeNotebooks: bilinmeyen defter eklenir", mergeNotebooks([], nbInc).added, 1);

  // --- depolama ölçümü ---
  ok("storageBytes: pozitif ve sayı", typeof storageBytes() === "number" && storageBytes() > 0);
  eq("formatBytes: KB", formatBytes(2048), "2 KB");
  eq("formatBytes: MB", formatBytes(1024 * 1024 * 3), "3.0 MB");
  eq("formatBytes: B", formatBytes(500), "500 B");

  // --- resim genişliği (serbest boyutlandırmanın kalıcı temsili) ---
  ok("width: 420 korunur", S('<img width="420" src="data:image/png;base64,AAA=">').indexOf('width="420"') !== -1);
  ok("width: alt sınır 40 korunur", S('<img width="40" src="data:image/png;base64,AAA=">').indexOf('width="40"') !== -1);
  ok("width: üst sınır 1600 korunur", S('<img width="1600" src="data:image/png;base64,AAA=">').indexOf('width="1600"') !== -1);
  ok("width: 39 düşer", S('<img width="39" src="data:image/png;base64,AAA=">').indexOf("width") === -1);
  ok("width: 99999 düşer", S('<img width="99999" src="data:image/png;base64,AAA=">').indexOf("width") === -1);
  ok("width: 'abc' düşer", S('<img width="abc" src="data:image/png;base64,AAA=">').indexOf("width") === -1);
  ok("width: negatif düşer", S('<img width="-5" src="data:image/png;base64,AAA=">').indexOf("width") === -1);
  ok("width yalnızca IMG'de", S('<p width="100">x</p>').indexOf("width") === -1);

  // --- geçmişte resim tekrarını önleyen yer tutucu ---
  const dURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  const packed = packImages('<p>a</p><img src="' + dURL + '"><img src="' + dURL + '">');
  ok("packImages: data URL yer tutucuya döner", packed.indexOf("data:image") === -1 && packed.indexOf('src="ref:') !== -1);
  eq("packImages: aynı resim haritada bir kez tutulur",
     (packed.match(/ref:/g) || []).length === 2 && HISTORY.images.size >= 1, true);
  eq("unpackImages: gidiş-dönüş aslına döner", unpackImages(packed),
     '<p>a</p><img src="' + dURL + '"><img src="' + dURL + '">');
  ok("packImages: iki kez paketlemek bozmaz", unpackImages(packImages(packed)) === unpackImages(packed));
  ok("unpackImages: bilinmeyen anahtar boş src verir", unpackImages('<img src="ref:zzzzzz">').indexOf('src=""') !== -1);
  ok("imgKey: aynı içerik aynı anahtar", imgKey(dURL) === imgKey(dURL));
  ok("imgKey: farklı içerik farklı anahtar", imgKey(dURL) !== imgKey(dURL + "A"));
  eq("packImages: resimsiz HTML değişmez", packImages("<p>x</p>"), "<p>x</p>");

  // --- yapıştırma karar ağacının sayaçları ---
  eq("countImgs: kaynakta iki resim", countImgs('<p>a</p><img src="file:///x.png"><img src="cid:1">'), 2);
  eq("countImgs: süzgeç sonrası sıfır", countImgs(S('<img src="file:///x.png">')), 0);
  eq("countImgs: data URL korunur", countImgs(S('<img src="' + dURL + '">')), 1);
  ok("file: şemalı resim reddedilir", S('<img src="file:///C:/a.png">').indexOf("<img") === -1);
  ok("cid: şemalı resim reddedilir", S('<img src="cid:image001.png@01D9">').indexOf("<img") === -1);
  ok("blob: şemalı resim reddedilir", S('<img src="blob:https://a.com/1-2-3">').indexOf("<img") === -1);
  ok("http: şemalı resim reddedilir (çevrimdışı + iz sürme)", S('<img src="http://a.com/x.png">').indexOf("<img") === -1);

  /* ===== TUR 2: sunum biçimini anlamsal etikete çevirme ===== */
  const P = presentationalToSemantic;
  const PS = h => sanitizeHtml(presentationalToSemantic(h));   // gerçek yapıştırma yolu

  // kalın / italik / altı-üstü çizili
  eq("p2s: font-weight:700 → <b>", P('<span style="font-weight:700">x</span>'), "<b>x</b>");
  eq("p2s: font-weight:bold → <b>", P('<span style="font-weight:bold">x</span>'), "<b>x</b>");
  eq("p2s: font-weight:600.0 → <b>", P('<span style="font-weight:600.0">x</span>'), "<b>x</b>");
  eq("p2s: boşluklu/büyük harf değer", P('<span style="FONT-WEIGHT:  BOLD  ">x</span>'), "<b>x</b>");
  eq("p2s: font-weight:400 sarmalamaz", P('<span style="font-weight:400">x</span>'), "x");
  eq("p2s: font-weight:normal sarmalamaz", P('<span style="font-weight:normal">x</span>'), "x");
  eq("p2s: font-style:italic → <i>", P('<span style="font-style:italic">x</span>'), "<i>x</i>");
  eq("p2s: text-decoration:underline → <u>", P('<span style="text-decoration:underline">x</span>'), "<u>x</u>");
  eq("p2s: iki süsleme birden", P('<span style="text-decoration:underline line-through">x</span>'), "<u><s>x</s></u>");
  eq("p2s: text-decoration:none temizler", P('<u><span style="text-decoration:none">x</span></u>'), "x");

  // İÇ İÇE ÇELİŞKİ — naif sarmalamanın bozulduğu yer
  eq("p2s: 700 içindeki 400 doğru çıkar",
     P('<span style="font-weight:700">A<span style="font-weight:400">B</span></span>'), "<b>A</b>B");
  eq("p2s: <b> içindeki normal doğru çıkar",
     P('<b>A<span style="font-weight:normal">B</span></b>'), "<b>A</b>B");
  eq("p2s: italik içinde italik-değil",
     P('<i>A<span style="font-style:normal">B</span></i>'), "<i>A</i>B");

  // İDEMPOTENTLİK — kabul kriteri
  const idemCases = [
    '<span style="font-weight:700">x</span>',
    '<b><i>x</i></b>',
    '<p style="font-weight:700">A<span style="font-weight:400">B</span></p>',
    '<span style="color:#ff0000;background-color:#ffff00;font-size:24px">renk</span>',
    '<ul><li>bir</li><li>iki</li></ul>',
    '<table><tr><td>a</td><td>b</td></tr></table>'
  ];
  for (let ci = 0; ci < idemCases.length; ci++){
    ok("p2s idempotent #" + (ci + 1), P(P(idemCases[ci])) === P(idemCases[ci]));
    ok("süzgeç idempotent #" + (ci + 1), sanitizeHtml(PS(idemCases[ci])) === PS(idemCases[ci]));
  }

  // <font>
  eq("p2s: <font color> çevrilir", P('<font color="#ff0000">x</font>'), '<span style="color:#ff0000">x</span>');
  eq("p2s: <font color=red> ad çevrilir", P('<font color="red">x</font>'), '<span style="color:#ff0000">x</span>');
  ok("p2s: <font size=6> punto sınıfı verir", P('<font size="6">x</font>').indexOf("fs-") !== -1);

  // renk geçidi — desteklenen ve BİLEREK desteklenmeyen yazımlar
  eq("renk: #f00 genişletilir", normColor("#f00"), "#ff0000");
  eq("renk: #FF0000 küçültülür", normColor("#FF0000"), "#ff0000");
  eq("renk: rgb() çevrilir", normColor("rgb(255, 0, 0)"), "#ff0000");
  eq("renk: 'red' adı", normColor("red"), "#ff0000");
  eq("renk: 'windowtext' siyaha", normColor("windowtext"), "#000000");
  eq("renk: rgba() DESTEKLENMİYOR", normColor("rgba(255,0,0,.5)"), null);
  eq("renk: hsl() DESTEKLENMİYOR", normColor("hsl(0,100%,50%)"), null);
  eq("renk: yüzdeli rgb DESTEKLENMİYOR", normColor("rgb(100%,0%,0%)"), null);
  eq("renk: transparent DESTEKLENMİYOR", normColor("transparent"), null);
  eq("renk: currentColor DESTEKLENMİYOR", normColor("currentColor"), null);
  eq("renk: bilinmeyen ad", normColor("kirmizimsi"), null);

  // stil geçidi güvenliği — genişleme gedik açmadı
  ok("stil: color korunur", PS('<span style="color:#ff0000">x</span>').indexOf("color:#ff0000") !== -1);
  ok("stil: background-color korunur", PS('<span style="background-color:#ffff00">x</span>').indexOf("background-color:#ffff00") !== -1);
  ok("stil: position:fixed düşer", PS('<span style="position:fixed;top:0">x</span>').indexOf("position") === -1);
  ok("stil: url(javascript:) düşer", PS('<span style="background:url(javascript:alert(1))">x</span>').indexOf("javascript") === -1);
  ok("stil: expression() düşer", PS('<span style="width:expression(alert(1))">x</span>').indexOf("expression") === -1);
  ok("stil: !important sızmaz", PS('<span style="color:#ff0000 !important">x</span>').indexOf("important") === -1);
  ok("stil: karışıkta yalnızca renk kalır",
     PS('<span style="color:#ff0000;position:fixed;z-index:9">x</span>').indexOf("position") === -1 &&
     PS('<span style="color:#ff0000;position:fixed;z-index:9">x</span>').indexOf("color:#ff0000") !== -1);
  ok("stil: behavior/-moz-binding düşer", PS('<span style="behavior:url(#x)">y</span>').indexOf("behavior") === -1);

  // punto
  eq("punto: 24px → fs-l", normFontSize("24px"), "fs-l");
  eq("punto: 11pt (Word varsayılanı) normal sayılır", normFontSize("11pt"), null);
  eq("punto: 8px en küçüğe sıkışır", normFontSize("8px"), "fs-xs");
  eq("punto: 90px en büyüğe sıkışır", normFontSize("90px"), "fs-xl");
  eq("punto: geçersiz", normFontSize("kocaman"), null);
  ok("punto sınıfı süzgeçten geçer", PS('<span style="font-size:28px">x</span>').indexOf("fs-xl") !== -1);
  ok("serbest px saklanmaz", PS('<span style="font-size:28px">x</span>').indexOf("28px") === -1);

  // tablolar
  ok("tablo: yapı korunur", PS("<table><tr><td>a</td><td>b</td></tr></table>").indexOf("<td>a</td>") !== -1);
  ok("tablo: thead/th korunur", PS("<table><thead><tr><th>B</th></tr></thead></table>").indexOf("<th>B</th>") !== -1);
  ok("tablo: colspan=2 korunur", PS('<table><tr><td colspan="2">a</td></tr></table>').indexOf('colspan="2"') !== -1);
  ok("tablo: colspan='abc' düşer", PS('<table><tr><td colspan="abc">a</td></tr></table>').indexOf("colspan") === -1);
  ok("tablo: colspan=999 düşer", PS('<table><tr><td colspan="999">a</td></tr></table>').indexOf("colspan") === -1);
  ok("tablo: rowspan=3 korunur", PS('<table><tr><td rowspan="3">a</td></tr></table>').indexOf('rowspan="3"') !== -1);
  ok("tablo: iç içe tablo açılır", (PS("<table><tr><td><table><tr><td>ic</td></tr></table></td></tr></table>").match(/<table/g) || []).length === 1);
  ok("tablo: içindeki script yine düşer", PS("<table><tr><td><script>k<\/script>hucre</td></tr></table>").indexOf("script") === -1);
  ok("tablo: bozuk yapı çökertmez", typeof PS("<table><td>kopuk</table>") === "string");

  // Word listeleri — dürüst kapsam
  const wordUl = '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;</span></span>Birinci</p>' +
                 '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;</span></span>İkinci</p>';
  const wl = PS(wordUl);
  ok("Word listesi: tek <ul> oluştu", (wl.match(/<ul>/g) || []).length === 1);
  eq("Word listesi: iki madde", (wl.match(/<li>/g) || []).length, 2);
  ok("Word listesi: madde işareti metinden ayıklandı", wl.indexOf("·") === -1);
  ok("Word listesi: metin korundu", wl.indexOf("Birinci") !== -1 && wl.indexOf("İkinci") !== -1);
  const wordOl = "<p>1. Bir</p><p>2. İki</p>";
  ok("Ondalık liste <ol> olur", PS(wordOl).indexOf("<ol>") !== -1);
  ok("Ondalık liste numarası ayıklandı", PS(wordOl).indexOf("1.") === -1);
  const wordL2 = '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">Alt seviye</p>';
  ok("Çok seviyeli DESTEKLENMİYOR ama KAYBOLMUYOR",
     PS(wordL2).indexOf("<ul>") === -1 && PS(wordL2).indexOf("Alt seviye") !== -1);
  const wordL2m = '<p class="MsoListParagraph" style="mso-list:l0 level2 lfo1">' +
                  '<span style="mso-list:Ignore">o<span>&nbsp;</span></span>Alt seviye</p>';
  ok("Çevrilmeyen maddede işaretçi çöpü kalmaz", /^\s*o\s/.test(noteText(PS(wordL2m))) === false);
  ok("Çevrilmeyen maddenin metni korunur", noteText(PS(wordL2m)).indexOf("Alt seviye") !== -1);
  const wordAlpha = "<p>a. Alfabetik</p><p>b. Madde</p>";
  ok("Alfabetik liste DESTEKLENMİYOR ama KAYBOLMUYOR",
     PS(wordAlpha).indexOf("<ol>") === -1 && PS(wordAlpha).indexOf("Alfabetik") !== -1);
  const interleaved = "<p>1. Bir</p><p>Normal paragraf</p><p>2. İki</p>";
  eq("Araya paragraf girince liste bölünür", (PS(interleaved).match(/<ol>/g) || []).length, 2);

  // Word artıkları
  const wordJunk = '<!--[if gte mso 9]><xml><o:OfficeDocumentSettings/></xml><![endif]-->' +
                   '<p class="MsoNormal"><o:p></o:p><span lang="TR" style="font-family:Calibri;mso-fareast-language:TR">Metin</span></p>';
  ok("mso artığı kalmaz", PS(wordJunk).toLowerCase().indexOf("mso") === -1);
  ok("Word metni korunur", PS(wordJunk).indexOf("Metin") !== -1);
  ok("yazı tipi ailesi saklanmaz (bilinçli)", PS(wordJunk).indexOf("Calibri") === -1);

  // ESKİ GÜVENLİK İDDİALARI hâlâ geçerli mi (genişleme gedik açtı mı?)
  ok("genişleme sonrası: script yine düşer", PS('<table><tr><td><script>x<\/script></td></tr></table>').indexOf("script") === -1);
  ok("genişleme sonrası: onerror yine düşer", PS('<td style="color:#f00" onerror="alert(1)">x</td>').indexOf("onerror") === -1);
  ok("genişleme sonrası: javascript: yine düşer", PS('<a href="javascript:alert(1)" style="color:#f00">x</a>').indexOf("javascript") === -1);

  // --- tuval modeli: sayfa = konumlu not kutuları ---
  const legacyPage = normalizeNotePage({ html: "<p>eski not</p>" });
  eq("v1 göçü: tek belge tek kutuya döner", legacyPage.boxes.length, 1);
  ok("v1 göçü: metin korunur", legacyPage.boxes[0].html.indexOf("eski not") !== -1);
  ok("v1 göçü: kutu tuvale yerleşir", legacyPage.boxes[0].x >= 0 && legacyPage.boxes[0].y >= 0);
  eq("boş sayfa kutusuz açılır", normalizeNotePage({}).boxes.length, 0);
  eq("boş html hayalet kutu üretmez", normalizeNotePage({ html: "   " }).boxes.length, 0);

  const clamped = normalizeNotePage({ boxes: [
    { id:"b1", x:-500, y:-9, w:5, html:"<p>a</p>" },
    { id:"b2", x:1e9, y:12, w:99999, html:"<p>b</p>" }
  ]});
  eq("negatif koordinat sıfıra çekilir", [clamped.boxes[0].x, clamped.boxes[0].y], [0, 0]);
  eq("dar genişlik alt sınıra çekilir", clamped.boxes[0].w, BOX_MIN_W);
  eq("uçuk koordinat tavana çekilir", clamped.boxes[1].x, CANVAS_MAX);
  eq("geniş genişlik üst sınıra çekilir", clamped.boxes[1].w, BOX_MAX_W);
  ok("kutu html'i de süzgeçten geçer",
     normalizeNotePage({ boxes:[{ x:0, y:0, w:300, html:'<p>x</p><script>alert(1)<\/script>' }] })
       .boxes[0].html.indexOf("script") === -1);
  ok("bozuk kutu girdisi atılır", normalizeNotePage({ boxes:[null, 7, "x"] }).boxes.length === 0);

  // Tuvalde DOM sırası okuma sırası değildir: yukarıdan aşağı, soldan sağa.
  const scattered = normalizeNotePage({ boxes: [
    { x:300, y:200, w:300, html:"<p>ucuncu</p>" },
    { x:400, y:40,  w:300, html:"<p>ikinci</p>" },
    { x:20,  y:40,  w:300, html:"<p>birinci</p>" }
  ]});
  eq("okuma sırası: önce y, sonra x",
     boxesInReadingOrder(scattered).map(b => noteText(b.html)),
     ["birinci", "ikinci", "ucuncu"]);
  eq("sayfa düz metni okuma sırasını izler", pagePlain(scattered), "birinci ikinci ucuncu");

  // --- notlardan HTML üretimi ---
  ok("notesToHtml: doctype ile başlar", notesToHtml().indexOf("<!doctype html>") === 0);
  (function(){
    const keep = notes.notebooks;
    notes.notebooks = [normalizeNotebook({ name:"Test", pages:[{ boxes:[
      { x:10, y:99, w:300, html:"<p>alttaki</p>" },
      { x:10, y:10, w:300, html:"<p>ustteki</p>" }
    ]}] })];
    const html = notesToHtml();
    notes.notebooks = keep;
    ok("notesToHtml: kutu içerikleri yazılır", html.indexOf("ustteki") !== -1 && html.indexOf("alttaki") !== -1);
    ok("notesToHtml: kutular okuma sırasına dizilir", html.indexOf("ustteki") < html.indexOf("alttaki"));
  })();

  const failed = results.filter(r => !r.pass);
  document.getElementById("root").append(el("div", { class:"testwrap" },
    el("h1", { text: "TaskHub — mantık testleri" }),
    el("p", { class:"sum " + (failed.length ? "tfail" : "tpass"),
      text: results.length + " iddia · " + (results.length - failed.length) + " geçti · " + failed.length + " kaldı" }),
    el("ol", {}, results.map(r => el("li", { class: r.pass ? "tpass" : "tfail" },
      (r.pass ? "✓ " : "✗ ") + r.name + (r.pass || r.want === undefined ? "" : "   (beklenen: " + JSON.stringify(r.want) + ")")
    )))
  ));
  document.title = (failed.length ? "FAIL " + failed.length : "PASS") + " — TaskHub testleri";
  window.__testResult = { total: results.length, failed: failed.length, names: failed.map(r => r.name) };
}

/* =========================== PANO TANILAMA ==============================
 * Bu ortamda Windows ve Word yok; gerçek masaüstü yapıştırması
 * otomatikleştirilemiyor. Sentetik ClipboardEvent yalnızca bizim
 * ayrıştırıcımızı sınar. Bu kip, kullanıcının kendi makinesinde panonun HAM
 * içeriğini görüp gönderebilmesi için var — gelen her örnek test fikstürü olur. */
function runClipDebug(){
  const root = document.getElementById("root");
  root.textContent = "";
  const out = el("textarea", { class:"input", readonly:true, spellcheck:"false",
    style:"width:100%;height:46vh;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px" });
  const meta = el("pre", { style:"background:var(--surface-2);padding:10px;border-radius:8px;overflow-x:auto;font-size:12px" });
  const drop = el("div", {
    contenteditable:"true", id:"clipTarget",
    style:"min-height:120px;border:2px dashed var(--border-strong);border-radius:10px;padding:14px;outline:none;background:var(--surface)",
    onpaste(e){
      const dt = e.clipboardData; if (!dt) return;
      e.preventDefault();
      const types = [].slice.call(dt.types || []);
      let html = ""; try { html = dt.getData("text/html") || ""; } catch(err){ html = "(okunamadı)"; }
      let text = ""; try { text = dt.getData("text/plain") || ""; } catch(err){ text = ""; }
      const files = clipboardImageFiles(dt).map(f => f.type + " " + formatBytes(f.size));
      meta.textContent =
        "types: " + JSON.stringify(types) +
        "\nresim dosyaları: " + (files.length ? files.join(", ") : "yok") +
        "\ntext/html uzunluğu: " + html.length +
        "\ntext/plain: " + JSON.stringify(text.slice(0, 200));
      out.value = html;
      // Bizim ayrıştırıcımızın ne ürettiğini de göster
      prev.innerHTML = sanitizeHtml(presentationalToSemantic(html));
      wrapWideTables(prev);
      sanOut.value = prev.innerHTML;
    }
  }, el("p", { style:"margin:0;color:var(--muted)", text:"Word / OneNote'tan kopyaladığın içeriği BURAYA yapıştır (Ctrl+V)." }));

  const prev = el("div", { class:"nbox-body", style:"border:1px solid var(--border);border-radius:10px;padding:14px;max-height:40vh;overflow:auto" });
  const sanOut = el("textarea", { class:"input", readonly:true, spellcheck:"false",
    style:"width:100%;height:20vh;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px" });

  const copyBtn = el("button", { class:"btn btn-primary", onclick(){
    out.select();
    try { document.execCommand("copy"); toast("Ham HTML panoya kopyalandı."); } catch(e){}
  }}, "Ham HTML'i kopyala");

  root.append(el("div", { style:"max-width:900px;margin:28px auto;padding:0 20px;display:flex;flex-direction:column;gap:14px" },
    el("h1", { style:"margin:0;font-size:20px", text:"Pano tanılama" }),
    el("p", { style:"margin:0;color:var(--muted);font-size:14px",
      text:"Word veya OneNote'tan bir parça kopyala, aşağıdaki kutuya yapıştır ve 'Ham HTML'i kopyala' ile bana gönder. Gelen örnek test fikstürü olarak eklenir." }),
    drop, meta,
    el("h2", { style:"margin:0;font-size:15px", text:"1) Panodaki ham HTML" }), out, copyBtn,
    el("h2", { style:"margin:0;font-size:15px", text:"2) Bizim çevirimizin sonucu" }), prev,
    el("h2", { style:"margin:0;font-size:15px", text:"3) Saklanacak HTML" }), sanOut,
    el("div", { class:"toasts", id:"toasts", "aria-live":"polite" })
  ));
  document.title = "TaskHub — pano tanılama";
}

/* -------------------------------------------------------------- başlangıç
 * Asenkron, çünkü depolama okuması adaptörün arkasında (T3.1) ve IndexedDB
 * (T3.2) başka türlü olamaz. Açılış nöbetçisi 1500 ms bekliyor; localStorage
 * okuması bir mikrogörev sürer, IndexedDB birkaç milisaniye. Yine de okuma
 * bir sebeple asılırsa arayüz KURULMADAN kalmasın diye boş duruma düşülür ve
 * bu kullanıcıya söylenir — sessizce beyaz ekran gösterilmez. */
const BOOT_READ_TIMEOUT = 1000;

function withTimeout(promise, ms, fallback){
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

(async () => {
  /* Sıra önemlidir:
     1. localStorage var mı  — günlük ve geri düşme buna bağlı
     2. IndexedDB açılıyor mu — açılırsa tavan ~5 MB'tan ~151 GiB'a çıkar
     3. göç             — localStorage'daki veri IndexedDB'ye kopyalanır (atomik)
     4. günlük kurtarma — kapanışta yetişemeyen yazma varsa geri konur
     5. okuma                                                                  */
  localOK = probeStorage();
  storageOK = localOK;

  await selectStorage();
  if (storageKind === "indexedDB") storageOK = true;   // IndexedDB açıldı, yazabiliriz

  await migrateToIdb();
  const replayed = await replayJournal();
  await refreshQuota();          // gösterge ve eşikler gerçek tavanı kullansın

  const FAILED = Symbol("okuma-basarisiz");
  const [s0, n0] = await Promise.all([
    withTimeout(load().catch(() => FAILED), BOOT_READ_TIMEOUT, FAILED),
    withTimeout(loadNotes().catch(() => FAILED), BOOT_READ_TIMEOUT, FAILED),
  ]);
  const readFailed = s0 === FAILED || n0 === FAILED;
  state = s0 === FAILED ? defaultState() : s0;
  notes = n0 === FAILED ? defaultNotes() : n0;
  if (readFailed) storageOK = false;      // şerit çıkar, üstüne yazılmaz

  applyTheme();
  document.documentElement.lang = state.settings.lang;

  if (params.get("clipdebug") === "1"){
    runClipDebug();
  } else if (params.get("test") === "1"){
    runTests();
  } else {
    buildShell();
    scheduleMidnight();
    installStorageHooks();
    /* Kapanışta yetişemeyen bir yazma kurtarıldıysa kullanıcı bilsin:
       sessizce kurtarmak, sessizce kaybetmek kadar yanıltıcıdır. */
    if (replayed){
      toast(replayed.notesDropped ? t("journalPartial") : t("journalRestored"), null, 7000);
    }
  }
})();
