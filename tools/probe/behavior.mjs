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

const ids = 'Array.from(document.querySelectorAll("#list .card")).map(n => n.getAttribute("aria-label"))';

const checks = [];
const check = (name, actual, expected) => checks.push({ name, actual, expected,
  pass: JSON.stringify(actual) === JSON.stringify(expected) });

await withPage(`file://${resolve(ROOT, "index.html")}`, async evaluate => {
  const ev = async expr => { const r = await evaluate(expr); if (r.error) throw new Error(expr + "\n  → " + r.error); return r.value; };
  await ev(SEED);

  check("üç görev çizildi", await ev(ids), ["alfa rapor", "beta rapor", "gama İstanbul"]);

  // Grup içi sıra sortTasks ile aynı olmalı: aynı tarih → öncelik (high önce).
  check("grup içi sıra: yüksek öncelik önde",
    await ev(`Array.from(document.querySelectorAll("#g-today .card")).map(n => n.getAttribute("aria-label"))`),
    ["alfa rapor", "beta rapor"]);

  // Türkçe harf katlamalı arama listede de geçerli.
  await ev(`ui.q = "istanbul"; renderList();`);
  check('arama "istanbul" → "İstanbul"u bulur', await ev(ids), ["gama İstanbul"]);

  // --- ASIL SINAMA: odak korunumu ---
  await ev(`ui.q = ""; renderList();`);
  await ev(`document.querySelector('#list .card[aria-label="beta rapor"]').focus();`);
  check("odak karta yerleşti", await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor");

  // Kartın İÇERİĞİ değişsin (imza değişir → kart yeniden kurulur).
  await ev(`state.tasks.find(t => t.id === "b").title = "beta rapor (güncel)"; renderList();`);
  check("içerik güncellendikten sonra odak KORUNDU",
    await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor (güncel)");

  // Onay kutusuna odaklanıp içerik değiştir: yuva da korunmalı.
  await ev(`document.querySelector('#list .card[aria-label="alfa rapor"] .check').focus();`);
  await ev(`state.tasks.find(t => t.id === "a").title = "alfa rapor v2"; renderList();`);
  check("odak YUVASI korundu (onay kutusu)",
    await ev(`document.activeElement.className`), "check");

  // Sıralama değişince (taşıma yolu) odak kaybolmamalı.
  await ev(`document.querySelector('#list .card[aria-label="beta rapor (güncel)"]').focus();`);
  await ev(`state.tasks.find(t => t.id === "b").priority = "high"; state.tasks.find(t => t.id === "a").priority = "low"; renderList();`);
  check("taşımadan sonra sıra değişti",
    await ev(`Array.from(document.querySelectorAll("#g-today .card")).map(n => n.getAttribute("aria-label"))`),
    ["beta rapor (güncel)", "alfa rapor v2"]);
  check("taşımadan sonra odak hâlâ aynı kartta",
    await ev(`document.activeElement.getAttribute("aria-label")`), "beta rapor (güncel)");

  // Kova değişimi: tamamlanan görev "completed" grubuna düşmeli.
  await ev(`state.tasks.find(t => t.id === "c").done = true; renderList();`);
  check("tamamlanan görev completed kovasına taşındı",
    await ev(`Array.from(document.querySelectorAll("#g-completed .card")).map(n => n.getAttribute("aria-label"))`),
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
  await ev(`new Promise(r => setTimeout(r, 30))`);
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
  const EXPECTED = ["view.tasks","view.notes","taskview.list","taskview.board",
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
    await ev(`!!document.querySelector("#list.board .card .card-title")`), true);
  await ev(`switchTaskView("list"); true`);

  // Bu blok state'i değiştirdi; sonraki iddiaların beklediği düzeni geri kur.
  await ev(`state.tasks = [
    { id:"a", title:"alfa v3", notes:"", dueDate:"2026-05-10", priority:"low", tags:["iş"], subtasks:[], done:false, createdAt:"2026-01-01T00:00:00.000Z", updatedAt:"2026-01-01T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"b", title:"beta rapor (güncel)", notes:"", dueDate:"2026-05-10", priority:"high", tags:[], subtasks:[], done:false, createdAt:"2026-01-02T00:00:00.000Z", updatedAt:"2026-01-02T00:00:00.000Z", completedAt:null, sourceNoteId:null },
    { id:"c", title:"gama İstanbul", notes:"", dueDate:null, priority:"med", tags:[], subtasks:[], done:true, createdAt:"2026-01-03T00:00:00.000Z", updatedAt:"2026-01-03T00:00:00.000Z", completedAt:"2026-01-03T00:00:00.000Z", sourceNoteId:null },
  ]; ui.q = ""; renderList();`);

  // Boş durum ve geri dönüş: durum sıfırlanıp tekrar kurulabilmeli.
  await ev(`ui.q = "hicbirseyeuymaz"; renderList();`);
  check("eşleşme yoksa boş durum", await ev(`!!document.querySelector("#list .empty")`), true);
  await ev(`ui.q = ""; renderList();`);
  check("boş durumdan sonra liste yeniden kurulur", await ev(`document.querySelectorAll("#list .card").length`), 3);
}, { browser: flag("--browser"), waitFor: "typeof renderList === 'function' && document.getElementById('list')" });

let bad = 0;
for (const c of checks){
  console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
  if (!c.pass){ console.log(`      beklenen: ${JSON.stringify(c.expected)}`); console.log(`      gelen   : ${JSON.stringify(c.actual)}`); bad++; }
}
console.log(`\nbehavior: ${checks.length - bad}/${checks.length} geçti`);
process.exit(bad ? 1 : 0);
