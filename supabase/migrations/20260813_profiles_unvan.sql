-- Stüdyo / kullanıcı yönetimi unvan alanı
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unvan text;
