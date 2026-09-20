const PRIO_ORDER = { high:0, med:1, low:2 };
function sortTasks(list){
  return list.slice().sort((a,b) => {
    if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    const pa = PRIO_ORDER.hasOwnProperty(a.priority) ? PRIO_ORDER[a.priority] : 3;
    const pb = PRIO_ORDER.hasOwnProperty(b.priority) ? PRIO_ORDER[b.priority] : 3;
    const p = pa - pb;
    if (p) return p;
    return ts(a.createdAt) - ts(b.createdAt);
  });
}

function uid(){
  try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
  return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

