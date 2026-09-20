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
 *  paylaşınca hangisinin taşınacağı tanımsızdır. Hata vermek tek dürüst yol. */
function assertUniqueKeys(keys, which){
  const seen = new Set();
  for (const k of keys){
    if (seen.has(k)) throw new Error(`list-diff: ${which} listede yinelenen anahtar: ${String(k)}`);
    seen.add(k);
  }
}

/** seq içindeki (negatif olmayan) değerlerin en uzun artan altdizisine ait
 *  KONUMLARI döndürür. O(n log n), öncül dizisiyle geri kurulum. */
function lisPositions(seq){
  const prev = new Array(seq.length).fill(-1);
  const tails = [];                       // her uzunluk için en küçük son konum
  for (let i = 0; i < seq.length; i++){
    const v = seq[i];
    if (v < 0) continue;                  // listede yeni olan eleman zincire giremez
    let lo = 0, hi = tails.length;
    while (lo < hi){
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]] < v) lo = mid + 1; else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1];
    if (lo === tails.length) tails.push(i); else tails[lo] = i;
  }
  const keep = new Set();
  let k = tails.length ? tails[tails.length - 1] : -1;
  while (k >= 0){ keep.add(k); k = prev[k]; }
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
  assertUniqueKeys(newKeys, "yeni");

  const oldIndex = new Map();
  for (let i = 0; i < oldKeys.length; i++) oldIndex.set(oldKeys[i], i);
  const newSet = new Set(newKeys);

  const ops = [];
  for (const k of oldKeys) if (!newSet.has(k)) ops.push({ type: "remove", key: k });

  const seq = newKeys.map(k => oldIndex.has(k) ? oldIndex.get(k) : -1);
  const keep = lisPositions(seq);

  for (let i = newKeys.length - 1; i >= 0; i--){
    if (keep.has(i)) continue;
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
