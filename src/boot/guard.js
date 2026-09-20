(function(){
  var shown = false;
  function report(what, detail){
    if (shown) return; shown = true;
    var box = document.createElement("div");
    box.className = "bootfail";
    var h = document.createElement("h1");
    h.appendChild(document.createTextNode("TaskHub açılamadı"));
    var p1 = document.createElement("p");
    p1.appendChild(document.createTextNode(
      "Tarayıcın bu uygulamayı çalıştıramadı. Genellikle sebebi tarayıcının çok eski olmasıdır — " +
      "güncel bir Firefox veya Chrome ile açmayı dene."));
    var p2 = document.createElement("p");
    p2.className = "bootfail-detail";
    p2.appendChild(document.createTextNode(what + (detail ? ": " + detail : "")));
    var p3 = document.createElement("p");
    p3.className = "bootfail-detail";
    p3.appendChild(document.createTextNode(navigator.userAgent));
    box.appendChild(h); box.appendChild(p1); box.appendChild(p2); box.appendChild(p3);
    var root = document.getElementById("root");
    if (root && root.parentNode) root.parentNode.insertBefore(box, root);
    else if (document.body) document.body.appendChild(box);
  }
  window.addEventListener("error", function(e){
    report(e && e.message ? e.message : "Bilinmeyen hata",
           e && e.filename ? "satır " + e.lineno : "");
  });
  window.addEventListener("unhandledrejection", function(e){
    report("İşlenmeyen hata", e && e.reason ? String(e.reason) : "");
  });
  // Nöbetçi: betik hiç hata vermeden de arayüzü kuramamış olabilir.
  setTimeout(function(){
    var root = document.getElementById("root");
    if (root && !root.firstChild && location.search.indexOf("test=1") === -1){
      report("Arayüz kurulamadı (betik çalışmadı)", "");
    }
  }, 1500);
})();
