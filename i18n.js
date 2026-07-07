/* i18n.js - ANGIELSKA NAKŁADKA językowa CRM (07.2026, dla Matheo/Hiszpania).
   ZASADA: zero zmian w app.js - appka renderuje po polsku, ta nakładka podmienia
   WIDOCZNE teksty na angielski, gdy użytkownik wybrał EN (przycisk-pigułka, localStorage).
   Nowe elementy (realtime/rendery) łapie MutationObserver. Przełączenie = reload.
   Cofnięcie całości = usunąć <script i18n.js> z index.html. Słownik rozszerzalny. */
(function () {
  var LANG = "pl";
  try { LANG = localStorage.getItem("crm_lang") || "pl"; } catch (e) {}

  /* ---------- przycisk-pigułka (widoczny też na ekranie logowania) ---------- */
  function addBtn() {
    var bar = document.querySelector(".topbar-right");
    var b = document.getElementById("lang-pill");
    if (!b) {
      b = document.createElement("button");
      b.id = "lang-pill"; b.type = "button";
      b.textContent = LANG === "en" ? "PL" : "EN";
      b.title = LANG === "en" ? "Przełącz na polski" : "Switch to English";
      b.onclick = function () {
        try { localStorage.setItem("crm_lang", LANG === "en" ? "pl" : "en"); } catch (e) {}
        location.reload();
      };
    }
    if (bar) {
      // NA GÓRZE, tuż PRZY ikonach (dzwonek/profil/menu) — wpnij bezpośrednio przed dzwonkiem
      var anchor = bar.querySelector(".notif-wrap") || bar.querySelector(".menu-wrap");
      if (b.parentNode !== bar) {
        b.style.cssText = "margin-right:10px;padding:7px 13px;border-radius:99px;border:1px solid #d0cdc7;" +
          "background:#fff;color:#37352f;font:600 12px/1 Inter,sans-serif;letter-spacing:.08em;cursor:pointer;" +
          "align-self:center;flex:0 0 auto";
        if (anchor) bar.insertBefore(b, anchor); else bar.appendChild(b);
      }
    } else if (!b.parentNode) {
      // ekran logowania (brak topbaru) — pigułka w rogu (jak dotąd)
      b.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:9000;" +
        "padding:6px 14px;border-radius:99px;border:1px solid #d0cdc7;background:#fff;" +
        "color:#37352f;font:600 12px/1 Inter,sans-serif;letter-spacing:.08em;cursor:pointer;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.12)";
      document.body.appendChild(b);
    }
  }

  /* ---------- słownik: dokładne teksty (PL → EN) ---------- */
  var EXACT = {
    /* logowanie / hasło */
    "Zaloguj się swoim adresem e-mail": "Sign in with your e-mail address",
    "Zaloguj": "Sign in", "hasło": "password", "e-mail": "e-mail",
    "Nie pamiętasz hasła?": "Forgot your password?",
    "Ustaw nowe hasło": "Set a new password",
    "Wpisz nowe hasło do swojego konta": "Enter a new password for your account",
    "nowe hasło (min. 6 znaków)": "new password (min. 6 characters)",
    "Zapisz nowe hasło": "Save new password",
    "Wysyłam link...": "Sending the link...",
    "Wyślij e-mail z linkiem do ustawienia nowego hasła": "Send an e-mail with a password reset link",
    "TRYB DEMO — to dane przykładowe, zmiany NIE są zapisywane. Podłącz Supabase (config.js), żeby ruszyć na żywo.":
      "DEMO MODE - sample data, changes are NOT saved. Connect Supabase (config.js) to go live.",
    /* topbar / sekcje */
    "+ Nowa karta": "+ New card",
    "Szukaj klienta, firmy, telefonu...": "Search client, company, phone...",
    "Powiadomienia": "Notifications", "Powiadomienia (@oznaczenia)": "Notifications (@mentions)",
    "Konto": "Account", "Wyloguj": "Log out", "Sekcje": "Sections",
    "Sprzedaż": "Sales", "Baza partnerów": "Partners", "Panel admina": "Admin panel",
    "Oznacz przeczytane": "Mark as read",
    /* etapy lejka */
    "Lead": "Lead", "Demo wysłane": "Demo sent", "Zainteresowany": "Interested",
    "Umowa wysłana": "Contract sent", "Umowa podpisana": "Contract signed",
    "Checklista gotowa": "Checklist ready", "W trakcie realizacji": "In progress",
    "Realizacja ukończona": "Completed",
    /* zakładki / widoki */
    "Wszyscy": "Everyone", "Wszystkie": "All", "Moje": "Mine", "Na dziś": "Today",
    "Archiwum": "Archive", "Kosz": "Trash", "Zespół": "Team",
    "Wybierz, czyje karty widać": "Choose whose cards are visible",
    "Brak kart do wyświetlenia.": "No cards to show.",
    /* karta klienta / pola */
    "Klient": "Client", "Firma": "Company", "Telefon": "Phone", "Etap": "Stage",
    "Osoba": "Owner", "Email": "Email", "E-mail": "E-mail", "Notatki": "Notes",
    "Komentarze": "Comments", "Strona internetowa": "Website", "Demo": "Demo",
    "Google Maps": "Google Maps", "Follow-up": "Follow-up", "Status": "Status",
    "Nowy klient": "New client", "Checklista": "Checklist", "Oferta": "Offer",
    "Poproś o demo": "Request a demo", "Poproszono o demo": "Demo requested",
    "Zgłoszono prośbę o demo": "Demo request sent",
    "Następny etap": "Next stage", "Cofnij etap": "Previous stage",
    "Zapisz": "Save", "Zapisz zmiany": "Save changes", "Zapisuję…": "Saving…", "Zapisuję...": "Saving...",
    "Anuluj": "Cancel", "Edytuj": "Edit", "Zrobione": "Done", "Akcje": "Actions",
    "Dodaj komentarz...  (@ aby oznaczyć osobę)": "Add a comment...  (@ to mention someone)",
    "Wpisz odpowiedź…": "Type a reply…",
    "Brak komentarzy.": "No comments yet.",
    "Dodaj kartę do etapu": "Add a card to this stage",
    "Przenieś do archiwum": "Move to archive",
    "Usuń trwale": "Delete permanently",
    "Tak, do Archiwum": "Yes, archive it", "Tak, na zawsze": "Yes, forever", "Tak, usuń": "Yes, delete",
    "Usuń przypomnienie": "Remove reminder",
    "Zmień / usuń link": "Change / remove link",
    "Wklej gotowy link do dema": "Paste the demo link",
    "otwórz": "open", "otwórz demo": "open demo", "link": "link", "dziś": "today",
    "edytuje demo": "is editing the demo",
    /* powiadomienia */
    "Brak powiadomień. Gdy ktoś oznaczy Cię ": "No notifications. When someone mentions you ",
    /* checklista wdrożeniowa */
    "Klient zapłacił": "Client has paid",
    "Komplet materiałów dotarł": "All materials received",
    /* partner / usługi / admin */
    "Ustawienia partnera": "Partner settings", "Token partnera": "Partner token",
    "Nadaj token": "Assign token", "Token partnera zdjęty": "Partner token removed",
    "Zdejmuje token partnera (Baza partnerów)": "Removes the partner token (Partners)",
    "W tokenie nie ma jeszcze sprzedanych usług.": "No services sold on this token yet.",
    "Usługa": "Service", "Usługi": "Services", "Dodaj usługę": "Add a service",
    "Katalog jest pusty — dodaj pierwszą usługę.": "The catalogue is empty - add the first service.",
    "Cena": "Price", "Cena minimalna": "Minimum price", "Cena rekomendowana": "Recommended price",
    "Tryb ceny": "Pricing mode", "stała": "fixed", "jednorazowo": "one-off",
    "miesięcznie (cena × wybrany okres)": "monthly (price × chosen period)",
    "Razem": "Total", "Rozliczenie": "Billing", "Nazwa": "Name", "Klucz": "Key",
    "Obsługa techniczna": "Technical support", "Ukryta": "Hidden", "aktywna": "active", "Aktywny": "Active",
    "Użytkownicy": "Users", "Rola": "Role", "Role i uprawnienia": "Roles and permissions",
    "Uprawnienie": "Permission", "Dodaj użytkownika": "Add a user",
    "Imię (widoczne w CRM)": "Name (visible in CRM)", "E-mail (login)": "E-mail (login)",
    "Hasło startowe (możesz nadpisać)": "Initial password (you can overwrite it)",
    "Reset hasła": "Password reset", "Rejestracja": "Sign-up", "Zablokuj": "Block",
    "Zarządza użytkownikami i rolami": "Manages users and roles",
    "Zarządza ofertą usług": "Manages the service catalogue",
    "Własnej roli nie zmienisz samemu": "You cannot change your own role",
    "Brak uprawnień do zarządzania ofertą": "No permission to manage the catalogue",
    "ma zawsze wszystko": "always has everything",
    "Klienci": "Clients",
    /* toasty */
    "Follow-up wykonany": "Follow-up done",
    "Nie udało się dodać karty": "Could not add the card",
    "Nie udało się dodać komentarza": "Could not add the comment",
    "Nie udało się przywrócić": "Could not restore",
    "Nie udało się zdjąć tokena": "Could not remove the token",
    "Nie udało się zgłosić": "Could not send the request",
    "Nie zapisano": "Not saved",
    "Nie zapisano — przywrócono poprzednią kolejność": "Not saved - previous order restored",
    "Nie zapisano — przywrócono poprzednią wartość": "Not saved - previous value restored",
    "Nie zapisano checklisty — spróbuj ponownie": "Checklist not saved - try again",
    "Nie zapisano uprawnienia — spróbuj ponownie": "Permission not saved - try again",
    "Nie zapisano usług — spróbuj ponownie": "Services not saved - try again",
    "Nie zapisano wpisu": "Entry not saved",
    "Podaj cenę — liczba ≥ 0": "Enter a price - number ≥ 0",
    "Podaj nazwę usługi": "Enter a service name",
    "Ceny minimalna i rekomendowana muszą być liczbami ≥ 0": "Minimum and recommended prices must be numbers ≥ 0",
    "Cena rekomendowana nie może być niższa od minimalnej": "Recommended price cannot be lower than the minimum",
    "Przeniesiono do Archiwum": "Moved to Archive",
    "Przywrócono kartę": "Card restored",
    "Usunięto na zawsze": "Deleted forever",
    "Usunięto przypomnienie": "Reminder removed",
    "Ta karta nie jest już w Archiwum — odświeżam": "This card is no longer in the Archive - refreshing",
    "Tej karty już nie ma": "This card no longer exists",
    "Tę kartę usunął ktoś inny": "Someone else deleted this card",
    "Wysłana oferta.": "Offer sent.",
    /* modal karty - uzupełnienie po teście na żywo (07.07) */
    "Wyślij": "Send", "— brak —": "— none —", "Imię i nazwisko": "Full name",
    "Zamknij": "Close", "Poprzedni klient": "Previous client", "Następny klient": "Next client",
    "Kopiuj link": "Copy link", "Kopiuj link do dema": "Copy demo link",
    "Otwórz wizytówkę Google": "Open Google listing",
    "Kliknij, aby edytować": "Click to edit",
    "Kliknij, aby zaplanować follow-up": "Click to schedule a follow-up",
    "notatki, historia rozmów… (kliknij, aby pisać; wklejone linki staną się klikalne)":
      "notes, call history… (click to type; pasted links become clickable)"
  };

  /* ---------- reguły podłańcuchowe (dla etykiet z doklejoną liczbą/ikoną/nazwą) ----------
     UWAGA: NIE używać \b przy polskich znakach (ś/ć/ż...) - w JS bez /u \b ich nie widzi
     (stąd wcześniejszy babol "Na dziś" się nie tłumaczyło). Kolejność: najdłuższe/najbardziej
     specyficzne pierwsze. Reguły biją po podłańcuchu, więc łapią "Archiwum 72", "+ Nowa karta" itd. */
  var RULES = [
    [/Na dziś \/ zaległe/g, "Today / overdue"],
    [/Na dziś/g, "Today"],
    [/zaległe/g, "overdue"],
    [/Archiwum/g, "Archive"],
    [/Nowa karta/g, "New card"],
    [/Tabela/g, "Table"],
    [/Pokaż:/g, "Show:"],
    [/Widok:/g, "View:"],
    [/Ocena (\d+) z (\d+)/g, "Rating $1 of $2"],
    [/(\d+)\s+osób/g, "$1 people"],
    [/(\d+)\s+osoby/g, "$1 people"],
    [/1\s+osoba/g, "1 person"],
    [/^Opiekun: /, "Manager: "],
    [/^Handlowiec: /, "Sales rep: "],
    [/oznaczył\(a\) Cię/g, "mentioned you"],
    [/(\d+)\s+komentarz(?:y|e)?/g, "$1 comments"],
    [/^1 komentarz$/, "1 comment"],
    /* daty follow-up: skróty polskich miesięcy → angielskie (np. "6 lip 2026" → "6 Jul 2026") */
    [/\bsty\b/g, "Jan"], [/\blut\b/g, "Feb"], [/\bmar\b/g, "Mar"], [/\bkwi\b/g, "Apr"],
    [/\bmaj\b/g, "May"], [/\bcze\b/g, "Jun"], [/\blip\b/g, "Jul"], [/\bsie\b/g, "Aug"],
    [/\bwrz\b/g, "Sep"], [/paź/g, "Oct"], [/\blis\b/g, "Nov"], [/\bgru\b/g, "Dec"]
  ];

  function trText(s) {
    if (!s) return s;
    var t = s.trim();
    if (!t) return s;
    if (EXACT.hasOwnProperty(t)) return s.replace(t, EXACT[t]);
    var out = s, changed = false;
    for (var i = 0; i < RULES.length; i++) {
      var before = out;
      out = out.replace(RULES[i][0], RULES[i][1]);
      if (out !== before) changed = true;
    }
    return changed ? out : s;
  }

  var ATTRS = ["placeholder", "title", "aria-label"];
  var suppress = false;

  function walk(root) {
    if (!root) return;
    suppress = true;
    try {
      var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = tw.nextNode())) {
        var p = n.parentNode && n.parentNode.nodeName;
        if (p === "SCRIPT" || p === "STYLE") continue;
        var v = trText(n.nodeValue);
        if (v !== n.nodeValue) n.nodeValue = v;
      }
      var els = root.querySelectorAll ? root.querySelectorAll("[placeholder],[title],[aria-label]") : [];
      for (var i = 0; i < els.length; i++) {
        for (var a = 0; a < ATTRS.length; a++) {
          var cur = els[i].getAttribute(ATTRS[a]);
          if (cur) {
            var nv = trText(cur);
            if (nv !== cur) els[i].setAttribute(ATTRS[a], nv);
          }
        }
      }
    } finally { suppress = false; }
  }

  function start() {
    addBtn();
    // topbar pojawia się dopiero po zalogowaniu (login → apka bez reloadu) — domknij pozycję przycisku
    var tries = 0, iv = setInterval(function () {
      addBtn();
      var bar = document.querySelector(".topbar-right");
      var b = document.getElementById("lang-pill");
      if (++tries > 40 || (bar && b && b.parentNode === bar)) clearInterval(iv);
    }, 500);
    if (LANG !== "en") return;             // po polsku: tylko przycisk, zero podmian
    document.documentElement.lang = "en";
    walk(document.body);
    var pending = false;
    var mo = new MutationObserver(function () {
      if (suppress || pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; walk(document.body); });
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
