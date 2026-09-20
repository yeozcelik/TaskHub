/* ---------------------------------------------------- depolama adaptörü ---
 * localStorage'a dokunmanın TEK yeri burasıdır. `tools/check-purity.mjs`
 * bunu bir kural olarak zorlar: başka hiçbir dosyada `localStorage` geçemez.
 *
 * Arayüz ASENKRON tasarlandı, çünkü IndexedDB (T3.2) başka türlü olamaz.
 * localStorage senkron çalışır; adaptör sonucu hemen çözülmüş bir Promise
 * olarak döndürür — çağıran taraf hangi teknolojinin altta olduğunu bilmez.
 *
 * `setSync` BİLEREK ayrı duruyor ve İSTEĞE BAĞLIDIR.
 * Sayfa kapanırken (`beforeunload`) bir `await`in devamı çalışmaz: tarayıcı
 * olay işleyicisi bittiğinde sayfayı yıkar, mikrogörev sırası beklemez. Yani
 * "son bir kez kaydet" yolu SENKRON olmak zorundadır. localStorage bunu
 * verebilir, IndexedDB veremez. Adaptör bu farkı saklamak yerine AÇIKÇA
 * ilan eder; T3.2 kendi dayanıklılık çözümünü yazmak zorunda kalsın diye.  */

function createLocalAdapter(){
  const can = () => {
    try {
      const k = "__taskhub_probe__";
      localStorage.setItem(k, "1");
      const ok = localStorage.getItem(k) === "1";
      localStorage.removeItem(k);
      return ok;
    } catch (e){ return false; }
  };

  return {
    name: "localStorage",

    /** Kullanılabilir mi? Gizli kipte ve bazı file:// yapılandırmalarında değil. */
    available(){ return can(); },

    /** @returns {Promise<string|null>} */
    get(key){
      try { return Promise.resolve(localStorage.getItem(key)); }
      catch (e){ return Promise.reject(e); }
    },

    /** @returns {Promise<void>} kota aşılırsa reddeder */
    set(key, value){
      try { localStorage.setItem(key, value); return Promise.resolve(); }
      catch (e){ return Promise.reject(e); }
    },

    /** Sayfa kapanırken kullanılır. Hata fırlatır, Promise döndürmez. */
    setSync(key, value){ localStorage.setItem(key, value); },

    remove(key){
      try { localStorage.removeItem(key); return Promise.resolve(); }
      catch (e){ return Promise.reject(e); }
    },

    /** Gerçek kota bilgisi yok; çağıran tarafın varsayımına düşülür. */
    estimate(){ return Promise.resolve(null); },
  };
}
