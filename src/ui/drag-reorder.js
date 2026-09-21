/* ------------------------------------------------------- sürükle ve bırak ---
 * Bir kartı sürüklemek onu BAŞKA BİR GRUBA taşır; grup içinde yeniden
 * sıralamaz. Gerekçe docs/adr/0003: grup içi sıra türetilmiştir, saklanmaz —
 * "üç sıra yukarı" diye bir veri yok, bırakılan kart yerine geri dönerdi.
 * Bırakılan grubun TANIMLADIĞI alan değişir: listede son tarih, panoda
 * öncelik, "Tamamlananlar"da bitmişlik.
 *
 * Mekanik Pointer Events üstünde: fare, dokunmatik ve kalem tek kod yolundan
 * geçer (tuvalde de kullanılan desen). Sürükleme TUTAMAKTAN başlar, kartın
 * her yerinden değil — sebebi dokunmatik: `touch-action:none` kartın tamamına
 * konsaydı listeyi parmakla kaydırmak imkânsız olurdu.                       */

const DRAG_START_PX = 6;          // bu kadar oynamadan sürükleme başlamaz
let dragging = null;

/** Ekran okuyucu duyurusu. Seçim duyurularıyla aynı canlı bölgeyi kullanır:
 *  iki ayrı canlı bölge, ikisinin de sırayla okunmasına güvenmek demektir. */
function announce(msg){
  const live = document.getElementById("selLive");
  if (live) live.textContent = msg;
}

/** Grup anahtarının kullanıcıya görünen adı. Panoda sütunlar öncelik
 *  adlarını kullanır, listede kova adlarını — izdüşüm farkı (projections.js). */
function groupLabel(key, view){
  if (key === "completed") return t("b_completed");
  return view === "board" ? t(key) : t("b_" + key);
}

const dragView = () => ui.taskView === "board" ? "board" : "list";

/** Bir görevin ŞU ANKİ grubu. Ekrandaki bölüm anahtarıyla aynı olmalı;
 *  kaynağı da aynı: izdüşümler. */
function groupOfTask(task){
  return dragView() === "board"
    ? (task.done ? "completed" : task.priority)
    : bucketOf(task, today);
}

/* Ekranda BULUNAN grup anahtarları, görünen sırayla. DOM'dan okunur çünkü
   klavye de fare de kullanıcının GÖRDÜĞÜ şeye göre çalışmalı: hesapta var
   olup ekranda olmayan bir kovaya taşımak "hiçbir şey olmadı" gibi görünür. */
function presentGroups(){
  return Array.prototype.map.call(
    document.querySelectorAll("#list [data-group]"), n => n.getAttribute("data-group"));
}

/* ------------------------------------------------------------ taşıma işi --- */

/** Verilen görevleri bir gruba taşır. TEK geri alma adımı üretir; hiçbiri
 *  değişmiyorsa hiçbir şey yapmaz (ne bildirim, ne geri alma, ne kayıt).
 *  @returns taşınan görev sayısı */
function moveTasksToGroup(ids, groupKey){
  const view = dragView();
  const fields = dropFields(groupKey, view, today);
  if (!fields) return 0;
  const hedefler = ids.map(getTask).filter(x => x && fieldsChange(x, fields));
  if (!hedefler.length) return 0;

  const snap = snapshotTasks(hedefler.map(x => x.id));
  const spawned = [];
  for (const task of hedefler){
    /* Tamamlama YOLU TEK: tekrar kuralı olan bir görev tamamlanınca sonraki
       örneği üretilir. `bulkDone` da bunu böyle yapıyor; sürükleme ayrı bir
       tamamlama yolu açarsa tekrar kuralları sessizce atlanırdı. */
    if (Object.prototype.hasOwnProperty.call(fields, "done") && fields.done !== task.done){
      task.done = fields.done;
      task.completedAt = fields.done ? new Date().toISOString() : null;
      if (fields.done){ const nx = spawnNextOccurrence(task); if (nx) spawned.push(nx.id); }
    }
    if (Object.prototype.hasOwnProperty.call(fields, "dueDate")) task.dueDate = fields.dueDate;
    if (Object.prototype.hasOwnProperty.call(fields, "priority")) task.priority = fields.priority;
    stamp(task);
  }
  scheduleSave(); render();

  const g = groupLabel(groupKey, view);
  const msg = hedefler.length === 1
    ? t("movedTo", { s: noteTextOfTitle(hedefler[0].title), g })
    : t("movedN", { n: hedefler.length, g });
  announce(msg);
  toast(msg, { label: t("undo"), run(){ restoreSnapshot(snap, spawned); } }, 8000);
  return hedefler.length;
}

/** Tek kartın taşınması — ama kart SEÇİLİYSE bütün seçim taşınır.
 *  Üç görev seçip birini sürükleyip yalnız onun taşındığını görmek, seçimin
 *  ne işe yaradığı konusunda kullanıcıyı yanıltırdı (Finder ve Linear da
 *  seçimin tamamını taşır).
 *  @returns taşındıysa true */
function moveTaskToGroup(id, groupKey){
  const ids = (ui.sel.size > 1 && ui.sel.has(id)) ? [...ui.sel] : [id];
  return moveTasksToGroup(ids, groupKey) > 0;
}

/** Klavye eşdeğeri: `Alt+↑/↓` kartı önceki/sonraki gruba taşır.
 *  Fare kullanamayan biri için sürüklemenin tam karşılığı bu. */
function moveTaskByKeyboard(id, delta){
  const task = getTask(id);
  if (!task) return;
  const view = dragView();
  const target = neighborGroup(presentGroups(), groupOfTask(task), delta, view, today);
  if (!target){ announce(t("moveEdge")); return; }
  if (moveTaskToGroup(id, target)) focusCardOpen(id);
}

/* --------------------------------------------------------- işaretçi yolu --- */

function dropTargetAt(x, y){
  const node = document.elementFromPoint(x, y);
  if (!node || !node.closest) return null;
  const sec = node.closest("#list [data-group]");
  if (!sec) return null;
  const key = sec.getAttribute("data-group");
  if (!dropFields(key, dragView(), today)) return null;    // geçersiz hedef (gecikmiş)
  return { key, node: sec };
}

function dragLabelNode(){
  let n = document.getElementById("dragLabel");
  if (!n){
    n = el("div", { class:"drag-label", id:"dragLabel", "aria-hidden":"true" });
    document.body.appendChild(n);
  }
  return n;
}

function dragBegin(ev){
  dragging.active = true;
  dragging.card.classList.add("dragging");
  document.body.classList.add("dragging-on");
  announce(t("dragStarted", { s: dragging.title }));
  window.addEventListener("keydown", dragKey, true);
}

function dragKey(e){
  if (e.key !== "Escape") return;
  e.preventDefault(); e.stopPropagation();
  dragEnd(false);
  announce(t("dragCancelled"));
}

function dragTo(x, y){
  const hit = dropTargetAt(x, y);
  const key = hit ? hit.key : null;
  if (key !== dragging.targetKey){
    if (dragging.targetNode) dragging.targetNode.classList.remove("drop-target");
    dragging.targetKey = key;
    dragging.targetNode = hit ? hit.node : null;
    if (hit) hit.node.classList.add("drop-target");
    if (key) announce(t("dropOn", { g: groupLabel(key, dragView()) }));
  }
  const lbl = dragLabelNode();
  lbl.textContent = key ? t("dropOn", { g: groupLabel(key, dragView()) }) : t("dropNone");
  lbl.classList.toggle("bad", !key);
  lbl.style.left = Math.round(x) + "px";
  lbl.style.top  = Math.round(y) + "px";
  lbl.classList.add("on");
}

/** Sürüklemeyi bitirir. `apply` false ise hiçbir şey değişmez — iptal,
 *  işaretçi kaybı ve Escape aynı yoldan geçer ki yarım durum kalmasın. */
function dragEnd(apply){
  if (!dragging) return;
  const d = dragging;
  dragging = null;
  window.removeEventListener("keydown", dragKey, true);
  if (d.targetNode) d.targetNode.classList.remove("drop-target");
  if (d.card) d.card.classList.remove("dragging");
  document.body.classList.remove("dragging-on");
  const lbl = document.getElementById("dragLabel");
  if (lbl) lbl.classList.remove("on");
  try { if (d.grip.hasPointerCapture(d.pointerId)) d.grip.releasePointerCapture(d.pointerId); } catch (e){}
  if (apply && d.active && d.targetKey) moveTaskToGroup(d.id, d.targetKey);
}

/** Tutamağa basıldı. Sürükleme HENÜZ başlamaz: eşik aşılmadan basmak
 *  sürükleme sayılmaz, yoksa titrek bir el her tıklamayı taşımaya çevirirdi. */
function dragDown(e, task, card){
  if (e.button != null && e.button !== 0) return;      // yalnız birincil düğme
  if (dragging) dragEnd(false);
  const grip = e.currentTarget;
  dragging = { id: task.id, title: noteTextOfTitle(task.title), card, grip,
               pointerId: e.pointerId, x0: e.clientX, y0: e.clientY,
               active: false, targetKey: null, targetNode: null };
  try { grip.setPointerCapture(e.pointerId); } catch (err){}
  e.preventDefault();
  e.stopPropagation();
}

function dragMove(e){
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  if (!dragging.active){
    if (Math.abs(e.clientX - dragging.x0) + Math.abs(e.clientY - dragging.y0) < DRAG_START_PX) return;
    dragBegin(e);
  }
  e.preventDefault();
  dragTo(e.clientX, e.clientY);
}

function dragUp(e){
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  e.preventDefault();
  dragEnd(true);
}

/** Kartın sürükleme tutamağı.
 *
 *  ERİŞİLEBİLİRLİK KARARI: tutamak `aria-hidden` ve odaklanamaz. Bu bir
 *  eksiklik değil, bilinçli bir seçim — tutamak YALNIZCA işaretçi için bir
 *  kolaylık ve klavye eşdeğeri (`Alt+↑/↓`) kartın kendi düğmesinde zaten var.
 *  Odaklanabilir yapmak her karta dördüncü bir sekme durağı eklerdi (5.000
 *  görevde 5.000 durak) ve ekran okuyucuya sürükleyemeyeceği bir denetim
 *  duyururdu. WCAG 2.1.1 klavye eşdeğeriyle, 2.5.7 de onunla karşılanıyor. */
function cardGrip(task, card){
  return el("span", {
    class:"card-grip", "aria-hidden":"true", title: t("dragMove"),
    onpointerdown(e){ dragDown(e, task, card); },
    onpointermove: dragMove,
    onpointerup: dragUp,
    onpointercancel(){ dragEnd(false); },
    onlostpointercapture(){ if (dragging && !dragging.active) dragEnd(false); }
  }, icon("grip"));
}
