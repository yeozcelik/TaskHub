/* ------------------------------------------------------------- depolama */
const STORAGE_KEY = "taskhub";
const SCHEMA_VERSION = 1;
const NB_COLORS = ["#5b5bd6","#0b7a55","#c2410c","#b4309b","#0369a1","#a16207"];
const params = new URLSearchParams(location.search);

let storageOK = false;
let corruptRecovered = false;

/* localStorage her zaman elde durur: hem güvenli varsayılan hem de
   IndexedDB seçildiğinde kapanış günlüğünün (journal) yazılacağı yer. */
const localStore = createLocalAdapter();
let storage = localStore;
let storageKind = "localStorage";
let localOK = false;

function probeStorage(){
  if (params.get("nostorage") === "1") return false; // uyarı şeridini sınamak için
  return storage.available();
}

/* ------------------------------------------------------- adaptör seçimi
 * IndexedDB'nin VARLIĞINA bakmak yetmez: Firefox ve Safari'nin file://
 * davranışı ölçülmedi (T0.1 engellendi). Bu yüzden gerçekten AÇILIR mı diye
 * bakılır; açılmazsa sessizce localStorage'da kalınır. Kullanıcı bir şey
 * kaybetmez, yalnız tavan düşük kalır.
 *
 * `?noidb=1` sınama kapısıdır: düşüş yolunu gerçek tarayıcıda koşturmak için. */
async function selectStorage(){
  if (params.get("noidb") === "1") return;
  if (params.get("nostorage") === "1") return;    // "depolama yok" her şeyi kapsar
  const idb = createIdbAdapter();
  if (!idb.available()) return;
  if (!(await idb.probe())) return;
  storage = idb;
  storageKind = "indexedDB";
}

/* ---------------------------------------------------------------- göç
 * Yalnız localStorage → IndexedDB yönünde. Ters yön YOK: localStorage'ın
 * işlemi olmadığı için iki anahtarı güvenle yazamayız (adapter-local.js).
 *
 * ATOMİK: iki anahtar tek IndexedDB işleminde yazılır. İşlem yarıda kalırsa
 * hiçbiri yazılmaz ve bir sonraki açılışta yeniden denenir — `put` anahtara
 * göre yazdığı için tekrar zararsızdır.
 *
 * GERİ ALINABİLİR: localStorage kaydı SİLİNMEZ. Bir sürüm daha orada durur,
 * böylece IndexedDB'de bir sorun çıkarsa veri hâlâ elde olur. */
const MIGRATED_KEY = "taskhub.migratedAt";

async function migrateToIdb(){
  if (storageKind !== "indexedDB" || !localOK) return null;
  const already = await storage.get(STORAGE_KEY);
  if (already != null) return null;                 // IndexedDB zaten dolu

  let rawState = null, rawNotes = null;
  try {
    rawState = await localStore.get(STORAGE_KEY);
    rawNotes = await localStore.get(NOTES_KEY);
  } catch (e){ return null; }
  if (rawState == null && rawNotes == null) return null;   // taşınacak bir şey yok

  const entries = [];
  if (rawState != null) entries.push([STORAGE_KEY, rawState]);
  if (rawNotes != null) entries.push([NOTES_KEY, rawNotes]);
  try {
    await storage.setMany(entries);
    try { localStore.setSync(MIGRATED_KEY, new Date().toISOString()); } catch (e){}
    return entries.length;
  } catch (e){
    // Yarım göç diske yazılmadı; localStorage'la devam et ki veri erişilebilir kalsın.
    storage = localStore; storageKind = "localStorage";
    return null;
  }
}

/* ------------------------------------------------- kapanış günlüğü (journal)
 * T3.1'de ortaya çıkan sorun: sayfa kapanırken `await`in devamı çalışmaz,
 * IndexedDB ise senkron yazamaz. Yani IndexedDB'de son 300 ms'lik düzenleme
 * normal bir sekme kapatmasında kaybolabilirdi — localStorage'da kaybolmazdı.
 * Alanı büyütürken dayanıklılığı sessizce düşürmek kötü bir takastır.
 *
 * Çözüm: kapanış anında durum SENKRON olarak localStorage'a bırakılır.
 * Sonraki açılışta günlük varsa seçilen depoya yazılır ve silinir. Günlük
 * yalnız kapanışta yazıldığı için normal kullanımda hiçbir maliyeti yoktur.
 *
 * Günlük kazanır, çünkü asenkron yazmayla AYNI bellek durumundan, aynı anda
 * üretilir: ya ikisi de yazıldı (aynı içerik) ya da yalnız günlük yazıldı. */
const JOURNAL_KEY = "taskhub.journal";

function writeJournalSync(){
  if (!localOK) return;
  const payload = { at: new Date().toISOString(), state: null, notes: null };
  try { payload.state = JSON.stringify(state); } catch (e){}
  try { payload.notes = JSON.stringify(notes); } catch (e){}
  try {
    localStore.setSync(JOURNAL_KEY, JSON.stringify(payload));
  } catch (e){
    /* Notlar localStorage'a sığmıyor (asıl sebep zaten buydu). Görevler
       küçüktür; hiç günlük tutmamaktansa onları kurtar ve bunu kaydet. */
    payload.notes = null;
    payload.notesDropped = true;
    try { localStore.setSync(JOURNAL_KEY, JSON.stringify(payload)); } catch (e2){}
  }
}

async function replayJournal(){
  if (!localOK) return null;
  let raw = null;
  try { raw = await localStore.get(JOURNAL_KEY); } catch (e){ return null; }
  if (!raw) return null;
  let j = null;
  try { j = JSON.parse(raw); } catch (e){ }
  try { await localStore.remove(JOURNAL_KEY); } catch (e){}
  if (!j) return null;

  const entries = [];
  if (typeof j.state === "string") entries.push([STORAGE_KEY, j.state]);
  if (typeof j.notes === "string") entries.push([NOTES_KEY, j.notes]);
  if (!entries.length) return null;
  try {
    if (typeof storage.setMany === "function") await storage.setMany(entries);
    else for (const [k, v] of entries) await storage.set(k, v);
    return { at: j.at, notesDropped: !!j.notesDropped };
  } catch (e){ return null; }
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
    /* Tekrar kuralı. EKLEMELİ bir alan: eski kayıtta yok → null olur, eski kod
       yeni kaydı okursa yok sayar. SCHEMA_VERSION ARTIRILMADI çünkü bu kod
       tabanında sürüme göre dallanan bir göç yolu YOK — sürüm yalnız yazılıyor,
       hiçbir yerde okunup karar verilmiyor. Artırmak tören olurdu.
       Dürüst uyarı: eski bir sürüme geri dönülür ve kayıt yeniden yazılırsa
       `recur` düşer. Bu, eklemeli alanların bilinen bedeli. */
    recur: normalizeRule(raw.recur),
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
/* Gerçek kota. localStorage'ta ölçülemez, o yüzden ~5 MB varsayımı kalır.
   IndexedDB'de `navigator.storage.estimate()` gerçek tavanı bildirir —
   ölçülen: ~151 GiB (docs/olcumler/2026-09-20-file-protokolu-yetenekleri.md).

   DİKKAT: `estimate()` bir TAVAN bildirir, bir REZERVASYON değil. Disk
   dolduğunda yine QuotaExceededError gelir; o yüzden yazma yollarındaki
   try/catch'ler yerinde duruyor. */
let quotaBytes = STORAGE_BUDGET;
let quotaMeasured = false;

async function refreshQuota(){
  try {
    const est = await storage.estimate();
    if (est && typeof est.quota === "number" && est.quota > 0){
      quotaBytes = est.quota;
      quotaMeasured = true;
      return est;
    }
  } catch (e){ /* varsayımda kal */ }
  return null;
}

const storagePercent = () => Math.min(100, Math.round(storageBytes() / quotaBytes * 100));
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
  if (!storageOK) return;
  const pending = !!saveTimer || !!notesSaveTimer || dirtyEditor;

  if (typeof storage.setSync === "function"){
    // localStorage: doğrudan ve senkron yaz, en güvenli yol.
    try { if (saveTimer) storage.setSync(STORAGE_KEY, JSON.stringify(state)); } catch(e){}
    try { if (notesSaveTimer || dirtyEditor) storage.setSync(NOTES_KEY, JSON.stringify(notes)); } catch(e){}
  } else if (pending){
    /* IndexedDB: asenkron yazmayı başlat (çoğu zaman yetişir) VE senkron
       günlük bırak (yetişmezse bir sonraki açılış kurtarır). */
    saveNow(); saveNotesNow();
    writeJournalSync();
  }
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

