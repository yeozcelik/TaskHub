/* ------------------------------------------------ IndexedDB adaptörü ---
 * Ölçüldü (docs/olcumler/2026-09-20-file-protokolu-yetenekleri.md):
 * Chromium 141'de `file://` üzerinde IndexedDB çalışıyor ve ~151 GiB kota
 * bildiriyor — localStorage'ın ~5 MB'ına karşı yaklaşık 32.000 kat.
 *
 * Firefox ve Safari ÖLÇÜLMEDİ (T0.1, ortam engeli). Bu yüzden seçim koşum
 * anında yapılır: açılamazsa sessizce localStorage'a düşülür. Mimari, bu
 * sorunun cevabını beklemek zorunda kalmasın diye iki adaptörlü tasarlandı.
 *
 * `setSync` YOKTUR ve bu bilinçlidir. IndexedDB senkron yazamaz; adaptör
 * yokmuş gibi davranmak yerine yokluğunu ilan eder. store.js bunu görüp
 * günlük (journal) yoluna geçer — bkz. flushAllSync.                      */

const IDB_NAME = "taskhub";
const IDB_STORE = "kv";
const IDB_VERSION = 1;
/* Açılış nöbetçisi 1500 ms sonra "arayüz kurulamadı" diyor. IndexedDB açılışı
   yerel diskte milisaniyeler sürer; asılırsa beklemek yerine localStorage'a
   düşmek doğru davranıştır. 800 ms hem bolca yeterli hem de bütçeyi korur. */
const IDB_OPEN_TIMEOUT = 800;

function createIdbAdapter(){
  let dbPromise = null;

  function openDb(){
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      let settled = false;
      const done = fn => (...a) => { if (!settled){ settled = true; fn(...a); } };
      /* Açılış asılırsa başlangıç sonsuza kadar bekleyemez: kullanıcı boş
         ekran görmektense localStorage'la çalışsın. */
      const timer = setTimeout(done(reject), IDB_OPEN_TIMEOUT, new Error("IndexedDB açılışı zaman aşımına uğradı"));
      let req;
      try { req = indexedDB.open(IDB_NAME, IDB_VERSION); }
      catch (e){ clearTimeout(timer); return done(reject)(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => { clearTimeout(timer); done(resolve)(req.result); };
      req.onerror = () => { clearTimeout(timer); done(reject)(req.error || new Error("IndexedDB açılamadı")); };
      req.onblocked = () => { clearTimeout(timer); done(reject)(new Error("IndexedDB engellendi")); };
    });
    dbPromise.catch(() => { dbPromise = null; });   // sonraki deneme yeniden kursun
    return dbPromise;
  }

  function tx(mode, fn){
    return openDb().then(db => new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(IDB_STORE, mode); }
      catch (e){ return reject(e); }
      const store = t.objectStore(IDB_STORE);
      let result;
      const req = fn(store);
      if (req) req.onsuccess = () => { result = req.result; };
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error || new Error("IndexedDB işlemi başarısız"));
      t.onabort = () => reject(t.error || new Error("IndexedDB işlemi iptal edildi"));
    }));
  }

  return {
    name: "indexedDB",

    available(){
      try { return typeof indexedDB !== "undefined" && !!indexedDB; }
      catch (e){ return false; }
    },

    /** Açılışı gerçekten dener. `available()` yalnız API'nin varlığına bakar;
     *  Firefox'un file:// davranışı gibi şeyler ancak açarak anlaşılır. */
    probe(){ return openDb().then(() => true, () => false); },

    get(key){ return tx("readonly", s => s.get(key)).then(v => v === undefined ? null : v); },
    set(key, value){ return tx("readwrite", s => s.put(value, key)).then(() => undefined); },

    /** Hepsi ya da hiçbiri — TEK IndexedDB işleminde. Göçün yarım kalmaması
     *  buna dayanıyor: işlem iptal olursa hiçbir anahtar yazılmaz. */
    setMany(entries){
      return tx("readwrite", store => {
        for (const [k, v] of entries) store.put(v, k);
        return null;
      }).then(() => undefined);
    },
    remove(key){ return tx("readwrite", s => s.delete(key)).then(() => undefined); },

    /* setSync YOK — bkz. dosya başı. */

    estimate(){
      try {
        if (navigator.storage && navigator.storage.estimate) return navigator.storage.estimate();
      } catch (e){ /* düş */ }
      return Promise.resolve(null);
    },
  };
}
