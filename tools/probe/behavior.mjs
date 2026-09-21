#!/usr/bin/env node
/* Görev listesinin DOM davranışı — gerçek tarayıcıda.
 *
 * `node --test` saf fonksiyonları, `verify.mjs` iddia setini kanıtlar.
 * İkisi de uzlaştırıcının DOĞRU ÇİZDİĞİNİ kanıtlamaz. Bu koşum onu kanıtlar,
 * özellikle T2.2'nin en riskli kabul ölçütünü: filtre değişince ODAK KAYBOLMAZ.
 *
 * GÖNDERİLEN ÜRÜNÜN PARÇASI DEĞİLDİR. */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "./chrome.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const flag = n => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };

const SEED = `(() => {
  state.tasks = [
    { id:"a", title:"alfa rapor",  notes:"", dueDate:"2026-05-10", priority:"high", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"beta rapor",  notes:"", dueDate:"2026-05-10", priority:"low",  tags:[],     subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"gama İstanbul", notes:"", dueDate:null,       priority:"med",  tags:[],     subtasks:[], done:false, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:null, sourceNoteId:null },
  ];
  today = "2026-05-10";
  ui.q = ""; render();
  return true;
})()`;

/* Erişilebilir ad artık .card-open üzerinde: <li> düz liste öğesi (T2.8). */
const ids = 'Array.from(document.querySelectorAll("#list .card .card-open")).map(n => n.getAttribute("aria-label"))';

const checks = [];
const check = (name, actual, expected) => checks.push({ name, actual, expected,
  pass: JSON.stringify(actual) === JSON.stringify(expected) });

await withPage(`file://${resolve(ROOT, "index.html")}`, async evaluate => {
  const ev = async expr => { const r = await evaluate(expr); if (r.error) throw new Error(expr + "\n  → " + r.error); return r.value; };

  /* Sabit `setTimeout` yerine KOŞUL BEKLE. Görünüm geçişleri geri çağrıyı bir
     sonraki kareye erteliyor; "30 ms yeter" varsayımı yarışa açık ve gerçekten
     de yarıştı. Koşul beklemek hem daha hızlı hem daha sağlam. */
  /* Görünüm geçişi SÜRERKEN sayfa tıklanamaz: anlık görüntüler üst katmanda
     ve `elementFromPoint` kökü döndürür. İşaretçi sınamaları bunu beklemek
     zorunda — beklemeyince "bırakma hedefi yok" gibi görünüyordu. */
  const gecisBitsin = async () => bekle(`!document.documentElement
    .getAnimations({ subtree: true })
    .find(a => a.effect && a.effect.pseudoElement && /view-transition/.test(a.effect.pseudoElement))
    && (document.elementFromPoint(20, 20) || {}).tagName !== "HTML"`);

  const bekle = async (expr, ms = 2000) => {
    const bitis = Date.now() + ms;
    for (;;){
      if (await ev("!!(" + expr + ")")) return true;
      if (Date.now() > bitis) return false;
      await ev(`new Promise(r => requestAnimationFrame(r))`);
    }
  };

  await ev(SEED);

  check("üç görev çizildi", await ev(ids), ["alfa rapor", "beta rapor", "gama İstanbul"]);

  // Grup içi sıra sortTasks ile aynı olmalı: aynı tarih → öncelik (high önce).
  check("grup içi sıra: yüksek öncelik önde",
    await ev(`Array.from(document.querySelectorAll("#g-today .card .card-open")).map(n => n.getAttribute("aria-label"))`),
    ["alfa rapor", "beta rapor"]);

  // Türkçe harf katlamalı arama listede de geçerli.
  await ev(`ui.q = "istanbul"; renderList();`);
  check('arama "istanbul" → "İstanbul"u bulur', await ev(ids), ["gama İstanbul"]);

  // --- ASIL SINAMA: odak korunumu ---
  await ev(`ui.q = ""; renderList();`);
  await ev(`document.querySelector('#list .card-open[aria-label="beta rapor"]').focus();`);
  check("odak karta yerleşti", await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor");
  check("T2.8: odaklanan öğe başlık DÜĞMESİ, <li> değil",
    await ev(`[document.activeElement.tagName, document.activeElement.className]`), ["BUTTON", "card-open"]);

  // Klavye gerilemedi: Enter paneli açar (düğmenin yerel davranışı).
  await ev(`(() => { document.activeElement.dispatchEvent(new MouseEvent("click", { bubbles:true, cancelable:true }));
    return true; })()`);
  check("T2.8: Enter/tıklama paneli açıyor", await ev(`openTaskId`), "b");
  await ev(`closePanel(); document.querySelector('#list .card-open[aria-label="beta rapor"]').focus(); true`);

  // Kartın İÇERİĞİ değişsin (imza değişir → kart yeniden kurulur).
  await ev(`state.tasks.find(t => t.id === "b").title = "beta rapor (güncel)"; renderList();`);
  check("içerik güncellendikten sonra odak KORUNDU",
    await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor (güncel)");

  // Onay kutusuna odaklanıp içerik değiştir: yuva da korunmalı.
  await ev(`document.querySelector('#list .card-open[aria-label="alfa rapor"]').closest(".card").querySelector(".check").focus();`);
  await ev(`state.tasks.find(t => t.id === "a").title = "alfa rapor v2"; renderList();`);
  check("odak YUVASI korundu (onay kutusu)",
    await ev(`document.activeElement.className`), "check");

  // Sıralama değişince (taşıma yolu) odak kaybolmamalı.
  await ev(`document.querySelector('#list .card-open[aria-label="beta rapor (güncel)"]').focus();`);
  await ev(`state.tasks.find(t => t.id === "b").priority = "high"; state.tasks.find(t => t.id === "a").priority = "low"; renderList();`);
  check("taşımadan sonra sıra değişti",
    await ev(`Array.from(document.querySelectorAll("#g-today .card .card-open")).map(n => n.getAttribute("aria-label"))`),
    ["beta rapor (güncel)", "alfa rapor v2"]);
  check("taşımadan sonra odak hâlâ aynı kartta",
    await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor (güncel)");

  // Kova değişimi: tamamlanan görev "completed" grubuna düşmeli.
  await ev(`state.tasks.find(t => t.id === "c").done = true; renderList();`);
  check("tamamlanan görev completed kovasına taşındı",
    await ev(`Array.from(document.querySelectorAll("#g-completed .card .card-open")).map(n => n.getAttribute("aria-label"))`),
    ["gama İstanbul"]);

  // Odak listeden BAŞKA bir yere gittiyse geri çalınmamalı. Bu, düzeltmenin
  // kendisinden daha sinir bozucu bir hata olurdu: kullanıcı arama kutusuna
  // geçer, bir çizim tetiklenir ve imleç karta geri fırlar.
  await ev(`document.querySelector('#list .card').focus();`);
  await ev(`document.getElementById("q").focus(); state.tasks[0].title = "alfa v3"; renderList();`);
  check("odak arama kutusundayken ÇALINMAZ", await ev(`document.activeElement.id`), "q");

  // ---------------- T2.5: hızlı ekleme + doğal dil yakalama ----------------
  await ev(`today = "2026-05-10"; ui.q = ""; renderList();`);
  const hintHidden = `document.getElementById("captureHint").hidden`;

  // S8 (Things vetosu): hiçbir şey tanınmazsa yeni kontrol GÖRÜNMEZ.
  await ev(`renderCaptureHint("sadece düz bir görev");`);
  check("S8: tanınan yoksa önizleme gizli", await ev(hintHidden), true);

  await ev(`renderCaptureHint("yarın rapor yaz !p1 #iş");`);
  check("tanınınca önizleme belirir", await ev(hintHidden), false);
  check("üç çip çizildi",
    await ev(`document.querySelectorAll("#captureHint .cap-chip").length`), 3);
  check("çiplerin türleri doğru",
    await ev(`Array.from(document.querySelectorAll("#captureHint .cap-chip")).map(n => n.className.split(" ")[1])`),
    ["cap-date", "cap-priority", "cap-tag"]);

  // Enter: görev yapılandırılmış hâlde düşer.
  await ev(`state.tasks = []; submitQuickAdd("yarın rapor yaz !p1 #iş"); true;`);
  check("görev ayrıştırılmış alanlarla oluştu",
    await ev(`(() => { const x = state.tasks[0]; return [x.title, x.dueDate, x.priority, x.tags.join()]; })()`),
    ["rapor yaz", "2026-05-11", "high", "iş"]);

  // Çip reddi: alan uygulanmaz, metin YERİNDE kalır.
  await ev(`captureIgnored.clear(); document.getElementById("quick").value = "yarın rapor !p1"; renderCaptureHint("yarın rapor !p1");`);
  await ev(`document.querySelector("#captureHint .cap-date").click();`);
  check("reddedilen tarih için geri-al çipi çıktı",
    await ev(`!!document.querySelector("#captureHint .cap-off")`), true);
  await ev(`state.tasks = []; submitQuickAdd("yarın rapor !p1"); true;`);
  check("reddedilen tarih uygulanmadı, metin başlıkta kaldı",
    await ev(`(() => { const x = state.tasks[0]; return [x.title, x.dueDate, x.priority]; })()`),
    ["yarın rapor", null, "high"]);

  // Sessiz kayıp yok: saat notu görünür.
  await ev(`captureIgnored.clear(); renderCaptureHint("yarın 15:00 toplantı");`);
  check("saat için açıklama notu gösterildi",
    await ev(`Array.from(document.querySelectorAll("#captureHint .cap-note")).some(n => n.textContent.includes("15:00"))`), true);

  // Nottan görev yapma yolu ayrıştırılmamalı: not metnindeki "yarın" emir değildir.
  await ev(`state.tasks = []; addTask("yarın toplantı notu"); true;`);
  check("addTask düz metinle ayrıştırma yapmaz",
    await ev(`(() => { const x = state.tasks[0]; return [x.title, x.dueDate]; })()`),
    ["yarın toplantı notu", null]);

  await ev(`captureIgnored.clear(); state.tasks = [
    { id:"a", title:"alfa v3", notes:"", dueDate:"2026-05-10", priority:"low", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"beta rapor (güncel)", notes:"", dueDate:"2026-05-10", priority:"high", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"gama İstanbul", notes:"", dueDate:null, priority:"med", tags:[], subtasks:[], done:true, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:"2026-01-03T00:00:00.000Z", sourceNoteId:null },
  ]; renderList();`);

  // ------------------- T2.6 / T2.7: komut paleti -------------------
  const key = (t, k, mods) => `document.${t}.dispatchEvent(new KeyboardEvent("keydown", Object.assign({ key:${JSON.stringify(k)}, bubbles:true, cancelable:true }, ${JSON.stringify(mods || {})})))`;

  await ev(`switchView("tasks"); document.getElementById("quick").focus();`);
  check("palet başlangıçta DOM'da yok (S8: tembel kurulum)",
    await ev(`!document.getElementById("palette")`), true);

  await ev(key("documentElement", "k", { ctrlKey: true }));
  check("Ctrl+K paleti açar", await ev(`!!document.querySelector("dialog.palette[open]")`), true);
  check("odak palet girdisinde", await ev(`document.activeElement.id`), "palQ");
  check("erişilebilirlik rolleri yerinde",
    await ev(`(() => { const i = document.getElementById("palQ"), l = document.getElementById("palList");
      return [i.getAttribute("role"), l.getAttribute("role"), l.firstChild.getAttribute("role"),
              document.getElementById("palette").hasAttribute("open")]; })()`),
    ["combobox", "listbox", "option", true]);

  check("ilk seçenek seçili ve duyuruluyor",
    await ev(`[document.querySelector(".pal-item.on").getAttribute("aria-selected"),
               document.getElementById("palQ").getAttribute("aria-activedescendant")]`),
    ["true", "palOpt0"]);

  // Türkçe harf katlamalı süzme.
  await ev(`document.getElementById("palQ").value = "gorunum"; renderPaletteList();`);
  check("ASCII yazımı Türkçe komutu bulur",
    await ev(`document.querySelectorAll(".pal-item").length >= 1 &&
              document.querySelector(".pal-item .pal-label").textContent.includes("Görünüm")`), true);

  await ev(`document.getElementById("palQ").value = "zzzzz"; renderPaletteList();`);
  check("eşleşme yoksa boş mesaj", await ev(`!!document.querySelector(".pal-empty")`), true);

  // Ok tuşlarıyla gezinme.
  await ev(`document.getElementById("palQ").value = ""; renderPaletteList();`);
  await ev(key("getElementById('palQ')", "ArrowDown"));
  check("ArrowDown seçimi ilerletir", await ev(`document.getElementById("palQ").getAttribute("aria-activedescendant")`), "palOpt1");
  await ev(key("getElementById('palQ')", "ArrowUp"));
  await ev(key("getElementById('palQ')", "ArrowUp"));
  check("ArrowUp uçta sarar",
    await ev(`document.getElementById("palQ").getAttribute("aria-activedescendant") === "palOpt" + (document.querySelectorAll(".pal-item").length - 1)`), true);

  // Enter komutu çalıştırır.
  await ev(`document.getElementById("palQ").value = "gorunum notlar"; renderPaletteList();`);
  await ev(key("getElementById('palQ')", "Enter"));
  await bekle(`ui.view === "notes"`);
  check("Enter komutu çalıştırdı (notlar görünümüne geçildi)", await ev(`ui.view`), "notes");
  check("çalıştırınca palet kapandı", await ev(`!document.querySelector("dialog.palette[open]")`), true);

  // Bağlam duyarlılığı: notlar görünümünde CSV yok, notlar dışa aktarma var.
  const listed = `(() => { const q = document.getElementById("palQ"); q.value = ""; renderPaletteList();
    return paletteItems.map(c => c.id); })()`;
  await ev(key("documentElement", "k", { ctrlKey: true }));
  const inNotes = await ev(listed);
  check("notlar görünümünde CSV komutu listelenmez", inNotes.includes("export.csv"), false);
  check("notlar görünümünde not dışa aktarma listelenir", inNotes.includes("export.notes"), true);
  check("notlar görünümünde yeni sayfa listelenir", inNotes.includes("page.new"), true);

  await ev(`closePalette(); switchView("tasks");`);
  await ev(key("documentElement", "k", { ctrlKey: true }));
  const inTasks = await ev(listed);
  check("görevler görünümünde CSV listelenir", inTasks.includes("export.csv"), true);
  check("görevler görünümünde not dışa aktarma listelenmez", inTasks.includes("export.notes"), false);

  // Esc kapatır ve paneli kapatmaya kaymaz.
  await ev(key("documentElement", "k", { ctrlKey: true }));
  await ev(`closePalette();`);
  check("Esc/kapatma sonrası palet kapalı", await ev(`!document.querySelector("dialog.palette[open]")`), true);

  // S6: envanter. Bir komut kaldırılırsa CI kırılır.
  const EXPECTED = ["view.tasks","view.notes","taskview.list","taskview.board","taskview.calendar",
    "sel.all","sel.clear","bulk.done","bulk.undone","bulk.due.today","bulk.due.clear","bulk.delete",
    "task.new","search.focus","filters.clear",
    "completed.toggle","notebook.new","page.new","theme.cycle","lang.toggle",
    "export.json","import.json","export.csv","export.notes","print"];
  const registered = await ev(`COMMANDS.map(c => c.id).sort()`);
  check("S6: kayıtlı komut envanteri eksiksiz", registered, EXPECTED.slice().sort());

  await ev(`switchView("tasks");`);

  // ---------------- S11: eski veri okunur kalır (gerçek süzgeçle) ----------
  // Node'da sınanamaz: sanitizeHtml document.implementation ister ve DOM'suz
  // ortamda hatayı yutup "" döner — test yanlışlıkla "geçer" görünürdü.
  const legacy = await ev(`(() => {
    const p = normalizeNotePage({ id:"p1", title:"Eski sayfa", html:"<p>Merhaba <b>dünya</b></p>" });
    return { n: p.boxes.length, html: p.boxes[0] && p.boxes[0].html, title: p.title,
             x: p.boxes[0] && p.boxes[0].x };
  })()`);
  check("S11: eski `html` alanı ilk kutuya dönüştü", [legacy.n, legacy.title], [1, "Eski sayfa"]);
  check("S11: eski içerik ve biçim korundu",
    [legacy.html.includes("Merhaba"), legacy.html.includes("<b>")], [true, true]);
  check("S11: dönüşen kutu tuvalde konumlandı", typeof legacy.x === "number", true);

  const legacyEvil = await ev(`(() => {
    const p = normalizeNotePage({ id:"p", title:"t", html:'<p>iyi<scr'+'ipt>alert(1)<\/scr'+'ipt></p>' });
    return p.boxes[0] ? p.boxes[0].html : "";
  })()`);
  check("S11: eski kayıttaki betik de süzgeçten geçer",
    [legacyEvil.includes("script"), legacyEvil.includes("iyi")], [false, true]);

  const v1 = await ev(`(() => {
    const n = normalizeNotes({ version:1, notebooks:[{ id:"nb1", name:"İş", color:"#5b5bd6", pages:[
      { id:"pg1", title:"Toplantı", html:"<p>not</p>" },
      { id:"pg2", title:"Fikirler", boxes:[{ id:"b1", x:40, y:60, w:400, html:"<p>x</p>" }] },
    ]}]});
    const nb = n.notebooks[0];
    return [n.notebooks.length, nb.name, nb.pages.length, nb.pages[0].boxes.length, nb.pages[1].boxes[0].x];
  })()`);
  check("S11: v1 defter yapısı kayıpsız yüklendi", v1, [1, "İş", 2, 1, 40]);

  // ---------------- T3.1 / T3.2: depolama adaptörleri ----------------
  // Sözleşme: her adaptörde şunlar VAR. `setSync` ise İSTEĞE BAĞLIDIR ve
  // yokluğu, kapanış günlüğü yolunun gerekli olduğunun işaretidir.
  const adapter = await ev(`(() => {
    const req = ["name","available","get","set","remove","estimate"];
    return req.map(k => typeof storage[k]);
  })()`);
  check("adaptör zorunlu arayüzü karşılıyor", adapter,
    ["string", "function", "function", "function", "function", "function"]);

  check("T3.2: bu tarayıcıda IndexedDB seçildi", await ev(`storageKind`), "indexedDB");
  check("T3.2: IndexedDB'nin setSync'i YOK (bilinçli)", await ev(`typeof storage.setSync`), "undefined");
  check("T3.2: localStorage'ın setSync'i VAR (günlüğün yazılacağı yer)",
    await ev(`typeof localStore.setSync`), "function");
  check("T3.2: her iki adaptörde de atomik çoklu yazma var",
    await ev(`[typeof storage.setMany, typeof localStore.setMany]`), ["function", "function"]);

  const roundtrip = await ev(`(async () => {
    await storage.set("__t3_1_test__", "değer-ü-ş");
    const got = await storage.get("__t3_1_test__");
    await storage.remove("__t3_1_test__");
    const after = await storage.get("__t3_1_test__");
    return [got, after];
  })()`);
  check("T3.1: adaptör yaz/oku/sil turu", roundtrip, ["değer-ü-ş", null]);

  check("T3.1: kanca modül yüklenirken DEĞİL, açıkça kuruluyor",
    await ev(`typeof installStorageHooks === "function" && typeof flushAllSync === "function"`), true);

  // Kalıcılık gerçekten çalışıyor mu — adaptörün arkasından geçerek.
  const persisted = await ev(`(async () => {
    state.tasks = [{ id:"kalici", title:"kalıcı görev", notes:"", dueDate:null, priority:"high",
      tags:["t"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null }];
    await saveNow();
    const raw = await storage.get(STORAGE_KEY);
    const back = normalizeState(JSON.parse(raw));
    return [back.tasks.length, back.tasks[0].title, back.tasks[0].priority];
  })()`);
  check("T3.1: kaydedilen görev geri okunduğunda aynı", persisted, [1, "kalıcı görev", "high"]);

  // ---------------- T3.2: kapanış günlüğü ----------------
  const journal = await ev(`(async () => {
    state.tasks = [{ id:"j1", title:"günlük görevi", notes:"", dueDate:null, priority:"med",
      tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null }];
    scheduleSave();                 // bekleyen yazma oluştur
    flushAllSync();                 // kapanış yolunu taklit et
    const raw = await localStore.get(JOURNAL_KEY);
    return raw ? JSON.parse(raw) : null;
  })()`);
  check("T3.2: kapanışta senkron günlük yazıldı", !!journal && typeof journal.state === "string", true);
  check("T3.2: günlük gerçek durumu taşıyor",
    journal ? JSON.parse(journal.state).tasks[0].title : null, "günlük görevi");

  const replay = await ev(`(async () => {
    // Depoyu kasten eskit, sonra günlüğü oynat.
    await storage.set(STORAGE_KEY, JSON.stringify({ version:1, settings:{}, tasks:[] }));
    const r = await replayJournal();
    const back = normalizeState(JSON.parse(await storage.get(STORAGE_KEY)));
    const left = await localStore.get(JOURNAL_KEY);
    return { replayed: !!r, titles: back.tasks.map(t => t.title), left };
  })()`);
  check("T3.2: günlük oynatıldı ve daha yeni veri kazandı",
    [replay.replayed, replay.titles], [true, ["günlük görevi"]]);
  check("T3.2: oynatıldıktan sonra günlük silindi", replay.left, null);

  check("T3.2: günlük yokken oynatma sessizce hiçbir şey yapmaz",
    await ev(`replayJournal().then(r => r === null)`), true);

  // ---------------- T3.5: takvim görünümü ----------------
  await ev(`state.settings.lang = "tr"; ui.calYm = { y:2026, m:4 }; today = "2026-05-10";
    state.tasks = [
      { id:"c1", title:"onda", notes:"", dueDate:"2026-05-10", priority:"high", tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
      { id:"c2", title:"onbeşte", notes:"", dueDate:"2026-05-15", priority:"low", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
      { id:"c3", title:"tarihsiz", notes:"", dueDate:null, priority:"med", tags:[], subtasks:[], done:false, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    ]; switchTaskView("calendar"); true`);

  // Mayıs 2026: 1'i cuma, pazartesi başlangıçla 4 boşluk + 31 gün = 35 hücre
  // = tam 5 hafta. Sayıyı sabitlemek yerine ilişkiyi iddia etmek daha sağlam.
  check("takvim: tam haftalar çizildi",
    await ev(`(() => { const rows = document.querySelectorAll(".cal-grid .cal-row:not(.cal-names)");
      const cells = document.querySelectorAll(".cal-grid .cal-day").length;
      return [cells % 7 === 0, cells / 7 === rows.length,
              Array.from(rows).every(r => r.children.length === 7)]; })()`), [true, true, true]);
  check("takvim: ayın her günü tam bir kez",
    await ev(`(() => { const inMonth = Array.from(document.querySelectorAll(".cal-day:not(.out)")).map(n => n.dataset.ymd);
      return [inMonth.length, new Set(inMonth).size]; })()`), [31, 31]);
  check("takvim: TR'de hafta pazartesi başlar",
    await ev(`document.querySelector(".cal-row:not(.cal-names) .cal-day").getAttribute("data-ymd")`), "2026-04-27");
  check("takvim: görev kendi gününde",
    await ev(`Array.from(document.querySelector('.cal-day[data-ymd="2026-05-10"]').querySelectorAll(".cal-chip-t")).map(n => n.textContent)`),
    ["onda"]);
  check("takvim: bugün işaretli",
    await ev(`document.querySelector('.cal-day[data-ymd="2026-05-10"]').classList.contains("today")`), true);
  check("takvim: TARİHSİZ görev gizlenmez, şeritte görünür",
    await ev(`Array.from(document.querySelectorAll(".cal-undated .cal-chip-t")).map(n => n.textContent)`),
    ["tarihsiz"]);
  check("takvim: hücre ekran okuyucuda tarihiyle adlı",
    await ev(`document.querySelector('.cal-day[data-ymd="2026-05-10"]').getAttribute("aria-label").includes("2026")`), true);
  check("takvim: ızgara rolleri",
    await ev(`[document.querySelector(".cal-grid").getAttribute("role"),
               document.querySelector(".cal-day").getAttribute("role"),
               document.querySelector(".cal-name").getAttribute("role")]`),
    ["grid", "gridcell", "columnheader"]);

  // Izgarada tek sekme durağı: 42 durak klavye kullanıcısını boğardı.
  check("takvim: ızgarada tek sekme durağı",
    await ev(`document.querySelectorAll('.cal-day[tabindex="0"]').length`), 1);

  // Ay gezinme
  await ev(`calShift(1);`);
  check("takvim: sonraki ay", await ev(`[ui.calYm.y, ui.calYm.m]`), [2026, 5]);
  await ev(`calShift(-2);`);
  check("takvim: önceki ay", await ev(`[ui.calYm.y, ui.calYm.m]`), [2026, 3]);
  await ev(`calToday();`);
  check("takvim: bugüne dön", await ev(`ui.calYm`), null);

  // Klavyeyle gezinme ve ay sınırını geçme
  await ev(`ui.calYm = { y:2026, m:4 }; renderList();
    const c = document.querySelector('.cal-day[data-ymd="2026-05-31"]'); c.setAttribute("tabindex","0"); c.focus();
    c.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowRight", bubbles:true, cancelable:true })); true`);
  check("takvim: ok tuşu ay sınırını geçince ay değişir",
    await ev(`[ui.calYm.y, ui.calYm.m]`), [2026, 5]);
  check("takvim: odak yeni güne taşındı",
    await ev(`document.activeElement.getAttribute("data-ymd")`), "2026-06-01");

  // Notion yasası: aynı veri, filtre geçerli
  await ev(`ui.calYm = { y:2026, m:4 }; ui.q = "onda"; renderList();`);
  check("takvim: arama takvimde de geçerli",
    await ev(`document.querySelectorAll(".cal-grid .cal-chip").length`), 1);
  await ev(`ui.q = ""; renderList();`);

  // Çipe tıklamak paneli açar
  await ev(`document.querySelector('.cal-day[data-ymd="2026-05-10"] .cal-chip').click();`);
  check("takvim: çip görev panelini açar", await ev(`openTaskId`), "c1");
  await ev(`closePanel(); switchTaskView("list"); ui.calYm = null; true`);

  // Bu blok state'i değiştirdi; sonraki iddiaların beklediği düzeni geri kur.
  await ev(`state.tasks = [
    { id:"a", title:"alfa v3", notes:"", dueDate:"2026-05-10", priority:"low", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"beta rapor (güncel)", notes:"", dueDate:"2026-05-10", priority:"high", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"gama İstanbul", notes:"", dueDate:null, priority:"med", tags:[], subtasks:[], done:true, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:"2026-01-03T00:00:00.000Z", sourceNoteId:null },
  ]; ui.q = ""; renderList();`);

  // ---------------- S8: kalıcı kontrol ENVANTERİ ----------------
  // S8 önce "sayı artmaz" diye yazılmıştı. Ölçünce görüldü ki kenar çubuğu
  // sayısı ETİKET SAYISINA göre değişiyor — veriye bağlı bir sayı, kapı
  // olamaz. Yerine ADLANDIRILMIŞ envanter: her ekleme bu listeyi düzenlemeyi
  // gerektirir, yani görünür ve gözden geçirilebilir bir eylem olur.
  await ev(`switchTaskView("list"); ui.q = ""; clearFilters(); true`);
  const chrome = await ev(`(() => {
    const TERMS = ["button","input","select","[role=button]"];
    const inside = sel => {
      const q = TERMS.map(t => sel + " " + t).join(",");
      /* KALICI ARAYÜZ ile İÇERİK ayrımı. Dışarıda bırakılanların hepsi
         veriye bağlı: kart düğmeleri, etiket süzgeçleri, "tamamlananları
         katla" başlığı, şerit eylemleri. Bunlar veri geldikçe çoğalır;
         sayılarını sabitlemek kapıyı kırılgan yapardı. S8'in derdi bunlar
         değil, ekranın KALICI iskeletinin sessizce büyümesi. */
      return Array.from(document.querySelectorAll(q))
        .filter(n => !n.closest("#list") && !n.closest(".banner") && n.type !== "file")
        .map(n => n.id || String(n.className).split(" ")[0] || n.tagName);
    };
    return {
      topbar: inside(".topbar"),
      sidebarGroups: Array.from(document.querySelectorAll(".sidebar .side-title")).map(n => n.textContent),
      mainChrome: inside(".main").filter(x => x !== "side-item"),
    };
  })()`);
  check("S8: üst çubuk envanteri", chrome.topbar,
    ["tab", "tab", "q", "themeBtn", "btn", "btn", "btn", "expCsv"]);
  check("S8: kenar çubuğu grupları", chrome.sidebarGroups,
    ["Görünüm", "Durum", "Öncelik", "Etiketler"]);
  check("S8: ana alanda yalnız hızlı ekleme", chrome.mainChrome, ["quick", "btn"]);

  // ---------------- T3.4: pano görünümü ----------------
  await ev(`state.tasks = [
    { id:"h1", title:"yüksek bir", notes:"", dueDate:"2026-05-10", priority:"high", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"m1", title:"orta bir", notes:"", dueDate:null, priority:"med", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"d1", title:"biten iş", notes:"", dueDate:null, priority:"high", tags:[], subtasks:[], done:true, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:"2026-01-03T00:00:00.000Z", sourceNoteId:null },
  ]; render(); true`);

  await ev(`switchTaskView("board"); true`);
  check("pano: dört sütun (üç öncelik + tamamlananlar)",
    await ev(`Array.from(document.querySelectorAll("#list .group")).map(n => n.querySelector("ul").id)`),
    ["g-high", "g-med", "g-low", "g-completed"]);
  check("pano: tamamlanmış görev öncelik sütununda DEĞİL",
    await ev(`[document.querySelectorAll("#g-high .card").length, document.querySelectorAll("#g-completed .card").length]`),
    [1, 1]);
  check("pano: sütunlar ekran okuyucuda adlı",
    await ev(`Array.from(document.querySelectorAll("#list .group")).map(n => n.getAttribute("aria-label"))`),
    ["Yüksek", "Orta", "Düşük", "Tamamlananlar"]);
  check("pano: boş sütun kaybolmaz",
    await ev(`document.querySelectorAll("#g-low").length`), 1);

  // Notion yasası: aynı veri. Filtre panoda da geçerli.
  await ev(`ui.q = "yüksek"; renderList();`);
  check("pano: arama panoda da geçerli",
    await ev(`document.querySelectorAll("#list .card").length`), 1);
  await ev(`ui.q = ""; renderList();`);

  // Panoda yapılan değişiklik listede görünür — tek veri kaynağı.
  await ev(`toggleDone("m1", true); switchTaskView("list"); true`);
  check("panoda tamamlanan görev listede de tamamlanmış",
    await ev(`state.tasks.find(t => t.id === "m1").done`), true);
  await ev(`toggleDone("m1", false); true`);

  // Kart bileşeni paylaşılıyor: aynı DOM, farklı düzen.
  await ev(`switchTaskView("board"); true`);
  check("pano ve liste AYNI kart bileşenini kullanır",
    await ev(`!!document.querySelector("#list.board .card .card-open .card-title")`), true);
  await ev(`switchTaskView("list"); true`);

  // Bu blok state'i değiştirdi; sonraki iddiaların beklediği düzeni geri kur.
  await ev(`state.tasks = [
    { id:"a", title:"alfa v3", notes:"", dueDate:"2026-05-10", priority:"low", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"beta rapor (güncel)", notes:"", dueDate:"2026-05-10", priority:"high", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"gama İstanbul", notes:"", dueDate:null, priority:"med", tags:[], subtasks:[], done:true, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:"2026-01-03T00:00:00.000Z", sourceNoteId:null },
  ]; ui.q = ""; renderList();`);

  // ---------------- T3.7: tekrarlayan görevler ----------------
  const mkRec = (id, due, rule) => `{ id:${JSON.stringify(id)}, title:"tekrarlı", notes:"", dueDate:${JSON.stringify(due)},
    priority:"med", tags:["ev"], subtasks:[{id:"s1",title:"adım",done:true}], done:false,
    createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z",
    completedAt:null, sourceNoteId:null, recur:${rule} }`;

  await ev(`today = "2026-05-10";
    state.tasks = [${mkRec("r1", "2026-05-10", '{ freq:"daily", interval:1, byDay:null, anchor:"2026-05-10" }')}];
    render(); true`);
  await ev(`toggleDone("r1", true); true`);

  const spawned = await ev(`(() => {
    const done = state.tasks.find(t => t.id === "r1");
    const fresh = state.tasks.find(t => t.id !== "r1");
    return { n: state.tasks.length, doneKept: !!done && done.done, freshDue: fresh && fresh.dueDate,
             freshDone: fresh && fresh.done, freshSubs: fresh && fresh.subtasks.map(s => s.done),
             sameId: fresh && fresh.id === "r1", tags: fresh && fresh.tags.join() };
  })()`);
  check("tekrar: tamamlanınca sonraki örnek doğar", [spawned.n, spawned.freshDue], [2, "2026-05-11"]);
  check("tekrar: TAMAMLANAN GÖREV SİLİNMEZ, geçmiş kalır", spawned.doneKept, true);
  check("tekrar: yeni örnek açık ve yeni kimlikli", [spawned.freshDone, spawned.sameId], [false, false]);
  check("tekrar: alt görevler sıfırlanır", spawned.freshSubs, [false]);
  check("tekrar: etiketler taşınır", spawned.tags, "ev");

  // YIĞILMA YOK + kaçırılan tekrarlar atlanır
  await ev(`today = "2026-06-01";
    state.tasks = [${mkRec("r2", "2026-05-10", '{ freq:"weekly", interval:1, byDay:[1], anchor:"2026-05-11" }')}];
    render(); toggleDone("r2", true); true`);
  const late = await ev(`(() => {
    const fresh = state.tasks.filter(t => t.id !== "r2");
    return { n: state.tasks.length, dues: fresh.map(t => t.dueDate) };
  })()`);
  check("tekrar: 3 hafta geç tamamlansa da TEK örnek doğar", late.n, 2);
  check("tekrar: kaçırılan tekrarlar atlanır — yeni örnek GELECEKTE",
    [late.dues.length, late.dues[0] > "2026-06-01"], [1, true]);

  // Erken tamamlama seriyi kaydırmaz
  await ev(`today = "2026-05-10";
    state.tasks = [${mkRec("r3", "2026-05-20", '{ freq:"monthly", interval:1, byDay:null, anchor:"2026-05-20" }')}];
    render(); toggleDone("r3", true); true`);
  check("tekrar: erken tamamlama seriyi kaydırmaz",
    await ev(`state.tasks.filter(t => t.id !== "r3")[0].dueDate`), "2026-06-20");

  // Tekrarsız görev hiçbir şey üretmez
  await ev(`state.tasks = [{ id:"n1", title:"düz", notes:"", dueDate:"2026-05-10", priority:"med",
    tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
    updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null }];
    render(); toggleDone("n1", true); true`);
  check("tekrarsız görev tamamlanınca hiçbir şey üretilmez",
    await ev(`state.tasks.length`), 1);

  // Yakalamadan uçtan uca
  await ev(`today = "2026-05-10"; captureIgnored.clear(); state.tasks = [];
    submitQuickAdd("her pazartesi toplantı"); true`);
  const fromCapture = await ev(`(() => { const x = state.tasks[0];
    return [x.title, x.dueDate, x.recur && x.recur.freq, x.recur && x.recur.byDay.join()]; })()`);
  check("yakalama: 'her pazartesi toplantı' tekrarlı görev üretir",
    fromCapture, ["toplantı", "2026-05-11", "weekly", "1"]);
  check("kartta tekrar göstergesi var",
    await ev(`!!document.querySelector("#list .m-recur")`), true);

  // Panelden kural değiştirme
  await ev(`openPanel(state.tasks[0].id); true`);
  check("panel: tekrar denetimi mevcut kuralı gösteriyor",
    await ev(`document.getElementById("f-recur").value`), "weekly");
  await ev(`(() => { const el = document.getElementById("f-recur"); el.value = "monthly";
    el.dispatchEvent(new Event("change", { bubbles:true })); return true; })()`);
  check("panel: sıklık değiştirilebiliyor",
    await ev(`state.tasks[0].recur.freq`), "monthly");
  await ev(`(() => { const el = document.getElementById("f-recur-n"); el.value = "3";
    el.dispatchEvent(new Event("change", { bubbles:true })); return true; })()`);
  check("panel: aralık değiştirilebiliyor", await ev(`state.tasks[0].recur.interval`), 3);
  await ev(`(() => { const el = document.getElementById("f-recur-n"); el.value = "0";
    el.dispatchEvent(new Event("change", { bubbles:true })); return true; })()`);
  check("panel: geçersiz aralık REDDEDİLİR, kural bozulmaz",
    await ev(`[state.tasks[0].recur.interval, document.getElementById("f-recur-n").value]`), [3, "3"]);
  await ev(`(() => { const el = document.getElementById("f-recur"); el.value = "";
    el.dispatchEvent(new Event("change", { bubbles:true })); return true; })()`);
  check("panel: tekrar kaldırılabiliyor", await ev(`state.tasks[0].recur`), null);
  await ev(`closePanel(); true`);

  // ---------------- T4.1: çoklu seçim ----------------
  const five = `today = "2026-05-10"; clearSelection(); ui.q = ""; switchTaskView("list");
    state.tasks = [1,2,3,4,5].map(i => ({ id:"s"+i, title:"görev "+i, notes:"", dueDate:"2026-05-10",
      priority:"med", tags:[], subtasks:[], done:false,
      createdAt:"2026-01-0"+i+"T00:00:00.000Z", updatedAt:"2026-01-0"+i+"T00:00:00.000Z",
      completedAt:null, sourceNoteId:null })); render(); true`;
  await ev(five);

  check("S8: seçim yokken toplu çubuk YOK",
    await ev(`!document.querySelector(".bulkbar")`), true);
  check("görünen sıra ekrandaki sırayla",
    await ev(`ui.selOrder`), ["s1", "s2", "s3", "s4", "s5"]);

  /* Bildirimler 8 sn yaşıyor ve testler hızlı koşuyor: ekranda birden çok
     bildirim birikiyor. İlkini tıklamak ESKİ bir işlemin geri almasını
     çalıştırır. Her işlemden önce temizle, sonra SONUNCUYU tıkla. */
  const clearToasts = `(() => { const n = document.getElementById("toasts"); if (n) n.textContent = ""; return true; })()`;
  /* Her bildirimde İKİ buton var: eylem ve kapat (btn-icon). Sonuncuyu
     tıklamak bildirimi KAPATIR, geri almaz — ilk denemede tam bu oldu. */
  const undoLast = `(() => {
    const list = document.querySelectorAll(".toasts .toast");
    if (!list.length) return "bildirim yok";
    const b = list[list.length - 1].querySelector("button:not(.btn-icon)");
    if (!b) return "eylem butonu yok";
    b.click(); return true; })()`;

  const clickCard = (id, mods) => `(() => { const c = document.querySelector('#list .card[data-id="${id}"]');
    c.dispatchEvent(new MouseEvent("click", Object.assign({ bubbles:true, cancelable:true }, ${JSON.stringify(mods || {})})));
    return true; })()`;

  await ev(clickCard("s2", { ctrlKey: true }));
  check("Ctrl+tık tek görev seçer", await ev(`[...ui.sel]`), ["s2"]);
  check("seçim çubuğu belirdi", await ev(`!!document.querySelector(".bulkbar")`), true);
  check("seçili kart işaretli ve ADINDA seçili yazıyor",
    await ev(`(() => { const c = document.querySelector('.card[data-id="s2"]');
      const b = c.querySelector(".card-open");
      return [c.classList.contains("picked"), b.getAttribute("aria-label").includes("seçili"),
              b.hasAttribute("aria-selected")]; })()`), [true, true, false]);
  check("seçim ekran okuyucuya duyuruldu",
    await ev(`document.getElementById("selLive").textContent.includes("1")`), true);

  await ev(clickCard("s4", { shiftKey: true }));
  check("Shift+tık aralık seçer", await ev(`[...ui.sel].sort()`), ["s2", "s3", "s4"]);

  await ev(clickCard("s2", { ctrlKey: true }));
  check("Ctrl+tık seçiliyi çıkarır", await ev(`[...ui.sel].sort()`), ["s3", "s4"]);

  await ev(clickCard("s1"));
  check("düz tıklama seçimi temizler ve paneli açar",
    await ev(`[ui.sel.size, openTaskId]`), [0, "s1"]);
  await ev(`closePanel(); true`);

  // Klavye
  // Boşluk artık düğmeyi ETKİNLEŞTİRİR (yerel davranış); seçim `x` ile.
  await ev(`(() => { const c = document.querySelector('.card[data-id="s2"] .card-open'); c.focus();
    c.dispatchEvent(new KeyboardEvent("keydown", { key:"x", bubbles:true, cancelable:true })); return true; })()`);
  check("`x` tuşu seçer", await ev(`[...ui.sel]`), ["s2"]);
  await ev(`(() => { const c = document.querySelector('.card[data-id="s2"] .card-open'); c.focus();
    c.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowDown", shiftKey:true, bubbles:true, cancelable:true })); return true; })()`);
  check("Shift+ok seçimi genişletir", await ev(`[...ui.sel].sort()`), ["s2", "s3"]);
  check("odak sonraki karta taşındı",
    await ev(`document.activeElement.closest(".card").getAttribute("data-id")`), "s3");

  await ev(`document.documentElement.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true, cancelable:true })); true`);
  check("Esc seçimi temizler", await ev(`[ui.sel.size, !!document.querySelector(".bulkbar")]`), [0, false]);

  // Filtre daralınca seçim budanır
  await ev(`applySel(["s1","s2","s5"], "add"); ui.q = "görev 1"; renderList(); true`);
  check("filtre daralınca görünmeyen seçim DÜŞER", await ev(`[...ui.sel]`), ["s1"]);
  await ev(`ui.q = ""; clearSelection(); renderList(); true`);

  // ---------------- T4.2: toplu işlemler ----------------
  await ev(five);
  await ev(`applySel(["s1","s2","s3"], "add"); true`);
  await ev(clearToasts);
  await ev(`bulkPriority("high"); true`);
  check("toplu öncelik uygulandı",
    await ev(`state.tasks.map(t => t.priority).join()`), "high,high,high,med,med");
  check("geri alma bildirimi var", await ev(undoLast), true);
  check("TEK GERİ ALMA hepsini geri aldı",
    await ev(`state.tasks.map(t => t.priority).join()`), "med,med,med,med,med");

  await ev(five);
  await ev(clearToasts);
  await ev(`applySel(["s2","s4"], "add"); bulkDue(null); true`);
  check("toplu tarih silme", await ev(`state.tasks.map(t => t.dueDate === null).join()`), "false,true,false,true,false");
  check("geri alma bildirimi var", await ev(undoLast), true);
  check("tarih geri alındı", await ev(`state.tasks.every(t => t.dueDate === "2026-05-10")`), true);

  await ev(five);
  await ev(clearToasts);
  await ev(`applySel(["s1","s3"], "add"); bulkTag("acil"); true`);
  check("toplu etiket", await ev(`state.tasks.map(t => t.tags.join("|")).join()`), "acil,,acil,,");

  // Toplu silme: sıra korunarak geri alınmalı
  await ev(five);
  await ev(clearToasts);
  await ev(`applySel(["s2","s4"], "add"); bulkDelete(); true`);
  check("toplu silme", await ev(`state.tasks.map(t => t.id)`), ["s1", "s3", "s5"]);
  check("silmeden sonra seçim temizlendi", await ev(`ui.sel.size`), 0);
  check("geri alma bildirimi var", await ev(undoLast), true);
  check("geri alma SIRAYI da geri getirir",
    await ev(`state.tasks.map(t => t.id)`), ["s1", "s2", "s3", "s4", "s5"]);

  // Toplu tamamlama + tekrar: geri alma üretilen örneği de silmeli
  await ev(`today = "2026-05-10"; clearSelection();
    state.tasks = [{ id:"rr", title:"tekrarlı", notes:"", dueDate:"2026-05-10", priority:"med",
      tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null,
      recur:{ freq:"daily", interval:1, byDay:null, anchor:"2026-05-10" } }]; render();
    applySel(["rr"], "add"); true`);
  await ev(clearToasts);
  await ev(`bulkDone(true); true`);
  check("toplu tamamlama tekrar örneği üretti", await ev(`state.tasks.length`), 2);
  check("geri alma bildirimi var", await ev(undoLast), true);
  check("geri alma ÜRETİLEN ÖRNEĞİ de sildi — yarım geri alma yok",
    await ev(`[state.tasks.length, state.tasks[0].done]`), [1, false]);

  // ---------------- T4.3: [[sayfa]] bağlantıları ----------------
  await ev(`clearSelection(); ui.q = ""; switchTaskView("list"); today = "2026-05-10";
    notes.notebooks = [{ id:"nbx", name:"Defter", color:"#5b5bd6", pages:[
      { id:"pgA", title:"Toplantı", boxes:[{ id:"b1", x:40, y:40, w:400, html:"<p>gövde</p>" }],
        createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" },
      { id:"pgB", title:"Günlük", boxes:[{ id:"b2", x:40, y:40, w:400, html:"<p>şuna bak [[Toplantı]]</p>" }],
        createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z" },
    ]}];
    state.tasks = [
      { id:"w1", title:"bak [[Toplantı]] notuna", notes:"", dueDate:"2026-05-10", priority:"med",
        tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
        updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
      { id:"w2", title:"düz görev", notes:"", dueDate:"2026-05-10", priority:"med",
        tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z",
        updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    ]; ui.view = "tasks"; buildShell(); true`);

  check("başlıktaki [[bağlantı]] tıklanabilir düğüm oldu",
    await ev(`(() => { const a = document.querySelector('.card[data-id="w1"] .card-meta .wikilink');
      return [!!a, a && a.tagName, a && a.querySelector(".wl-label").textContent]; })()`),
    [true, "BUTTON", "Toplantı"]);
  check("bağlantısız başlıkta düğüm yok",
    await ev(`!document.querySelector('.card[data-id="w2"] .card-meta .wikilink')`), true);
  check("başlık düz metin, bağlantı işaretleri temiz",
    await ev(`document.querySelector('.card[data-id="w1"] .card-title').textContent`), "bak Toplantı notuna");
  check("bağlantı üstbilgi satırında, başlığın İÇİNDE değil",
    await ev(`[!!document.querySelector('.card[data-id="w1"] .card-meta .wikilink'),
               !!document.querySelector('.card[data-id="w1"] .card-title .wikilink')]`), [true, false]);
  check("T2.8: düğme içinde düğme YOK",
    await ev(`!document.querySelector('#list button button')`), true);
  check("T2.8: <li> düz liste öğesi — role ve tabindex yok",
    await ev(`(() => { const c = document.querySelector('.card[data-id="w1"]');
      return [c.hasAttribute("role"), c.hasAttribute("tabindex")]; })()`), [false, false]);

  // GÜVENLİK: bağlantı adı HTML olarak yorumlanmamalı
  await ev(`state.tasks[0].title = 'kötü [[<img src=x onerror=alert(1)>]] deneme'; renderList(); true`);
  check("GÜVENLİK: bağlantı adı metin olarak basılır, öğe yaratmaz",
    await ev(`(() => { const c = document.querySelector('.card[data-id="w1"]');
      return [c.querySelectorAll("img").length,
              c.querySelector(".card-meta .wikilink .wl-label").textContent]; })()`),
    [0, "<img src=x onerror=alert(1)>"]);
  await ev(`state.tasks[0].title = "bak [[Toplantı]] notuna"; renderList(); true`);

  // Var olan sayfaya gitme
  await ev(`document.querySelector('.card[data-id="w1"] .card-meta .wikilink').click(); true`);
  check("bağlantı var olan sayfayı açtı",
    await ev(`[ui.view, ui.nbId, ui.pageId]`), ["notes", "nbx", "pgA"]);

  // ---------------- T4.4: geri-bağlantı paneli ----------------
  const bl = await ev(`(() => { const h = document.getElementById("edBacklinks");
    return { hidden: h.hidden, items: Array.from(h.querySelectorAll(".bl-label")).map(n => n.textContent) }; })()`);
  check("geri-bağlantı paneli görevi ve sayfayı listeliyor",
    [bl.hidden, bl.items.sort()], [false, ["Günlük", "bak Toplantı notuna"]]);

  // Bağlantısı olmayan sayfada panel hiç çizilmez (S8)
  await ev(`ui.pageId = "pgB"; renderNotesView(FORCE_EDITOR); true`);
  check("S8: bağlantı yoksa geri-bağlantı paneli GİZLİ",
    await ev(`document.getElementById("edBacklinks").hidden`), true);

  // Geri-bağlantıdan göreve dönüş
  await ev(`ui.pageId = "pgA"; renderNotesView(FORCE_EDITOR);
    (() => { const b = Array.from(document.querySelectorAll(".bl-item"))
      .find(n => n.textContent.includes("bak Toplantı")); b.click(); return true; })()`);
  check("geri-bağlantıdan göreve dönülüyor", await ev(`[ui.view, openTaskId]`), ["tasks", "w1"]);
  await ev(`closePanel(); true`);

  // Olmayan sayfaya bağlantı: KIRIK değil, DAVET
  await ev(`state.tasks[0].title = "bak [[Yeni Sayfa]] notuna"; renderList();
    document.querySelector('.card[data-id="w1"] .card-meta .wikilink').click(); true`);
  const created = await ev(`(() => { const nb = notes.notebooks.find(n => n.id === ui.nbId);
    const p = nb.pages.find(x => x.id === ui.pageId);
    return [ui.view, p && p.title, nb.pages.length]; })()`);
  check("olmayan sayfaya bağlantı sayfayı OLUŞTURUR (kırık değil, davet)",
    created, ["notes", "Yeni Sayfa", 3]);

  // Türkçe harf katlaması uçtan uca
  await ev(`ui.view = "tasks"; buildShell();
    state.tasks[0].title = "bak [[toplanti]] notuna"; renderList();
    document.querySelector('.card[data-id="w1"] .card-meta .wikilink').click(); true`);
  check("bağlantı eşleşmesi Türkçe harf katlamalı (yeni sayfa AÇILMADI)",
    await ev(`[ui.pageId, notes.notebooks[0].pages.length]`), ["pgA", 3]);

  await ev(`ui.view = "tasks"; notes.notebooks = []; buildShell(); true`);

  // Bu blok state'i değiştirdi; sonraki iddiaların beklediği düzeni geri kur.
  await ev(`clearSelection(); today = "2026-05-10"; state.tasks = [
    { id:"a", title:"alfa v3", notes:"", dueDate:"2026-05-10", priority:"low", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"beta rapor (güncel)", notes:"", dueDate:"2026-05-10", priority:"high", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"gama İstanbul", notes:"", dueDate:null, priority:"med", tags:[], subtasks:[], done:true, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:"2026-01-03T00:00:00.000Z", sourceNoteId:null },
  ]; ui.q = ""; renderList();`);

  // Boş durum ve geri dönüş: durum sıfırlanıp tekrar kurulabilmeli.
  await ev(`ui.q = "hicbirseyeuymaz"; renderList();`);
  check("eşleşme yoksa boş durum", await ev(`!!document.querySelector("#list .empty")`), true);
  await ev(`ui.q = ""; renderList();`);
  check("boş durumdan sonra liste yeniden kurulur", await ev(`document.querySelectorAll("#list .card").length`), 3);

  /* SIRALAMA GERİLEMESİ (T2.3b sırasında bulundu ve düzeltildi).
     Tek çizimde hem yeniden sıralama hem araya ekleme olduğunda, kuyruğa
     alınmış inşa ile eşzamanlı taşıma karışıyordu: taşımanın çengeli henüz
     kurulmamış bir karta denk gelip kart SONA ekleniyordu. [A,B,C] →
     [B,D,A,C] çizimi [D,A,B,C] veriyordu. Sessiz bir hata — hiçbir şey
     patlamıyor, sadece sıra yanlış. */
  const siralama = await ev(`(() => {
    today = "2026-05-10";
    const mk = (id, prio) => ({ id, title:id, notes:"", dueDate:"2026-05-10", priority:prio,
      tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null });
    const box = document.getElementById("list");
    box.__taskList = null; box.textContent = "";
    state.tasks = [mk("A","high"), mk("B","med"), mk("C","low")];
    ui.q = ""; renderList(); flushRenderQueue(true);
    state.tasks = [mk("B","high"), mk("D","med"), mk("A","low"), mk("C","low")];
    state.tasks[3].dueDate = "2026-05-11";
    renderList(); flushRenderQueue(true);
    const dom = Array.from(document.querySelectorAll("#list .card")).map(n => n.getAttribute("data-id"));
    const bekle = listGroups(state.tasks.filter(matches), today).flatMap(g => g.items.map(x => x.id));
    return [dom.join(","), bekle.join(",")];
  })()`);
  check("yeniden sıralama + araya ekleme aynı çizimde: DOM sırası doğru",
    siralama[0], siralama[1]);

  /* ---------------------------------------------- T2.3b: parçalı çizim ---
     Buradaki iddialar ölçüm değil SÖZLEŞME: kuyruk hiçbir zaman kartı
     kaybetmemeli, klavyeyi kısıtlamamalı ve yazdırmayı yarım bırakmamalı.
     Ölçüm perf.mjs'in işi; burada davranış kanıtlanıyor. */
  const BIG = 3000;
  await ev(`(() => {
    clearSelection(); today = "2026-05-10";
    const tasks = [];
    for (let i = 0; i < ${BIG}; i++) tasks.push({ id:"k"+i, title:"kayit "+i, notes:"",
      dueDate:"2026-05-10", priority:"med", tags:[], subtasks:[], done:false,
      createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z",
      completedAt:null, sourceNoteId:null });
    state.tasks = tasks;
    const box = document.getElementById("list");
    box.__taskList = null; box.textContent = "";      // baştan kurulum: kuyruk garanti dolar
    ui.q = ""; renderList();
    return true;
  })()`);
  const queued = await ev(`[!!renderQueue, document.querySelectorAll("#list .card").length < ${BIG}]`);
  check("T2.3b: büyük listede çizim GERÇEKTEN parçalanıyor", queued, [true, true]);

  // Klavye: henüz kurulmamış karta ok tuşuyla ulaşılabilmeli.
  const reach = await ev(`(() => {
    const sel = id => id == null ? null : document.querySelector('#list .card[data-id="' + CSS.escape(id) + '"]');
    const n = document.querySelectorAll("#list .card").length;
    const from = ui.selOrder[n - 1], next = ui.selOrder[n];
    if (!sel(from)) return ["kaynak kart yok", n, String(from)];
    if (next == null) return ["kuyruk erken bitti", n, ui.selOrder.length];
    const yoktu = !sel(next);
    sel(from).querySelector(".card-open").focus();
    selArrow(from, 1, false);
    const a = document.activeElement;
    const card = a && a.closest ? a.closest(".card") : null;
    return [yoktu, !!card && card.getAttribute("data-id") === next, a ? a.className : "yok"];
  })()`);
  check("T2.3b: ok tuşu ÇİZİLMEMİŞ karta ulaşır", reach, [true, true, "card-open"]);

  // Yazdırma: beforeprint kuyruğu sonuna kadar boşaltmalı — yarım liste basılamaz.
  await ev(`(() => {
    const box = document.getElementById("list");
    box.__taskList = null; box.textContent = ""; renderList(); return true;
  })()`);
  const printed = await ev(`(() => {
    const yarim = document.querySelectorAll("#list .card").length;
    window.dispatchEvent(new Event("beforeprint"));
    return [yarim < ${BIG}, document.querySelectorAll("#list .card").length, renderQueue === null];
  })()`);
  check("T2.3b: beforeprint kuyruğu boşaltır, liste TAM basılır", printed, [true, BIG, true]);

  // Süzgeç daraldığında: kuyruk bitince ekranda YALNIZ eşleşenler kalmalı.
  const settled = await ev(`(async () => {
    ui.q = "kayit 1"; renderList();
    let g = 0;
    while (renderQueue && g++ < 800) await new Promise(r => requestAnimationFrame(r));
    const goster = Array.from(document.querySelectorAll("#list .card")).map(n => n.getAttribute("data-id"));
    const bekle = state.tasks.filter(matches).map(x => x.id);
    return [goster.length, bekle.length, goster.join(",") === bekle.join(",")];
  })()`);
  check("T2.3b: kuyruk bitince ekran süzgeçle BİREBİR (bayat kart kalmaz)",
    [settled[0] === settled[1], settled[2]], [true, true]);

  /* ------------------------------------------------- T5.1: görünüm geçişi ---
     Üç yol da sınanır: normal (API var, hareket serbest), API YOK, hareket
     İSTENMİYOR. Üçünde de iş yapılmalı; yalnız ikisinde animasyon olmamalı. */
  await ev(`(() => {
    clearSelection(); today = "2026-05-10"; ui.q = "";
    state.tasks = [{ id:"v1", title:"gecis", notes:"", dueDate:"2026-05-10", priority:"high",
      tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null }];
    switchTaskView("list"); render();
    // Casus: gerçek API korunur, çağrı sayılır.
    window.__vt = { n: 0, gercek: document.startViewTransition };
    document.startViewTransition = function(cb){
      window.__vt.n++;
      return window.__vt.gercek ? window.__vt.gercek.call(document, cb) : (cb(), null);
    };
    return typeof window.__vt.gercek;
  })()`);
  check("T5.1: file:// üzerinde startViewTransition VAR", await ev(`typeof window.__vt.gercek`), "function");

  const tikla = v => `(() => { const b = document.querySelector(${JSON.stringify('#sidebar [data-side-key="view:' + v + '"]')});
    if (!b) return "düğme yok"; b.focus(); b.click(); return true; })()`;

  await ev(`window.__vt.n = 0; true`);
  await ev(tikla("board"));
  await bekle(`ui.taskView === "board"`);
  await gecisBitsin();
  check("T5.1: pano düğmesi görünümü değiştirdi", await ev(`ui.taskView`), "board");
  check("T5.1: geçiş BAŞLATILDI (API var, hareket serbest)", await ev(`window.__vt.n`), 1);
  check("T5.1: geçişten sonra odak kaybolmadı — düğme hâlâ odakta",
    await ev(`(() => { const a = document.activeElement;
      return [a && a.getAttribute && a.getAttribute("data-side-key"),
              a && a.getAttribute && a.getAttribute("aria-pressed")]; })()`),
    ["view:board", "true"]);
  check("T5.1: pano gerçekten çizildi",
    await ev(`document.getElementById("list").classList.contains("board")`), true);

  /* GEÇİŞİN BEDELİ ÖLÇÜLÜR. Geçiş sürerken sayfa tıklanamaz — anlık
     görüntüler üst katmanda. Varsayılan sürelerle bu pencere 324 ms ölçüldü;
     "Pano"ya basıp hemen "Takvim"e basan biri ikinci tıklamasını kaybediyordu.
     Süreler 150 ms'ye çekilince 223 ms'ye indi (kalan ~70 ms API'nin sabit
     maliyeti: anlık görüntü alma + bir kare gecikme + sökme). Kök animasyonunu
     tümden kapatmak ölçüldü ve HİÇBİR ŞEY kazandırmadı (233 ms) — o yüzden
     duruyor ve görevler ↔ notlar geçişini o yapıyor.
     Bu kapı sayının sessizce büyümesini engeller. */
  await ev(`switchTaskView("list"); true`);
  await gecisBitsin();
  const pencere = await ev(`(async () => {
    const t0 = performance.now();
    document.querySelector('#sidebar [data-side-key="view:board"]').click();
    let engel = null, acildi = null;
    for (let i = 0; i < 120; i++){
      await new Promise(r => requestAnimationFrame(r));
      const bos = (document.elementFromPoint(20, 20) || {}).tagName === "HTML";
      if (bos && engel === null) engel = performance.now() - t0;
      if (!bos && engel !== null){ acildi = performance.now() - t0; break; }
    }
    return acildi;
  })()`);
  check("T5.1: geçiş sırasında tıklamaya kapalı pencere < 300 ms",
    typeof pencere === "number" && pencere < 300, true);
  if (!(typeof pencere === "number" && pencere < 300))
    console.log("    ölçülen pencere:", pencere);
  await gecisBitsin();

  // API YOK: anında geçiş, hata yok.
  await ev(`(() => { window.__vtYedek = document.startViewTransition;
    try { delete document.startViewTransition; } catch (e){}
    document.startViewTransition = undefined; return true; })()`);
  const apisiz = await ev(`(() => { try { pickTaskView("calendar");
      return [ui.taskView, document.getElementById("list").classList.contains("calendar")]; }
    catch (e){ return ["hata: " + e.message, false]; } })()`);
  check("T5.1: API yokken ANINDA geçiş, hata yok", apisiz, ["calendar", true]);
  await ev(`document.startViewTransition = window.__vtYedek; true`);

  // HAREKET İSTENMİYOR: API var ama kullanılmaz.
  const azHareket = await ev(`(() => {
    const gercekMM = window.matchMedia;
    window.matchMedia = q => /prefers-reduced-motion/.test(q) ? { matches:true, media:q,
      addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }
      : gercekMM.call(window, q);
    window.__vt.n = 0;
    const izin = motionAllowed();
    pickTaskView("list");
    const sonuc = [izin, window.__vt.n, ui.taskView,
                   document.getElementById("list").classList.contains("calendar")];
    window.matchMedia = gercekMM;
    return sonuc;
  })()`);
  check("T5.1: reduce → animasyon YOK ama geçiş ANINDA yapıldı",
    azHareket, [false, 0, "list", false]);

  // Sorgulanamayan ortamda da kıpırdamaz: şüphede kalınca hareket yok.
  check("T5.1: matchMedia patlarsa hareket YOK sayılır", await ev(`(() => {
    const gercekMM = window.matchMedia;
    window.matchMedia = () => { throw new Error("yok"); };
    const izin = motionAllowed();
    window.matchMedia = gercekMM;
    return izin; })()`), false);

  // Ekran okuyucu durumu: her üç düğmenin aria-pressed'i tek ve doğru.
  check("T5.1: geçişten sonra aria-pressed tek ve doğru",
    await ev(`(() => { const bs = Array.from(document.querySelectorAll('#sidebar [data-side-key^="view:"]'));
      return [bs.length, bs.filter(b => b.getAttribute("aria-pressed") === "true")
        .map(b => b.getAttribute("data-side-key"))]; })()`),
    [3, ["view:list"]]);

  // Kenar çubuğu odak korunumu görünüm düğmesine özel değil: süzgeçte de geçerli.
  check("T5.1: süzgeç düğmesine basınca da odak kenar çubuğunda kalır",
    await ev(`(() => { const b = document.querySelector('#sidebar [data-side-key="prio:high"]');
      b.focus(); b.click();
      const a = document.activeElement;
      return a && a.getAttribute && a.getAttribute("data-side-key"); })()`), "prio:high");
  await ev(`ui.prios.clear(); render(); document.startViewTransition = window.__vt.gercek; true`);
  /* `view-transition-name` bedava değil: adlandırılmış öğe bir yığma bağlamı
     kurar VE içindeki `position:fixed` torunları için KUŞATAN BLOK olur.
     Bugün `#list` içinde sabit konumlu hiçbir şey yok (panel, bildirimler ve
     araç menüleri onun DIŞINDA) — bu iddia yarın biri içeri koyduğunda
     sessizce kaymasın diye var. Geometri ayrıca bir önceki sürümle birebir
     karşılaştırıldı: ad eklemek düzeni değiştirmedi. */
  check("T5.1: #list içinde position:fixed torun YOK (kuşatan blok tuzağı)",
    await ev(`(() => { const list = document.getElementById("list");
      const hepsi = Array.from(list.querySelectorAll("*"));
      return hepsi.filter(n => getComputedStyle(n).position === "fixed").length; })()`), 0);
  check("T5.1: panel ve bildirimler listenin DIŞINDA",
    await ev(`(() => { const list = document.getElementById("list");
      return ["#panel", ".toasts"].map(sel => { const n = document.querySelector(sel);
        return !!n && !list.contains(n); }); })()`), [true, true]);



  /* --------------------------------------------- T5.2: sürükle ve bırak ---
     Sürükleme yeniden GRUPLAMA yapar (ADR 0003). Aşağıdakiler mekaniği değil
     SÖZLEŞMEYİ kilitler: hangi jest hangi alanı değiştirir, neyi değiştirmez,
     klavye eşdeğeri var mı, geri alınabiliyor mu. */
  const sahne = `(() => {
    clearSelection(); today = "2026-05-10"; ui.q = ""; ui.prios.clear(); ui.tags.clear();
    ui.status = "all"; ui.showCompleted = true;
    const mk = (id, due, prio, done) => ({ id, title:id, notes:"", dueDate:due, priority:prio,
      tags:[], subtasks:[], done: !!done, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt: done ? "2026-01-01T00:00:00.000Z" : null,
      recur:null, sourceNoteId:null });
    state.tasks = [mk("bugun","2026-05-10","high"), mk("yarin","2026-05-11","med"),
                   mk("sonra","2026-06-20","low")];
    switchTaskView("list");
    const box = document.getElementById("list");
    box.__taskList = null; box.textContent = "";
    render(); flushRenderQueue(true);
    const toasts = document.getElementById("toasts"); if (toasts) toasts.textContent = "";
    return true;
  })()`;
  await ev(sahne);
  await gecisBitsin();

  check("T5.2: her kartta tutamak var",
    await ev(`document.querySelectorAll("#list .card .card-grip").length`), 3);
  check("T5.2: tutamak ekran okuyucudan gizli ve ODAKLANAMAZ (sekme durağı eklemez)",
    await ev(`(() => { const g = document.querySelector(".card-grip");
      return [g.getAttribute("aria-hidden"), g.tagName, g.hasAttribute("tabindex"),
              g.matches("button, a, input, [tabindex]")]; })()`),
    ["true", "SPAN", false, false]);
  check("T5.2: bölümler bırakma hedefi olarak işaretli",
    await ev(`Array.from(document.querySelectorAll("#list [data-group]")).map(n => n.getAttribute("data-group"))`),
    ["today", "tomorrow", "later"]);

  /* Gerçek işaretçi olayları: yakalama sahte işaretçi için başarısız olur,
     o yüzden kod `try/catch` ile devam eder ve olaylar tutamağa gönderilir.

     Hedef ÖNCE görünür alana kaydırılır: `elementFromPoint` görüş alanı
     dışındaki bir noktaya null döner ve test "bırakılamaz" sanırdı. Gerçek
     kullanıcı da hedefe kaydırır. Tutamağın konumu önemsiz — `pointerdown`
     doğrudan ona gönderiliyor, koordinat yalnız BIRAKMA noktası için gerekli. */
  const surukle = (id, hedef, pid) => `(() => {
    const card = document.querySelector('#list .card[data-id=' + JSON.stringify(${JSON.stringify(id)}) + ']');
    if (!card) return { hata: "kart yok" };
    const grip = card.querySelector(".card-grip");
    const sec = document.querySelector('#list [data-group=' + JSON.stringify(${JSON.stringify(hedef)}) + ']');
    if (!sec) return { hata: "hedef bölüm yok" };
    sec.scrollIntoView({ block: "center" });
    const r = sec.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2);
    const y = Math.round(Math.min(Math.max(r.top + 8, 6), window.innerHeight - 6));
    const gorusAlaninda = y > 0 && y < window.innerHeight && r.bottom > 0 && r.top < window.innerHeight;
    const e = (tip, px, py) => grip.dispatchEvent(new PointerEvent(tip, { pointerId: ${pid}, button: 0,
      clientX: px, clientY: py, bubbles: true, cancelable: true }));
    e("pointerdown", 10, 10);
    e("pointermove", 10, 60);                    // eşiği aş
    e("pointermove", x, y);
    const etiket = document.getElementById("dragLabel");
    const iz = { gorusAlaninda, etiket: etiket && etiket.textContent,
                 hedefIsaretli: sec.classList.contains("drop-target"),
                 kaldirilmis: card.classList.contains("dragging") };
    e("pointerup", x, y);
    return iz;
  })()`;

  const iz = await ev(surukle("sonra", "tomorrow", 7));
  check("T5.2: sürükleme sırasında hedef işaretlendi ve etiket göründü",
    [iz.hedefIsaretli, iz.kaldirilmis, iz.etiket], [true, true, "Yarın grubuna bırak"]);
  check("T5.2: YARIN kovasına bırakınca son tarih o kovaya düştü",
    await ev(`(() => { const x = getTask("sonra"); return [x.dueDate, bucketOf(x, today)]; })()`),
    ["2026-05-11", "tomorrow"]);
  check("T5.2: taşıma GERİ ALINABİLİR",
    await ev(`(() => { const b = document.querySelector(".toasts .toast button:not(.btn-icon)");
      if (!b) return "geri al düğmesi yok"; b.click();
      const x = getTask("sonra"); return [x.dueDate, bucketOf(x, today)]; })()`),
    ["2026-06-20", "later"]);

  // Escape sürüklemeyi iptal eder: hiçbir alan değişmez.
  await ev(`document.getElementById("toasts").textContent = ""; true`);
  const iptal = await ev(`(() => {
    const card = document.querySelector('#list .card[data-id="sonra"]');
    const grip = card.querySelector(".card-grip");
    const sec = document.querySelector('#list [data-group="today"]');
    const r = sec.getBoundingClientRect(), g = grip.getBoundingClientRect();
    const e = (tip, x, y) => grip.dispatchEvent(new PointerEvent(tip, { pointerId: 8, button: 0,
      clientX: x, clientY: y, bubbles: true, cancelable: true }));
    e("pointerdown", g.left + 5, g.top + 5);
    e("pointermove", g.left + 5, g.top + 40);
    e("pointermove", r.left + r.width / 2, r.top + 10);
    window.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true, cancelable:true }));
    e("pointerup", r.left + r.width / 2, r.top + 10);
    return [getTask("sonra").dueDate,
            document.querySelectorAll(".toasts .toast").length,
            !!document.querySelector(".card.dragging"),
            !!document.querySelector(".drop-target")];
  })()`);
  check("T5.2: Escape sürüklemeyi iptal eder — veri, bildirim ve sınıflar temiz",
    iptal, ["2026-06-20", 0, false, false]);

  // Pano: sütuna bırakmak önceliği değiştirir.
  await ev(`switchTaskView("board"); flushRenderQueue(true);
            document.getElementById("toasts").textContent = ""; true`);
  await ev(surukle("sonra", "high", 9));
  check("T5.2: panoda sütuna bırakmak ÖNCELİĞİ değiştirir",
    await ev(`getTask("sonra").priority`), "high");
  check("T5.2: panoda taşıma son tarihe DOKUNMAZ",
    await ev(`getTask("sonra").dueDate`), "2026-06-20");

  // Klavye eşdeğeri: Alt+ok kartı komşu gruba taşır, odak kartı takip eder.
  await ev(`switchTaskView("list"); flushRenderQueue(true);
            document.getElementById("toasts").textContent = ""; true`);
  const klavye = await ev(`(() => {
    const ac = () => document.querySelector('#list .card[data-id="bugun"] .card-open');
    ac().focus();
    ac().dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowDown", altKey:true,
      bubbles:true, cancelable:true }));
    const x = getTask("bugun");
    const a = document.activeElement;
    return [x.dueDate, bucketOf(x, today),
            a && a.closest(".card") && a.closest(".card").getAttribute("data-id"),
            a && a.className,
            document.getElementById("selLive").textContent];
  })()`);
  check("T5.2: Alt+↓ kartı sonraki gruba taşır, odak kartı TAKİP eder",
    klavye.slice(0, 4), ["2026-05-11", "tomorrow", "bugun", "card-open"]);
  check("T5.2: taşıma ekran okuyucuya bildirildi", /taşındı|moved/.test(klavye[4]), true);

  // Uçta hareket yok ama SESSİZ de değil.
  const uc = await ev(`(() => {
    document.getElementById("selLive").textContent = "";
    const once = getTask("bugun").dueDate;
    const ac = document.querySelector('#list .card[data-id="bugun"] .card-open');
    ac.focus();
    ac.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowUp", altKey:true,
      bubbles:true, cancelable:true }));
    return [once === getTask("bugun").dueDate, document.getElementById("selLive").textContent];
  })()`);
  check("T5.2: uçta Alt+↑ veriyi değiştirmez ama duyurur",
    [uc[0], /taşınamaz|move further/.test(uc[1])], [true, true]);

  // Sade ok tuşu HÂLÂ seçim gezintisi: Alt dalı onu yutmamalı.
  check("T5.2: Alt'sız ok tuşu hâlâ gezinti (taşıma değil)",
    await ev(`(() => { const once = getTask("yarin").dueDate;
      const ac = document.querySelector('#list .card[data-id="yarin"] .card-open');
      ac.focus();
      ac.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowDown", bubbles:true, cancelable:true }));
      return once === getTask("yarin").dueDate; })()`), true);

  // GECİKMİŞ bırakma hedefi değil.
  await ev(`(() => { state.tasks.push({ id:"gec", title:"gec", notes:"", dueDate:"2026-05-01",
      priority:"med", tags:[], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, recur:null, sourceNoteId:null });
    render(); flushRenderQueue(true); document.getElementById("toasts").textContent = ""; return true; })()`);
  const gecikmis = await ev(surukle("yarin", "overdue", 11));
  check("T5.2: GECİKMİŞ kovası bırakma hedefi DEĞİL",
    [gecikmis.hedefIsaretli, gecikmis.etiket,
     await ev(`getTask("yarin").dueDate`)],
    [false, "Buraya bırakılamaz", "2026-05-11"]);

  /* Seçim varsa sürükleme SEÇİMİN TAMAMINI taşır. Üç görev seçip birini
     sürükleyip yalnız onun taşındığını görmek, seçimin ne işe yaradığı
     konusunda yanıltıcı olurdu. */
  await ev(`(() => {
    clearSelection(); today = "2026-05-10"; ui.q = ""; switchTaskView("list");
    const mk = (id, due) => ({ id, title:id, notes:"", dueDate:due, priority:"med", tags:[],
      subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z",
      updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, recur:null, sourceNoteId:null });
    state.tasks = [mk("s1","2026-05-10"), mk("s2","2026-05-10"), mk("s3","2026-06-20")];
    const box = document.getElementById("list");
    box.__taskList = null; box.textContent = "";
    render(); flushRenderQueue(true);
    selToggle("s1"); selToggle("s2");
    document.getElementById("toasts").textContent = "";
    return ui.sel.size;
  })()`);
  await ev(surukle("s1", "later", 13));
  check("T5.2: seçim varsa sürükleme SEÇİMİN TAMAMINI taşır",
    await ev(`[getTask("s1").dueDate, getTask("s2").dueDate, getTask("s3").dueDate]`),
    ["2026-05-18", "2026-05-18", "2026-06-20"]);
  check("T5.2: çoklu taşıma da TEK adımda geri alınır",
    await ev(`(() => { const b = document.querySelector(".toasts .toast button:not(.btn-icon)");
      if (!b) return "geri al yok"; b.click();
      return [getTask("s1").dueDate, getTask("s2").dueDate]; })()`),
    ["2026-05-10", "2026-05-10"]);
  await ev(`clearSelection(); document.getElementById("toasts").textContent = ""; true`);


}, { browser: flag("--browser"), waitFor: "typeof renderList === 'function' && document.getElementById('list')" });

let bad = 0;
for (const c of checks){
  console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  if (!c.pass){ console.log(`      beklenen: ${JSON.stringify(c.expected)}`); console.log(`      gelen   : ${JSON.stringify(c.actual)}`); bad++; }
}
console.log(`\nbehavior: ${checks.length - bad}/${checks.length} geçti`);
process.exit(bad ? 1 : 0);
