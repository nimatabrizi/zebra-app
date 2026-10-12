/** "m2", "m^2", "km2" … → "m²", "km²". Length-preserving for the common "m2" case. */
export function toSquareMeters(text: string): string {
  return text.replace(/(^|[^\p{L}_])([kKcCdD]?[mM])\s?(?:\^?2)(?![\p{L}\p{N}_])/gu, '$1$2²');
}
