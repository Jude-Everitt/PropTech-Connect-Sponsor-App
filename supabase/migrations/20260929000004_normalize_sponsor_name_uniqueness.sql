create unique index if not exists sponsors_company_name_normalized_uidx
  on public.sponsors (lower(btrim(company_name)));
