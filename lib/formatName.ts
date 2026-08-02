/**
 * Kişi adlarını arayüzde Title Case gösterir (TR locale).
 * Örn: "CAHİT EREZ" → "Cahit Erez"
 * Veriyi değiştirmez; yalnızca görüntüleme için kullanın.
 */
export function toTitleCaseName(value: unknown): string {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';

  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLocaleLowerCase('tr-TR');
      if (!lower) return '';
      const first = lower.charAt(0).toLocaleUpperCase('tr-TR');
      return `${first}${lower.slice(1)}`;
    })
    .join(' ');
}
