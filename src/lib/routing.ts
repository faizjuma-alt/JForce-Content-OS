// Market → language routing table (matches the original briefing)

const EN = ["NG", "KE", "UG", "GH"];
const FR_ONLY = ["IC", "SN"];
const AR_ONLY = ["EGY"];
const AR_AND_FR = ["MA", "DZ"];

export function languagesFor(markets: string[]): ("en" | "fr" | "ar")[] {
  const set = new Set<"en" | "fr" | "ar">();
  for (const m of markets) {
    if (EN.includes(m)) set.add("en");
    if (FR_ONLY.includes(m)) set.add("fr");
    if (AR_ONLY.includes(m)) set.add("ar");
    if (AR_AND_FR.includes(m)) {
      set.add("ar");
      set.add("fr");
    }
  }
  return [...set];
}

export function uploadPlanFor(markets: string[]) {
  // Returns one entry per market+language tuple — exactly matches the
  // n8n Phase 3 routing.
  const plan: Array<{ market: string; lang: "en" | "fr" | "ar" }> = [];
  for (const m of markets) {
    if (EN.includes(m)) plan.push({ market: m, lang: "en" });
    if (FR_ONLY.includes(m)) plan.push({ market: m, lang: "fr" });
    if (AR_ONLY.includes(m)) plan.push({ market: m, lang: "ar" });
    if (AR_AND_FR.includes(m)) {
      plan.push({ market: m, lang: "ar" });
      plan.push({ market: m, lang: "fr" });
    }
  }
  return plan;
}
