/* ============================ KOMUT PALETİ ==============================
 * Ctrl/Cmd+K. Linear yasası: klavyeden çağrılamayan yetenek bitmiş sayılmaz.
 *
 * Palet, kayıt defterini (src/core/commands.js) çizer ve başka hiçbir şey
 * bilmez. Yeni bir komut eklemek buraya dokunmayı gerektirmez.
 *
 * Erişilebilirlik ucuza geliyor çünkü <dialog>.showModal() kullanılıyor:
 * odak tuzağı, arka planın etkisizleşmesi (inert), aria-modal ve Esc — hepsi
 * tarayıcıdan. Elle yazılan her odak tuzağı bir hata kaynağıdır.
 *
 * Diyalog TEMBEL kurulur: Things vetosu (S8) gereği varsayılan DOM'a hiçbir
 * şey eklenmiyor; palet ilk çağrıldığında doğuyor.                          */

let paletteEl = null, paletteInput = null, paletteList = null;
let paletteItems = [], paletteIndex = 0;

const paletteOpen = () => !!(paletteEl && paletteEl.hasAttribute("open"));

function buildPalette(){
  paletteInput = el("input", {
    class:"input", id:"palQ", autocomplete:"off", spellcheck:"false",
    role:"combobox", "aria-expanded":"true", "aria-controls":"palList",
    "aria-autocomplete":"list", "aria-label": t("palette"), placeholder: t("palettePh"),
    oninput(){ renderPaletteList(); },
    onkeydown(e){
      if (e.key === "ArrowDown"){ e.preventDefault(); movePalette(1); }
      else if (e.key === "ArrowUp"){ e.preventDefault(); movePalette(-1); }
      else if (e.key === "Home"){ e.preventDefault(); setPaletteIndex(0); }
      else if (e.key === "End"){ e.preventDefault(); setPaletteIndex(paletteItems.length - 1); }
      else if (e.key === "Enter"){ e.preventDefault(); runPaletteItem(paletteIndex); }
    }
  });
  paletteList = el("ul", { class:"pal-list", id:"palList", role:"listbox", "aria-label": t("palette") });
  paletteEl = el("dialog", { class:"palette", id:"palette", "aria-label": t("palette"),
    oncancel(e){ e.preventDefault(); closePalette(); },
    onclick(e){ if (e.target === paletteEl) closePalette(); }     // dışına tıklama
  }, el("div", { class:"pal-head" }, paletteInput), paletteList,
     el("div", { class:"pal-foot", text: t("paletteHint") }));
  document.body.appendChild(paletteEl);
}

function openPalette(){
  if (!paletteEl) buildPalette();
  paletteInput.value = "";
  renderPaletteList();
  if (typeof paletteEl.showModal === "function") paletteEl.showModal();
  else { paletteEl.setAttribute("open", ""); paletteEl.classList.add("dlg-fallback"); }
  paletteInput.focus();
}

function closePalette(){
  if (!paletteEl) return;
  if (typeof paletteEl.close === "function" && paletteEl.hasAttribute("open")) paletteEl.close();
  paletteEl.removeAttribute("open");
  paletteEl.classList.remove("dlg-fallback");
}

function setPaletteIndex(i){
  if (!paletteItems.length){ paletteIndex = 0; return; }
  paletteIndex = Math.max(0, Math.min(paletteItems.length - 1, i));
  const opts = paletteList.children;
  for (let k = 0; k < opts.length; k++){
    const on = k === paletteIndex;
    opts[k].classList.toggle("on", on);
    opts[k].setAttribute("aria-selected", String(on));
  }
  const cur = opts[paletteIndex];
  if (cur){
    paletteInput.setAttribute("aria-activedescendant", cur.id);
    if (cur.scrollIntoView) cur.scrollIntoView({ block:"nearest" });
  }
}

function movePalette(d){
  if (!paletteItems.length) return;
  // Uçlarda sarar: uzun listede sona gitmek için yukarı basmak hızlıdır.
  setPaletteIndex((paletteIndex + d + paletteItems.length) % paletteItems.length);
}

function renderPaletteList(){
  const q = paletteInput ? paletteInput.value : "";
  paletteItems = matchCommands(availableCommands(), q);
  paletteList.textContent = "";
  if (!paletteItems.length){
    paletteList.append(el("li", { class:"pal-empty", text: t("paletteEmpty") }));
    paletteInput.removeAttribute("aria-activedescendant");
    return;
  }
  paletteItems.forEach((cmd, i) => {
    paletteList.append(el("li", {
      class:"pal-item", id:"palOpt" + i, role:"option", "aria-selected":"false",
      onmousemove(){ setPaletteIndex(i); },
      onclick(){ runPaletteItem(i); }
    },
      el("span", { class:"pal-label", text: cmd.label() }),
      cmd.keys ? el("kbd", { class:"pal-keys", text: cmd.keys }) : null,
      cmd.hint ? el("span", { class:"pal-hint", text: cmd.hint() }) : null
    ));
  });
  setPaletteIndex(0);
}

function runPaletteItem(i){
  const cmd = paletteItems[i];
  if (!cmd) return;
  closePalette();
  // Kapanma odağı geri verirken komut da odakla oynayabilir; komut sonra
  // çalışsın ki son sözü o söylesin.
  setTimeout(() => { try { cmd.run(); } catch (err){ console.error(err); } }, 0);
}

document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")){
    e.preventDefault();
    paletteOpen() ? closePalette() : openPalette();
  }
});

/* -------------------------------------------------- T2.7: komut kayıtları
 * Bugüne kadar yalnız düğmeyle ulaşılan her aksiyon buraya girer. Düğmelerin
 * hiçbiri kaldırılmadı: palet bir EK yoldur, ikame değil.
 *
 * `when` bağlama duyarlılık içindir — notlar görünümündeyken "CSV indir"
 * listelenmez. Listelenmeyen komut, kullanıcının aradığı komutu bulmasını
 * kolaylaştırır; gri bir satır göstermek yalnız gürültüdür.                */
const isTasks = () => ui.view !== "notes";
const isNotes = () => ui.view === "notes";

[
  { id:"view.tasks", label:() => t("cmdViewTasks"), when:isNotes, run(){ switchView("tasks"); } },
  { id:"view.notes", label:() => t("cmdViewNotes"), when:isTasks, run(){ switchView("notes"); } },

  { id:"taskview.list", label:() => t("cmdViewList"), when:() => isTasks() && ui.taskView !== "list",
    run(){ switchTaskView("list"); } },
  { id:"taskview.board", label:() => t("cmdViewBoard"), when:() => isTasks() && ui.taskView !== "board",
    run(){ switchTaskView("board"); } },

  { id:"taskview.calendar", label:() => t("cmdViewCalendar"), when:() => isTasks() && ui.taskView !== "calendar",
    run(){ switchTaskView("calendar"); } },

  { id:"task.new", label:() => t("cmdNewTask"), keys:"N", when:isTasks,
    run(){ const q = document.getElementById("quick"); if (q) q.focus(); } },
  { id:"search.focus", label:() => t("cmdSearch"), keys:"/", when:isTasks,
    run(){ const q = document.getElementById("q"); if (q){ q.focus(); q.select(); } } },
  { id:"filters.clear", label:() => t("clearFilters"), when:() => isTasks() && filtersActive(),
    run(){ clearFilters(); } },
  { id:"completed.toggle", label:() => t("cmdToggleCompleted"), when:isTasks,
    run(){ ui.showCompleted = !ui.showCompleted; renderList(); } },

  { id:"notebook.new", label:() => t("cmdNewNotebook"), when:isNotes,
    run(){ addNotebook(); renamingNbId = ui.nbId; renderNotesView(); } },
  { id:"page.new", label:() => t("cmdNewPage"), keys:"N", when:isNotes,
    run(){ if (addPage(ui.nbId)){ renderNotesView(); focusPageTitle(); } } },

  { id:"theme.cycle", label:() => t("cmdTheme"), hint:() => themeTitle(), run(){ cycleTheme(); } },
  { id:"lang.toggle", label:() => t("cmdLang"), run(){ toggleLang(); } },

  { id:"export.json", label:() => t("exportJson"), run(){ exportJson(); } },
  { id:"import.json", label:() => t("importJson"), run(){ pickImport(); } },
  { id:"export.csv", label:() => t("exportCsv"), when:isTasks, run(){ exportCsv(); } },
  { id:"export.notes", label:() => t("exportNotesHtml"), when:isNotes, run(){ exportNotesHtml(); } },

  { id:"print", label:() => t("cmdPrint"), keys:"Ctrl+P", run(){ window.print(); } },
].forEach(registerCommand);
