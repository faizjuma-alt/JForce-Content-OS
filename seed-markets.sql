-- Run this once in Supabase → SQL Editor after the first Vercel deploy.
-- Seeds the 9 markets and creates the singleton settings row.

INSERT INTO "Market" (code, name, language, "ytUrl", "ytChannelId", active, "updatedAt") VALUES
  ('NG',  'Nigeria',     'en',    NULL, NULL, TRUE, NOW()),
  ('KE',  'Kenya',       'en',    NULL, NULL, TRUE, NOW()),
  ('UG',  'Uganda',      'en',    NULL, NULL, TRUE, NOW()),
  ('GH',  'Ghana',       'en',    NULL, NULL, TRUE, NOW()),
  ('IC',  'Ivory Coast', 'fr',    NULL, NULL, TRUE, NOW()),
  ('SN',  'Senegal',     'fr',    NULL, NULL, TRUE, NOW()),
  ('EGY', 'Egypt',       'ar',    NULL, NULL, TRUE, NOW()),
  ('MA',  'Morocco',     'ar+fr', NULL, NULL, TRUE, NOW()),
  ('DZ',  'Algeria',     'ar+fr', NULL, NULL, TRUE, NOW())
ON CONFLICT (code) DO NOTHING;

INSERT INTO "Settings" (id, "toolUrl", "defaultCta", hashtags, "updatedAt") VALUES
  ('singleton',
   'https://jforce-links.codewords.run',
   'Open jforce-links.codewords.run',
   '#JumiaForce, #JForce, #JumiaAffiliate, #AffiliateMarketing',
   NOW())
ON CONFLICT (id) DO NOTHING;

-- Optional: make yourself an admin (replace email)
-- UPDATE "User" SET role='ADMIN' WHERE email='faiz.juma@jumia.com';
