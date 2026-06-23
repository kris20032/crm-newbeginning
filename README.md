# CRM — New Beginning

Mega prosty, własny CRM dla zespołu (lejek jak w Notion + komentarze). Jeden backend = jedno źródło prawdy.

## Z czego się składa
- **Front** (`index.html`, `styles.css`, `app.js`) — klikalna tablica kanban, działa w przeglądarce, na telefonie też. **Działa w 100% bez Clauda.**
- **Backend** — Supabase (Postgres, darmowy). Schemat: `schema.sql`.
- **Hosting** — GitHub Pages (darmowy).

## Tryby
- **DEMO** (domyślnie, gdy `config.js` puste) — dane przykładowe, nic się nie zapisuje, bez logowania. Do oglądania/poprawiania wyglądu.
- **NA ŻYWO** — po wklejeniu danych Supabase do `config.js`: logowanie e-mailem + zapis do wspólnej bazy.

## Jak ruszyć na żywo (kroki)
1. Załóż darmowy projekt na https://supabase.com (rekomendacja: na mailu biznesowym, nie prywatnym).
2. Supabase → **SQL Editor** → wklej `schema.sql` → **Run**.
3. Supabase → **Settings → API** → skopiuj **Project URL** i **anon public key** → wklej do `config.js`.
4. Supabase → **Authentication → Users** → dodaj konta 5 osób (e-mail + hasło).
5. Gotowe — odśwież stronę, zaloguj się.

## Lejek (etapy) i pola — patrz `app.js` (STATUSES) — odwzorowane 1:1 z Notion.

## Własność kart
Granica „edytuj swoje / komentuj cudze" jest **umowna**: aplikacja chowa edycję na cudzych kartach (zostaje sam komentarz), ale technicznie każdy zalogowany ma dostęp. Zasada trzyma się na umowie w zespole.

## Backup (ZROBIONY — darmowy, własny)
Supabase Free nie ma wbudowanych auto-backupów, więc mamy **własny darmowy backup**: automat (launchd `com.newbeginning.crm-backup`) eksportuje całą bazę do `~/CRM-backups/*.json` o stałych porach (**9, 13, 18, 22**) oraz przy starcie/wybudzeniu Maca (nadrabia, gdy Mac spał). Trzyma ostatnie kopie; cofnięcie = restore z pliku JSON. Uwaga: kopia powstaje tylko, gdy Mac jest włączony.

Dodatkowo **usuwanie w CRM jest odwracalne** — „Usuń" wrzuca kartę do **Kosza** (soft-delete `deleted_at`); trwałe usunięcie tylko świadomie z Kosza. (Plan Supabase Pro za 25 USD/mc dałby auto-backup w chmurze — na razie niepotrzebny.)
