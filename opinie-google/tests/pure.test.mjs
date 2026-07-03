// Test czystej logiki maszyny (Node, zero sieci): node tests/pure.test.mjs
// Importuje DOKŁADNIE ten sam plik, którego używają Edge Functions (pure.mjs).
import {
  normalizePhonePL, extractPhonePL, fillTemplate, computeScheduledAt, hourInTz,
  reviewFingerprint, buttonId, parseButtonId, fallbackReplyDraft, within24h,
} from "../functions/_shared/pure.mjs";

let passed = 0, failed = 0;
function t(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.error(`✗ ${name}`); }
}

// --- normalizePhonePL ---
t("phone: 9 cyfr", normalizePhonePL("604850488") === "+48604850488");
t("phone: +48", normalizePhonePL("+48 604 850 488") === "+48604850488");
t("phone: 48 bez plusa (format Meta)", normalizePhonePL("48604850488") === "+48604850488");
t("phone: śmieć odrzucony", normalizePhonePL("czesc") === null);
t("phone: za krótki odrzucony", normalizePhonePL("60485048") === null);

// --- extractPhonePL (wiadomości do bota) ---
t("extract: sam numer", extractPhonePL("600123456") === "+48600123456");
t("extract: numer w zdaniu", extractPhonePL("wyslij do Jana 600 123 456 dzieki") === "+48600123456");
t("extract: z myślnikami", extractPhonePL("tel: 600-123-456") === "+48600123456");
t("extract: z +48", extractPhonePL("+48 512 221 704") === "+48512221704");
t("extract: brak numeru", extractPhonePL("co słychać?") === null);

// --- fillTemplate ---
t("template: imie+link", fillTemplate("Czesc {imie}! Ocen: {link}", "Jan", "http://x") === "Czesc Jan! Ocen: http://x");
t("template: bez imienia bez dziury", fillTemplate("Czesc {imie}! Ocen: {link}", null, "http://x") === "Czesc ! Ocen: http://x".replace(/\s+/g, " ") && !fillTemplate("Czesc {imie}!", null, "x").includes("  "));

// --- computeScheduledAt: ZAWSZE w oknie 9-21 czasu PL, nigdy "od razu" ---
const tz = "Europe/Warsaw";
for (const [label, iso] of [
  ["rano", "2026-07-03T06:00:00Z"],      // 8:00 PL → +3h = 11:00 OK
  ["poludnie", "2026-07-03T10:00:00Z"],  // 12:00 PL → 15:00 OK
  ["wieczor", "2026-07-03T18:30:00Z"],   // 20:30 PL → 23:30 → przesuw na rano
  ["noc", "2026-07-03T23:30:00Z"],       // 1:30 PL → 4:30 → przesuw na rano
]) {
  const out = computeScheduledAt(tz, new Date(iso), 0);
  const h = hourInTz(out, tz);
  t(`timing ${label}: okno 9-21 (dostal ${h})`, h >= 9 && h < 21);
  t(`timing ${label}: minimum +3h`, out.getTime() - new Date(iso).getTime() >= 3 * 3600_000);
}

// --- fingerprint ---
const r1 = { name: "places/abc/reviews/xyz" };
t("fp: stabilne ID Google", reviewFingerprint(r1) === "gid:places/abc/reviews/xyz");
const r2 = { authorAttribution: { displayName: "Jan" }, publishTime: "2026-01-01", text: { text: "super" } };
t("fp: hash deterministyczny", reviewFingerprint(r2) === reviewFingerprint({ ...r2 }));
t("fp: inna tresc = inny hash", reviewFingerprint(r2) !== reviewFingerprint({ ...r2, text: { text: "slabo" } }));

// --- przyciski ---
const id = buttonId("accept", "12345678-1234-1234-1234-123456789abc");
t("button: roundtrip", JSON.stringify(parseButtonId(id)) === JSON.stringify({ action: "accept", reviewId: "12345678-1234-1234-1234-123456789abc" }));
t("button: smiec odrzucony", parseButtonId("og_hack:xx") === null && parseButtonId(null) === null);
t("button: obca akcja odrzucona", parseButtonId("og_delete:12345678-1234-1234-1234-123456789abc") === null);

// --- fallback draft ---
t("draft: pozytyw dziekuje", fallbackReplyDraft("Firma X", 5, "Jan Kowalski").includes("Dziekujemy Jan"));
t("draft: negatyw przeprasza i zaprasza", /kontakt/.test(fallbackReplyDraft("Firma X", 2, null)));

// --- okno 24h ---
t("24h: swieza interakcja = tak", within24h(new Date(Date.now() - 3600_000).toISOString()));
t("24h: stara = nie", !within24h(new Date(Date.now() - 25 * 3600_000).toISOString()));
t("24h: brak = nie", !within24h(null));

console.log(`\n${failed === 0 ? "✅" : "❌"} pure.test: ${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
