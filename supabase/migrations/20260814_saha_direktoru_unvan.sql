-- Ünvan alanı (rol’den bağımsız). Yoksa ekle.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS unvan text;

-- Saha Direktörleri — rol danışman kalır; yalnızca unvan güncellenir
UPDATE public.profiles
SET unvan = 'Saha Direktörü'
WHERE
  tam_isim ILIKE '%Esra%Uslu%'
  OR tam_isim ILIKE '%Yunus%Örük%'
  OR tam_isim ILIKE '%Yunus%Oruk%'
  OR tam_isim ILIKE '%Alper%Topbaşoğlu%'
  OR tam_isim ILIKE '%Alper%Topbasoglu%'
  OR tam_isim ILIKE '%Semih%Uysal%';
