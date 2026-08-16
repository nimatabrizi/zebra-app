-- Excel içe aktarma alanları
-- Güvenli / tekrarlanabilir: mevcut satırları değiştirmez veya silmez.
-- Tüm yeni kolonlar varsayılan olarak NULL kabul eder.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS takim_ekip text,
  ADD COLUMN IF NOT EXISTS kulup_uyelikleri text,
  ADD COLUMN IF NOT EXISTS dogum_gunu date,
  ADD COLUMN IF NOT EXISTS beden text,
  ADD COLUMN IF NOT EXISTS ise_giris_tarihi date,
  ADD COLUMN IF NOT EXISTS blue_start text,
  ADD COLUMN IF NOT EXISTS kartvizit text,
  ADD COLUMN IF NOT EXISTS branda text,
  ADD COLUMN IF NOT EXISTS giris_gorseli text,
  ADD COLUMN IF NOT EXISTS yaka_karti text,
  ADD COLUMN IF NOT EXISTS folkart_karti text,
  ADD COLUMN IF NOT EXISTS cbx text,
  ADD COLUMN IF NOT EXISTS cbx_kayit text,
  -- Gerçek "Tüm Personel" sayfasında bulunan ek kolonlar:
  ADD COLUMN IF NOT EXISTS ofis text,
  ADD COLUMN IF NOT EXISTS sube text;
