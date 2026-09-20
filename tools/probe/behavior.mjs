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
  const EXPECTED = ["view.tasks","view.notes","task.new","search.focus","filters.clear",
    "completed.toggle","notebook.new","page.new","theme.cycle","lang.toggle",
    "export.json","import.json","export.csv","export.notes","print"];
  const registered = await ev(`COMMANDS.map(c => c.id).sort()`);
  check("S6: kayıtlı komut envanteri eksiksiz", registered, EXPECTED.slice().sort());

  await ev(`switchView("tasks");`);

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
