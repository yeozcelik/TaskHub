/* --------------------------------------------------------- liste farkı ---
 * Anahtarlı liste uzlaştırma. Girdi iki anahtar dizisi, çıktı bir YAMA listesi.
 * DOM'a dokunmaz — uygulaması çağıranın işi, burada yalnız "ne değişti" var.
 *
 * Neden var: renderList() bugün her çizimde kabı boşaltıp baştan kuruyor.
 * Bu, arama kutusuna basılan her tuşta bütün kartların atılıp yeniden
 * yaratılması demek; 5.000 görevde gözle görülür takılma ve odak kaybı.
 *
 * Neden EN UZUN ARTAN ALTDİZİ (LIS): saf bir "sırayla yürü, yerinde değilse
 * taşı" yaklaşımı bir elemanı başa alınca kalan 999'un hepsini taşır. LIS,
 * yerinde kalabilecek en büyük kümeyi bulur; taşınan eleman sayısı
 * n - |LIS| olur ve bu EN AZ mümkün taşıma sayısıdır. 1.000 elemanlı listede
 * tek eleman yer değiştirdiğinde yama tek bir "move"dur.                    */

/** Yinelenen anahtar sessizce yanlış çizime yol açar: iki düğüm aynı kimliği
 *  paylaşınca hangisinin taşınacağı tanımsızdır. Hata vermek tek dürüst yol.
 *
 *  Kurduğu kümeyi DÖNDÜRÜR: çağıran zaten "bu anahtar yeni listede var mı"
 *  diye soracak. İki ayrı 5.000 elemanlı küme kurmanın anlamı yok. */
function assertUniqueKeys(keys, which){
  const seen = new Set();
  for (const k of keys){
    if (seen.has(k)) throw new Error(`list-diff: ${which} listede yinelenen anahtar: ${String(k)}`);
    seen.add(k);
  }
  return seen;
}

/** seq içindeki (negatif olmayan) değerlerin en uzun artan altdizisine ait
 *  KONUMLARI döndürür. O(n log n), öncül dizisiyle geri kurulum. */
/*  TİPLİ DİZİLER: `seq`, `prev` ve `keep` konum tutar, yani tamsayı. Kutulu
 *  JS dizisi yerine Int32Array/Uint8Array kullanmak 5.000 elemanda üç ayrı
 *  kutulu dizi ve bir Set ayırmayı ortadan kaldırıyor — fark hesabı çizimin
 *  bloklayan payındaki en büyük kalemdi. Algoritma ve çıktı aynı. */
function lisPositions(seq){
  const n = seq.length;
  const prev = new Int32Array(n).fill(-1);
  const tails = new Int32Array(n);        // her uzunluk için en küçük son konum
  let nt = 0;
  for (let i = 0; i < n; i++){
    const v = seq[i];
    if (v < 0) continue;                  // listede yeni olan eleman zincire giremez
    let lo = 0, hi = nt;
    while (lo < hi){
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < v) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    tails[lo] = i;
    if (lo === nt) nt++;
  }
  const keep = new Uint8Array(n);
  let k = nt ? tails[nt - 1] : -1;
  while (k >= 0){ keep[k] = 1; k = prev[k]; }
  return keep;
}

/** İki anahtar dizisi → yapısal yama.
 *
 *  Dönen işlemler UYGULAMA SIRASINDADIR: önce bütün "remove"lar, sonra
 *  insert/move işlemleri SAĞDAN SOLA. Sağdan sola olması `before` alanını
 *  güvenilir kılar: i konumu işlenirken i+1 zaten yerine oturmuştur.
 *
 *  before === null → kabın sonuna ekle.                                     */
function diffChildren(oldKeys, newKeys){
  assertUniqueKeys(oldKeys, "eski");
  const newSet = assertUniqueKeys(newKeys, "yeni");

  const oldIndex = new Map();
  for (let i = 0; i < oldKeys.length; i++) oldIndex.set(oldKeys[i], i);

  const ops = [];
  for (const k of oldKeys) if (!newSet.has(k)) ops.push({ type: "remove", key: k });

  const n = newKeys.length;
  const seq = new Int32Array(n);
  for (let i = 0; i < n; i++){
    const at = oldIndex.get(newKeys[i]);
    seq[i] = at === undefined ? -1 : at;
  }
  const keep = lisPositions(seq);

  for (let i = n - 1; i >= 0; i--){
    if (keep[i]) continue;
    ops.push({
      type: seq[i] < 0 ? "insert" : "move",
      key: newKeys[i],
      before: i + 1 < newKeys.length ? newKeys[i + 1] : null,
    });
  }
  return ops;
}

/** Yapısal yamaya İÇERİK güncellemelerini de ekler.
 *
 *  "update" yalnız iki listede de bulunan ve isEqual'ın farklı dediği
 *  elemanlar için üretilir — yani yama yine O(değişen) kalır, O(toplam) değil.
 *  Taşınmak ve değişmek birbirinden bağımsızdır: bir eleman hem move hem
 *  update alabilir.                                                         */
function diffList(oldItems, newItems, keyOf, isEqual){
  const ops = diffChildren(oldItems.map(keyOf), newItems.map(keyOf));
  const oldByKey = new Map();
  for (const it of oldItems) oldByKey.set(keyOf(it), it);

  for (const it of newItems){
    const k = keyOf(it);
    if (!oldByKey.has(k)) continue;                       // yeni eleman: insert yeter
    if (!isEqual(oldByKey.get(k), it)) ops.push({ type: "update", key: k, item: it });
  }
  return ops;
}
