import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const DEFAULT_MARKETS = [
  { code: "NG",  name: "Nigeria",     language: "en"    },
  { code: "KE",  name: "Kenya",       language: "en"    },
  { code: "UG",  name: "Uganda",      language: "en"    },
  { code: "GH",  name: "Ghana",       language: "en"    },
  { code: "IC",  name: "Ivory Coast", language: "fr"    },
  { code: "SN",  name: "Senegal",     language: "fr"    },
  { code: "EGY", name: "Egypt",       language: "ar"    },
  { code: "MA",  name: "Morocco",     language: "ar+fr" },
  { code: "DZ",  name: "Algeria",     language: "ar+fr" },
];

async function main() {
  for (const m of DEFAULT_MARKETS) {
    await db.market.upsert({
      where: { code: m.code },
      create: m,
      update: {},
    });
  }
  await db.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  console.log("✓ seeded markets and settings");
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
