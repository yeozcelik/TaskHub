/* ------------------------------------------------------- görünüm geçişleri ---
 * View Transitions API ile liste ↔ pano ↔ takvim ve görevler ↔ notlar
 * geçişlerine yumuşak bir geçiş. Tamamen İLERİCİ GELİŞTİRME: API yoksa da,
 * kullanıcı hareketi istemiyorsa da iş aynen yapılır, yalnız anında yapılır.
 *
 * ANİMASYON JESTİN PARÇASIDIR, DURUM DEĞİŞİMİNİN DEĞİL.
 * `switchTaskView`/`switchView` senkron kalır; sarmalayıcı yalnız kullanıcının
 * tıkladığı/komut çalıştırdığı yerde devreye girer. Sebebi mimari: geri
 * yükleme, test ya da bir kısayolun zincirleme çağrısı animasyon beklemek
 * zorunda değildir — ve `startViewTransition` geri çağrıyı BİR SONRAKİ KAREYE
 * ertelediği için, durum değişimini sarmak bütün programatik çağrıları
 * asenkron yapardı.                                                          */

/** Kullanıcı hareket istiyor mu? Her çağrıda sorulur: işletim sistemi ayarı
 *  oturum ortasında değişebilir ve önbelleklemek onu görmezden gelmek olurdu.
 *
 *  Sorgulayamıyorsak cevap HAYIR. Hareket duyarlılığı bir tercih değil bir
 *  erişilebilirlik ihtiyacıdır; şüphede kalınca kıpırdamamak doğrusu. */
function motionAllowed(){
  try { return !matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch (e){ return false; }
}

/** `apply` TAM OLARAK BİR KEZ çalışır — geçiş olsun olmasın, API patlasın
 *  patlamasın. Geçiş yalnız bir görsel katmandır; işin kendisi ona bağlı
 *  olamaz, yoksa animasyonu desteklemeyen tarayıcıda uygulama donardı. */
function withViewTransition(apply){
  let ran = false;
  const once = () => { if (ran) return; ran = true; apply(); };

  const start = document.startViewTransition;
  if (typeof start !== "function" || !motionAllowed()){ once(); return null; }

  try {
    const tr = start.call(document, once);
    /* Geçiş iptal edilebilir (başka bir geçiş başlarsa, sekme arkaplana
       düşerse). Reddi yutmuyoruz diye konsola yakalanmamış hata düşmesin;
       `once` yine de çalışmış olur. */
    if (tr && tr.finished && tr.finished.catch) tr.finished.catch(() => {});
    if (tr && tr.updateCallbackDone && tr.updateCallbackDone.catch) tr.updateCallbackDone.catch(once);
    return tr;
  } catch (e){
    once();                       // API var ama reddetti: iş yine yapılır
    return null;
  }
}

/** Görev görünümü seçimi (liste/pano/takvim) — kullanıcı jestinden. */
function pickTaskView(v){
  if (ui.taskView === v) return;         // aynı görünüm: boş geçiş başlatma
  withViewTransition(() => switchTaskView(v));
}

/** Görevler ↔ notlar — kullanıcı jestinden. */
function pickView(v){
  if (ui.view === v) return;
  withViewTransition(() => switchView(v));
}
