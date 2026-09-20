const PRIO_ORDER = { high:0, med:1, low:2 };

/* SÜSLE-SIRALA-SOY (decorate-sort-undecorate).
 *
 * Naif karşılaştırıcı her karşılaştırmada `ts(createdAt)` çağırıyordu, yani
 * `Date.parse`. 5.000 öğede bu ~60.000 ayrıştırma demek ve ölçümde veri
 * hattının en pahalı parçasıydı. Anahtarlar ÖĞE BAŞINA BİR KEZ hesaplanınca
 * aynı sıra çok daha ucuza çıkıyor.
 *
 * Sıra tanımı değişmedi: tarihli önce, sonra tarih, sonra öncelik, sonra
 * oluşturma zamanı. Testler bunu kilitliyor. */
function sortTasks(list){
  const n = list.length;
  const out = new Array(n);
  if (n < 2){ if (n) out[0] = list[0]; return out; }

  /* SÜS NESNE DEĞİL, PARALEL DİZİ.
   *
   * Önceki hâl öğe başına bir süs NESNESİ ayırıyordu. 5.000 görevde bu, her
   * çizimde 5.000 kısa ömürlü nesne demek; ölçümde kare süresindeki
   * dalgalanmanın (12,6-15,9 ms) başlıca kaynağı çöp toplamaydı. Sayılar
   * tipli dizilere, konumlar bir tamsayı dizisine taşındı — sıralanan artık
   * KONUMLAR, nesneler değil.
   *
   * Sıra tanımı zerre değişmedi: tarihli önce, sonra tarih, sonra öncelik,
   * sonra oluşturma zamanı, sonra girdi sırası. Testler bunu kilitliyor. */
  const idx = new Array(n);
  const due = new Array(n);
  const prio = new Uint8Array(n);
  const born = new Float64Array(n);
  for (let i = 0; i < n; i++){
    const t = list[i];
    idx[i] = i;
    due[i] = t.dueDate || "";
    prio[i] = PRIO_ORDER.hasOwnProperty(t.priority) ? PRIO_ORDER[t.priority] : 3;
    born[i] = ts(t.createdAt);
  }
  idx.sort((a, b) => {
    const da = due[a], db = due[b];
    const ha = da !== "", hb = db !== "";
    if (ha !== hb) return ha ? -1 : 1;
    if (ha && da !== db) return da < db ? -1 : 1;
    if (prio[a] !== prio[b]) return prio[a] - prio[b];
    if (born[a] !== born[b]) return born[a] - born[b];
    return a - b;                        // kararlılık: girdi sırası bozulmasın
  });
  for (let i = 0; i < n; i++) out[i] = list[idx[i]];
  return out;
}

function uid(){
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

