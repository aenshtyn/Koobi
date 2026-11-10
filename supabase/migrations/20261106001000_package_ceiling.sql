-- Koobi: package prices are compared with the session price, not the hourly price.
--
-- The sprint 1 rule capped a package at the hourly price times the sessions. For a 90-minute session
-- that made any sensible package price illegal (8 sessions at KES 2,700 is more than 8 hours at
-- KES 1,800), and for a 30-minute session it allowed a package dearer than single sessions. The
-- create form (expert workspace redesign, November 2026) now lets experts set package prices, so the
-- ceiling becomes: never more than the same number of single sessions.
alter table public.offerings drop constraint if exists offerings_package_ceiling;
alter table public.offerings add constraint offerings_package_ceiling check (
      (price_pkg8_kes  is null or price_pkg8_kes  <= round(price_hour_kes * duration_minutes / 60.0) * 8)
  and (price_pkg12_kes is null or price_pkg12_kes <= round(price_hour_kes * duration_minutes / 60.0) * 12)
  and (price_pkg16_kes is null or price_pkg16_kes <= round(price_hour_kes * duration_minutes / 60.0) * 16));
