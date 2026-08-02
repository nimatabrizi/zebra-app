/** 09:00–18:00 arası 30 dakikalık çekim saat dilimleri */

export const TIME_SLOT_OPTIONS: string[] = (() => {
  const slots: string[] = [];
  for (let minutes = 9 * 60; minutes <= 18 * 60; minutes += 30) {
    const h = String(Math.floor(minutes / 60)).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots;
})();
