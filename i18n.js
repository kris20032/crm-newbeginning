/* i18n.js - ANGIELSKA NAKŁADKA językowa CRM (07.2026, dla Matheo/Hiszpania).
   ZASADA: zero zmian w app.js - appka renderuje po polsku, ta nakładka podmienia
   WIDOCZNE teksty na angielski, gdy użytkownik wybrał EN (przycisk-pigułka, localStorage).
   Nowe elementy (realtime/rendery) łapie MutationObserver. Przełączenie = reload.
   Cofnięcie całości = usunąć <script i18n.js> z index.html. Słownik rozszerzalny. */
(function () {
  var LANG = "pl";
  try { LANG = localStorage.getItem("crm_lang") || "pl"; } catch (e) {}

  /* ---------- przełącznik języka ----------
     Po ZALOGOWANIU: wybór języka mieszka w MENU KONTA (ikona ludzika w rogu, gdzie jest „Wyloguj”)
     jako sekcja „Język: Polski / English” (menu = „więcej ustawień”). Na EKRANIE LOGOWANIA (menu konta
     jeszcze nie widać) zostaje mała pigułka w rogu, by dało się przełączyć język przed zalogowaniem. */
  function langName(code) { return code === "pl" ? "Polski" : "English"; }
  function switchLang(code) {
    if (code === LANG) return;
    try { localStorage.setItem("crm_lang", code); } catch (e) {}
    location.reload();
  }

  // Sekcja wyboru języka wstawiona RAZ do menu konta (nad „Wyloguj”).
  function addAccountLang() {
    var menu = document.getElementById("account-menu");
    if (!menu || document.getElementById("lang-section")) return;
    var wrap = document.createElement("div");
    wrap.id = "lang-section";
    var sep = document.createElement("div");
    sep.style.cssText = "height:1px;background:#eceae6;margin:5px 4px";
    var head = document.createElement("div");
    head.className = "pop-menu-head"; head.textContent = "Język";
    wrap.appendChild(sep); wrap.appendChild(head);
    ["pl", "en"].forEach(function (code) {
      var it = document.createElement("button");
      it.type = "button";
      it.className = "pop-menu-item lang-opt" + (code === LANG ? " active" : "");
      it.setAttribute("data-lang", code);
      it.textContent = langName(code);
      if (code === LANG) {
        var ck = document.createElement("span");
        ck.textContent = "✓"; ck.style.cssText = "float:right;font-weight:700";
        it.appendChild(ck);
      }
      it.onclick = function () { switchLang(code); };
      wrap.appendChild(it);
    });
    var logout = document.getElementById("logout-item");
    if (logout && logout.parentNode === menu) menu.insertBefore(wrap, logout);
    else menu.appendChild(wrap);
  }

  // Pigułka w rogu — TYLKO na ekranie logowania (brak menu konta).
  function addCornerPill() {
    var b = document.getElementById("lang-pill");
    if (!b) {
      b = document.createElement("button");
      b.id = "lang-pill"; b.type = "button";
      b.textContent = LANG === "en" ? "PL" : "EN";
      b.title = LANG === "en" ? "Przełącz na polski" : "Switch to English";
      b.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:9000;" +
        "padding:6px 14px;border-radius:99px;border:1px solid #d0cdc7;background:#fff;" +
        "color:#37352f;font:600 12px/1 Inter,sans-serif;letter-spacing:.08em;cursor:pointer;" +
        "box-shadow:0 2px 8px rgba(0,0,0,.12)";
      b.onclick = function () { switchLang(LANG === "en" ? "pl" : "en"); };
      document.body.appendChild(b);
    }
  }
  function removeCornerPill() {
    var b = document.getElementById("lang-pill");
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  // Ustaw stan wg tego, czy jesteśmy zalogowani (widać #app-view).
  function placeSwitcher() {
    addAccountLang();   // menu konta istnieje od startu (w ukrytym #app-view) → wstaw raz
    var app = document.getElementById("app-view");
    var loggedIn = app && !app.hidden;
    if (loggedIn) removeCornerPill();   // po zalogowaniu język tylko w menu konta
    else addCornerPill();               // ekran logowania → pigułka w rogu
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
    "Konto": "Account", "Konto i ustawienia": "Account & settings",
    "Język": "Language", "Wyloguj": "Log out", "Sekcje": "Sections",
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
      "notes, call history… (click to type; pasted links become clickable)",
    /* uzupełnienie luk EN po diffie z app.js (ES-7, 10.07) - miejsca, których Matheo realnie dotyka */
    /* błędy logowania / reset hasła */
    "Błędny e-mail lub hasło.": "Wrong e-mail or password.",
    "Hasło musi mieć co najmniej 6 znaków.": "Password must be at least 6 characters.",
    "Nie udało się wysłać linku. Spróbuj jeszcze raz za chwilę.": "Could not send the link. Please try again in a moment.",
    /* chip / tytuł „demo w budowie" (kluczowe dla czekającego na demo) */
    "🔨 w budowie": "🔨 being built",
    "Demo w budowie": "Demo being built",
    "Demo w budowie — sesja właśnie je robi": "Demo being built - a session is working on it now",
    /* Archiwum / akcje karty / widok */
    "Schowano": "Hidden",
    "Usuń kartę": "Delete card",
    "Układ widoku": "View layout",
    /* stany ładowania (panel admina) */
    "Wczytuję zespół…": "Loading the team…",
    "Wczytuję role…": "Loading roles…",
    "Wczytuję ofertę…": "Loading the catalogue…",
    /* toasty */
    "Nie udało się przenieść": "Could not move",
    "Nie udało się usunąć": "Could not delete",
    "Nie udało się skopiować — zaznacz ręcznie": "Could not copy - select manually",
    /* checklista realizacji (etykiety WIDOCZNE w DOM; „Płatność:/Materiały:/komplet dotarł" są tylko
       w eksporcie do schowka - poza zasięgiem nakładki - więc zostają PL celowo) */
    "pełna kwota": "full amount", "zadatek": "deposit", "inne": "other",
    "Kopiuj całą checklistę do schowka": "Copy the whole checklist to clipboard"
  };

  /* ---------- reguły podłańcuchowe (dla etykiet z doklejoną liczbą/ikoną/nazwą) ----------
     UWAGA: NIE używać \b przy polskich znakach (ś/ć/ż...) - w JS bez /u \b ich nie widzi
     (stąd wcześniejszy babol "Na dziś" się nie tłumaczyło). Kolejność: najdłuższe/najbardziej
     specyficzne pierwsze. Reguły biją po podłańcuchu, więc łapią "Archiwum 72", "+ Nowa karta" itd. */
  var RULES = [
    /* reset hasła: komunikat z wklejonym adresem e-mail w środku → tłumacz prefiks i sufiks osobno (ES-7) */
    [/Sprawdź skrzynkę \(/g, "Check your inbox ("],
    [/\) - wysłaliśmy link do ustawienia nowego hasła\. Sprawdź też SPAM\./g,
      ") - we sent a password reset link. Check SPAM too."],
    /* etykieta cyklu w cenach (waluta zł zostaje - decyzja biznesowa; tłumaczymy tylko „/mies." i „N mies.") */
    [/zł\/mies\./g, "zł/mo"],
    [/(\d+)\s+mies\./g, "$1 mo"],
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
    placeSwitcher();
    // login → apka dzieje się BEZ reloadu (app.js tylko odsłania #app-view). Domknij stan (zdejmij
    // pigułkę z rogu, gdy zalogowany) event-driven: obserwuj atrybut hidden #app-view; poller = zapas.
    var app = document.getElementById("app-view");
    if (app && window.MutationObserver) {
      new MutationObserver(placeSwitcher).observe(app, { attributes: true, attributeFilter: ["hidden"] });
    }
    var tries = 0, iv = setInterval(function () {
      placeSwitcher();
      var loggedIn = app && !app.hidden;
      if (++tries > 40 || loggedIn) clearInterval(iv);
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
