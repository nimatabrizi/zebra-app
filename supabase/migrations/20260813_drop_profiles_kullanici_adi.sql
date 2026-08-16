-- Kullanıcı adı kolonu kullanılmıyor; giriş tam_isim + WhatsApp ile yapılıyor.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS kullanici_adi;
