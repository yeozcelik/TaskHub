# `.claude/` — Ajan Skill'leri

Bu dizin TaskHub'ın kendi uygulamasına ait **değildir**. Kod yazan yapay zekâ
ajanlarının (Claude Code ve benzerleri) bu depoda çalışırken kullandığı
yönerge paketidir. `index.html`'in çalışmasıyla hiçbir ilgisi yoktur — uygulamayı
çift tıklayıp açan kullanıcı bu dizini hiç görmez.

## Kaynak

| | |
|---|---|
| Depo | [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) |
| Sürüm | `0.6.10` |
| Commit | `c004a74784a08295d52749b04cda634125b9a581` |
| Alındığı tarih | 2026-09-20 |
| Lisans | MIT (aşağıda) |

Paket, eklenti olarak referansla değil **depoya kopyalanarak** eklendi. Böylece
TaskHub'ın "kurulum yok, sunucu yok, internet yok" ilkesi ajan tarafında da
geçerli olur: depoyu klonlayan herkeste skill'ler internet ya da eklenti kurulum
adımı olmadan hazır gelir.

## Yerleşim

```
.claude/
├── skills/       25 skill, her biri kendi dizininde SKILL.md
└── references/   11 skill'in paylaştığı 7 kontrol listesi
```

`references/` dizininin yeri **zorunludur, keyfî değildir.** 11 skill bu
dosyaları `../../references/` göreli yoluyla çağırır. Bu yol
`.claude/skills/<ad>/SKILL.md` konumundan tam olarak `.claude/references/`
adresine çözülür. Dizin taşınır ya da atlanırsa o 11 skill kırılır — yukarı akışta
[#361](https://github.com/addyosmani/agent-skills/issues/361) olarak izlenen
taşınabilirlik boşluğu budur. Tek tek `npx skills add` ile kurulum yapılsaydı bu
dizin gelmeyecekti.

## Güncelleme

Yukarı akıştaki yeni sürüme geçmek için paketi yeniden kopyala:

```bash
git clone --depth 1 https://github.com/addyosmani/agent-skills.git /tmp/agent-skills
rm -rf .claude/skills .claude/references
cp -a /tmp/agent-skills/skills     .claude/skills
cp -a /tmp/agent-skills/references .claude/references
git -C /tmp/agent-skills rev-parse HEAD   # yukarıdaki tabloyu bu SHA ile güncelle
```

Kopyalamadan sonra göreli yolların hâlâ çözüldüğünü doğrula: her `SKILL.md`
içindeki `../../references/*.md` bağlantılarının karşılığı `.claude/references/`
altında var olmalı.

## Skill'ler

Hangi skill'in ne zaman devreye girdiğini her `SKILL.md` dosyasının başındaki
`description` alanı belirler; ajan eşleşmeyi bu alan üzerinden yapar. Paketin
kendi rehberi `skills/using-agent-skills/SKILL.md` dosyasındadır.

| Skill | Ne işe yarar |
|---|---|
| `using-agent-skills` | Hangi skill'in uygulanacağını seçer (meta) |
| `interview-me` | Gerçekte ne istendiğini tek tek soruyla çıkarır |
| `idea-refine` | Ham fikri keskin, uygulanabilir bir kavrama indirger |
| `spec-driven-development` | Kod yazmadan önce şartname üretir |
| `planning-and-task-breakdown` | İşi sıralı görevlere böler |
| `constraint-driven-development` | Kalite çıtasını yazılı sözleşmeye bağlar |
| `context-engineering` | Ajan bağlamını düzenler |
| `source-driven-development` | Her kararı resmî dokümana dayandırır |
| `incremental-implementation` | Değişikliği ince, doğrulanabilir dilimlerde ilerletir |
| `test-driven-development` | Kırmızı-yeşil-yeniden düzenle döngüsü |
| `doubt-driven-development` | Her kararı karşıt görüşle sınar |
| `debugging-and-error-recovery` | Kök nedene sistematik iner |
| `frontend-ui-engineering` | Erişilebilir, duyarlı arayüz kurar |
| `browser-testing-with-devtools` | Gerçek tarayıcıda Chrome DevTools MCP ile test eder |
| `api-and-interface-design` | Kalıcı API ve modül sınırları tasarlar |
| `performance-optimization` | Başarım darboğazlarını ölçer ve giderir |
| `security-and-hardening` | Açıklara karşı sertleştirir |
| `observability-and-instrumentation` | Üretim davranışını görünür kılar |
| `code-review-and-quality` | Birleştirmeden önce çok eksenli inceleme |
| `code-simplification` | Davranışı değiştirmeden okunurluğu artırır |
| `git-workflow-and-versioning` | Commit, dal ve çakışma düzenini kurar |
| `documentation-and-adrs` | Kararları ve gerekçesini kayda geçirir |
| `ci-cd-and-automation` | Derleme ve dağıtım hatlarını otomatikleştirir |
| `deprecation-and-migration` | Eskitme ve göç süreçlerini yönetir |
| `shipping-and-launch` | Üretime çıkış öncesi kontrol listesi |

## Lisans

Bu dizindeki `skills/` ve `references/` içeriği yukarı akış deposundan
değiştirilmeden kopyalanmıştır ve MIT lisansı altındadır. Aşağıdaki bildirim,
lisansın gereği olarak kopyayla birlikte taşınır:

```
MIT License

Copyright (c) 2025 Addy Osmani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
