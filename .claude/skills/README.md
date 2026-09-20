# Vendor'lanmış skiller — `addyosmani/agent-skills`

Bu klasördeki 25 skill bize ait değildir. Kaynağı:

| | |
|---|---|
| **Kaynak** | https://github.com/addyosmani/agent-skills |
| **Commit** | `c004a74784a08295d52749b04cda634125b9a581` (2026-09-17) |
| **Lisans** | MIT — © 2025 Addy Osmani (tam metin: `LICENSE`) |
| **Kapsam** | `skills/` + `references/`. Upstream'in `evals/`, `scripts/`, `hooks/`, `docs/`, `commands/` klasörleri **alınmadı** — TaskHub'ı ilgilendirmiyorlar. |

## Neden `.claude/skills/` altında

Claude Code proje skillerini **yalnızca** `.claude/skills/<ad>/SKILL.md` yolundan
yükler. Başka isimde bir klasör (`claude-skills/` gibi) depoda durur ama oturumda
devreye girmez. Buraya konduğu için TaskHub'da açılan her Claude Code oturumu 25
skill'i kendiliğinden görür.

## `../references/` neden ayrı duruyor

Skiller paylaşılan kontrol listelerine `../../references/<dosya>.md` diye atıf
yapar — bu yol `skills/<ad>/SKILL.md`'ye göreli olduğundan `references/`
klasörünün `skills/` ile **kardeş** olması gerekir. Bu yüzden `.claude/skills/`
ve `.claude/references/` yan yana duruyor; içeri taşınırsa 20 atıf kırılır.
`.claude/references/` de aynı upstream'den, aynı lisansla gelir.

## Bedeli

25 skill'in açıklaması her oturumun bağlamına yüklenir. Bir skill'i kullanmıyorsan
klasörünü silmek onu tamamen devre dışı bırakır; kalanları etkilemez.

## Güncelleme

```bash
git clone --depth 1 https://github.com/addyosmani/agent-skills /tmp/agent-skills
rm -rf .claude/skills .claude/references
cp -R /tmp/agent-skills/skills     .claude/skills
cp -R /tmp/agent-skills/references .claude/references
cp    /tmp/agent-skills/LICENSE    .claude/skills/LICENSE
# bu dosyayı geri koy ve yukarıdaki commit satırını güncelle
```

Kopyalamadan sonra doğrula: her klasörde `SKILL.md` var mı, frontmatter'daki
`name` klasör adıyla eşleşiyor mu, `../../references/…` atıfları çözülüyor mu.
