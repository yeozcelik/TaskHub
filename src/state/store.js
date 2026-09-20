/* ------------------------------------------------------------- depolama */
const STORAGE_KEY = "taskhub";
const SCHEMA_VERSION = 1;
const NB_COLORS = ["#5b5bd6","#0b7a55","#c2410c","#b4309b","#0369a1","#a16207"];
const params = new URLSearchParams(location.search);

let storageOK = false;
let corruptRecovered = false;

/* Şu an tek adaptör var. T3.2 IndexedDB'yi ekleyecek ve seçim burada
   yapılacak; store.js'in geri kalanı hangisinin seçildiğini bilmeyecek. */
const storage = createLocalAdapter();

function probeStorage(){
  if (params.get("nostorage") === "1") return false; // uyarı şeridini sınamak için
  return storage.available();
}

function defaultState(){
  return {
    version: SCHEMA_VERSION,
    settings: { theme:"auto", lang:"tr", noteGrid:true, lastNote:null, lastBackupAt:null, nagDismissedAt:null },
    tasks: []
  };
}

/** Dışarıdan gelen (veya eski) veriyi güvenli bir şekilde şemaya oturtur. */
function normalizeTask(raw){
  if (!raw || typeof raw !== "object") return null;
  const title = typeof raw.title === "string" ? raw.title : "";
  if (!title.trim() && !raw.id) return null;
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    title: title,
    notes: typeof raw.notes === "string" ? raw.notes : "",
    dueDate: parseYmd(raw.dueDate) ? raw.dueDate : null,
    priority: ["low","med","high"].includes(raw.priority) ? raw.priority : "med",
    tags: Array.isArray(raw.tags) ? raw.tags.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()).slice(0, 30) : [],
    subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map(s => ({
      id: (s && typeof s.id === "string" && s.id) ? s.id : uid(),
      title: (s && typeof s.title === "string") ? s.title : "",
      done: !!(s && s.done)
    })).filter(s => s.title.trim()) : [],
    done: !!raw.done,
    createdAt: ts(raw.createdAt) ? raw.createdAt : now,
    updatedAt: ts(raw.updatedAt) ? raw.updatedAt : (ts(raw.createdAt) ? raw.createdAt : now),
    completedAt: raw.done ? (ts(raw.completedAt) ? raw.completedAt : now) : null,
    sourceNoteId: (raw.sourceNoteId && typeof raw.sourceNoteId === "object"
      && typeof raw.sourceNoteId.notebookId === "string" && typeof raw.sourceNoteId.pageId === "string")
      ? { notebookId: raw.sourceNoteId.notebookId, pageId: raw.sourceNoteId.pageId } : null
  };
}

function normalizeState(raw){
  const s = defaultState();
  if (!raw || typeof raw !== "object") return s;
  const set = raw.settings || {};
  if (["auto","light","dark"].includes(set.theme)) s.settings.theme = set.theme;
  if (["tr","en"].includes(set.lang)) s.settings.lang = set.lang;
  if (typeof set.noteGrid === "boolean") s.settings.noteGrid = set.noteGrid;
  if (set.lastNote && typeof set.lastNote === "object"){
    const nbId = set.lastNote.nbId, pageId = set.lastNote.pageId;
    if (typeof nbId === "string" || typeof pageId === "string"){
      s.settings.lastNote = {
        nbId: typeof nbId === "string" ? nbId.slice(0, 64) : null,
        pageId: typeof pageId === "string" ? pageId.slice(0, 64) : null
      };
    }
  }
  if (ts(set.lastBackupAt)) s.settings.lastBackupAt = set.lastBackupAt;
  if (ts(set.nagDismissedAt)) s.settings.nagDismissedAt = set.nagDismissedAt;
  s.tasks = Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTask).filter(Boolean) : [];
  return s;
}

/* ------------------------------------------------------------ notlar deposu
 * Notlar ayrı bir anahtarda tutulur. Tek anahtar olsaydı şişen bir not
 * setItem'ı patlatır ve GÖREVLER de kaydedilemez hale gelirdi; ayrı yazınca
 * notlar kotayı doldursa bile görev tarafı çalışmaya devam eder. */
const NOTES_KEY = "taskhub.notes";
const STORAGE_BUDGET = 5 * 1024 * 1024; // localStorage tavanı için pratik varsayım
let notesQuotaHit = false;

function defaultNotes(){ return { version: SCHEMA_VERSION, notebooks: [] }; }

/* Bir sayfa artık düz bir belge değil, SERBEST TUVAL: içeriği, tuvalde kendi
 * koordinatı olan not kutularından oluşur — OneNote'un modeli budur.
 * Eski sürümün tek `html` alanı okunmaya devam eder ve ilk kutuya dönüşür;
 * eski localStorage kaydı ve eski JSON yedekleri böylece kaybolmaz. */
const BOX_MIN_W = 150, BOX_MAX_W = 1600, BOX_DEF_W = 460;
const CANVAS_MAX = 20000;                  // tuval koordinat tavanı

function normalizeBox(raw){
  if (!raw || typeof raw !== "object") return null;
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    x: clamp(Math.round(numOr(raw.x, 44)), 0, CANVAS_MAX),
    y: clamp(Math.round(numOr(raw.y, 36)), 0, CANVAS_MAX),
    w: clamp(Math.round(numOr(raw.w, BOX_DEF_W)), BOX_MIN_W, BOX_MAX_W),
    html: sanitizeHtml(typeof raw.html === "string" ? raw.html : "")
  };
}

function normalizeNotePage(raw){
  if (!raw || typeof raw !== "object") return null;
  const now = new Date().toISOString();
  let boxes = Array.isArray(raw.boxes) ? raw.boxes.map(normalizeBox).filter(Boolean) : null;
  if (!boxes){
    const legacy = sanitizeHtml(typeof raw.html === "string" ? raw.html : "");
    boxes = legacy.trim() ? [{ id: uid(), x: 44, y: 36, w: 660, html: legacy }] : [];
  }
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    title: typeof raw.title === "string" ? raw.title.slice(0, 300) : "",
    boxes,
    createdAt: ts(raw.createdAt) ? raw.createdAt : now,
    updatedAt: ts(raw.updatedAt) ? raw.updatedAt : (ts(raw.createdAt) ? raw.createdAt : now)
  };
}

function normalizeNotebook(raw){
  if (!raw || typeof raw !== "object") return null;
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, 120) : I18N.tr.untitledNotebook,
    color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : NB_COLORS[0],
    pages: Array.isArray(raw.pages) ? raw.pages.map(normalizeNotePage).filter(Boolean) : [],
    createdAt: ts(raw.createdAt) ? raw.createdAt : now,
    updatedAt: ts(raw.updatedAt) ? raw.updatedAt : (ts(raw.createdAt) ? raw.createdAt : now)
  };
}

function normalizeNotes(raw){
  const n = defaultNotes();
  if (!raw || typeof raw !== "object") return n;
  n.notebooks = Array.isArray(raw.notebooks) ? raw.notebooks.map(normalizeNotebook).filter(Boolean) : [];
  return n;
}

async function loadNotes(){
  if (!storageOK) return defaultNotes();
  let raw = null;
  try { raw = await storage.get(NOTES_KEY); } catch(e){ return defaultNotes(); }
  if (!raw) return defaultNotes();
  try {
    return normalizeNotes(JSON.parse(raw));
  } catch(e){
    // Bozuk veriyi ezme — kenara al ki elle kurtarılabilsin.
    try { await storage.set(NOTES_KEY + ".corrupt." + Date.now(), raw); } catch(_){}
    corruptRecovered = true;
    return defaultNotes();
  }
}

let notesSaveTimer = null;
function scheduleSaveNotes(){
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(saveNotesNow, 400);
}
async function saveNotesNow(){
  clearTimeout(notesSaveTimer); notesSaveTimer = null;
  flushEditor();          // editördeki ham HTML süzgeçten geçip modele burada yazılır
  if (!storageOK) return;
  try {
    await storage.set(NOTES_KEY, JSON.stringify(notes));
    notesQuotaHit = false;
  } catch(e){
    // storageOK'e dokunulmaz: görev kaydı bundan etkilenmemeli.
    notesQuotaHit = true;
    renderBanners();
    toast(t("notesQuotaFail"), null, 9000);
  }
}

/** İki anahtarın yaklaşık bayt boyutu (UTF-16 saklama varsayımıyla). */
function storageBytes(){
  let n = 0;
  try { n += JSON.stringify(state).length * 2; } catch(e){}
  try { n += JSON.stringify(notes).length * 2; } catch(e){}
  return n;
}
const storagePercent = () => Math.min(100, Math.round(storageBytes() / STORAGE_BUDGET * 100));
function formatBytes(n){
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + " KB";
  return (n / 1024 / 1024).toFixed(1) + " MB";
}

async function load(){
  if (!storageOK) return defaultState();
  let raw = null;
  try { raw = await storage.get(STORAGE_KEY); } catch(e){ return defaultState(); }
  if (!raw) return defaultState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch(e){
    // Bozuk veriyi ezme — kenara al ki elle kurtarılabilsin.
    try { await storage.set(STORAGE_KEY + ".corrupt." + Date.now(), raw); } catch(_){}
    corruptRecovered = true;
    return defaultState();
  }
}

let saveTimer = null;
function scheduleSave(){
  touchedAt = new Date().toISOString();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}
let touchedAt = null;
async function saveNow(){
  clearTimeout(saveTimer); saveTimer = null;
  if (!storageOK) return;
  try {
    await storage.set(STORAGE_KEY, JSON.stringify(state));
  } catch(e){
    storageOK = false;
    renderBanners();
    toast(t("quotaFail"));
  }
}

/* Sayfa kapanırken SENKRON kaydetmek zorundayız: `await`in devamı çalışmaz.
   Adaptörde `setSync` yoksa (IndexedDB) burada yapılabilecek bir şey yok ve
   bu, T3.2'nin çözmesi gereken bir dayanıklılık sorunudur — sessizce veri
   kaybetmek yerine sınırı burada yazıyoruz. */
function flushAllSync(){
  flushEditor();
  if (!storageOK || typeof storage.setSync !== "function") return;
  try { if (saveTimer) storage.setSync(STORAGE_KEY, JSON.stringify(state)); } catch(e){}
  try { if (notesSaveTimer || dirtyEditor) storage.setSync(NOTES_KEY, JSON.stringify(notes)); } catch(e){}
  clearTimeout(saveTimer); saveTimer = null;
  clearTimeout(notesSaveTimer); notesSaveTimer = null;
}

/* Modül YÜKLENİRKEN olay bağlamak iki şeyi birden bozuyordu: store.js Node'da
   yüklenemiyordu (ADR 0002'deki `window` engeli) ve sıralama gizli bir
   varsayım hâline geliyordu. Artık açıkça başlangıçtan çağrılıyor. */
function installStorageHooks(){
  window.addEventListener("beforeunload", flushAllSync);
  /* beforeunload mobilde güvenilmez; sekme gizlenince de yaz. Aynı veriyi
     iki kez yazmak zararsız, hiç yazmamak değil. */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAllSync();
  });
}

