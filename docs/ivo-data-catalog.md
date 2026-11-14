# IVO veri kataloğu (Zebra)

AI sohbet ve değerleme motoru **hariç**. Harita **verisi** dahil; harita UI Zebra’da yapılacak.

Kaynak: broker oturumu + `bindings/uygulama.js` / `kit/map.js` / canlı API örnekleri (2026-11-14).

## Ortak ilan kartı (liste)

Çoğu `/expertise/*` ve `/takip/ilanlar` yanıtı:

`success`, `data[]`, `meta: { total, limit, offset, pencere, veri_tarihi }`

Kart alanları: `id, no, title, price, city, district, neighborhood, type, kind, status, m2, m2_gross, rooms, image, date, first_date, is_active, m2_price, whom, price_change, status_summary, updated_at, facts, photo_count, agent, agency, master, price_stats, iletisim, price_fx`

**Koordinat listede yok.** Detay veya map points’te var.

## Sayfalama

`limit` + `offset` (`offset = (page-1)*PER_PAGE`). `meta.total` ile tüm sayfalar tarlanır.

## Endpoint kataloğu

### Auth / oturum
| Endpoint | Not |
|---|---|
| `GET /auth/me` | Oturum sağlığı |
| `GET /auth/me/settings` | Ayarlar |
| `POST /auth/login` | SMS akışı (Zebra saklamaz; token env) |

### Expertise — ilan havuzları (Radar)
| Endpoint | Örnek total (CB360) | Not |
|---|---|---|
| `/expertise/fsbo` | 50 | FSBO |
| `/expertise/catch-dropped` | 1 | Düşeni yakala |
| `/expertise/competitor-fsbo` | (groups) | Rakip FSBO — grup yapısı, düz liste değil |
| `/expertise/fsbo-aged` | 0 | Yorgun |
| `/expertise/below-average` | 30 | Ortalama altı |
| `/expertise/price-dropped` | 14 | Fiyat düşen |
| `/expertise/relisted` | 14 | Tekrar yayına |
| `/expertise/passive` | 348 | Pasif |
| `/expertise/my-properties` | 567 | İlanlarım |
| `/expertise/office-properties` | 6495 | Ofis — büyük corpus |
| `/expertise/franchise` | 258 | Franchise / CB |
| `/expertise/zone-offices` | 47 | Bölge ofis (pencere 3g) |
| `/expertise/contact-properties` | 0 | Rehber eşleşmesi |
| `/expertise/my-zone` | — | Uzmanlık bölgesi tanımı (il/ilçe/mahalle) |
| `/expertise/market-heat?kind=` | — | Isı skoru (kind zorunlu) |
| `/expertise/referrer` | — | `il`, `ilce`, `kind` zorunlu |

### Takip
| Endpoint | Not |
|---|---|
| `GET /takip/ilanlar` | Takip listesi + `takip` alanları |
| `GET /takip/kodlar/{ilanno}` | İlan no path |

### Rehber
| Endpoint | Not |
|---|---|
| `GET /rehber/groups` | Gruplar |
| `GET /rehber/contacts` | Kişiler (`limit`/`offset`) |

### Arama
| Endpoint | Not |
|---|---|
| `GET /search` | `recent` + `favorites` |
| `GET /search/favorites` | Favori aramalar |
| `GET /search/properties` | `agent` veya `agency` gerekli |
| `GET /search/anla` | Anlamsal (ayrı) |

### İlan detay (koordinat kaynağı)
| Endpoint | Not |
|---|---|
| `GET /properties/{no}` | Full card: `coordinates` `[lng,lat]`, `images`, `description`, `past_prices`, … |
| `POST /properties/guncelle-oto` | `{ kaynak: detay\|liste, nolar[] }` |
| `POST /properties/{no}/guncelle` | Güncelleme kuyruğu |

### Harita (UI Zebra; veri IVO)
| Endpoint | Not |
|---|---|
| `POST /map/search` | `area.type`: `bbox` \| `radius` \| `polygon`; max ~25 km². `view`: `points` \| `list`. Points: `lat,lng,no,price,…` |
| `POST /map/search?facets=1` | Facet sayıları |
| `POST /map/summary` | Bölge özeti / nüfus (aynı area gövdesi) |

Örnek bbox:
```json
{
  "area": { "type": "bbox", "bounds": [[swLng, swLat], [neLng, neLat]] },
  "view": "points",
  "limit": 50
}
```

### Bilinçli hariç (şimdilik)
`/ai/*` — AI sohbet / liste AI  
Değerleme motoru uçları — kapsam dışı

## Zebra sync stratejisi

1. **Liste feed’leri** — `limit/offset` ile `meta.total` bitene kadar (büyük ofis feed’inde batch + `ivo_sync_cursors`).  
2. **Koordinat** — map points (`POST /map/search`) + eksiklerde `/properties/{no}` enrich.  
3. **Harita** — Zebra UI `lib/ivoMap.ts` veya DB `lat/lng`.  
4. **my-zone / search / competitor-fsbo** → `ivo_snapshots`.  
5. Migration: `supabase/migrations/20261114_ivo_listings_map.sql` (lat/lng, feeds, snapshots, cursors).

Kod: `lib/ivoSync.ts` → `npm run ivo:sync` / cron `GET|POST /api/ivo/sync`.

## Kullanıcıya görünürlük

Ürün UI’da “IVO” yok; Radar / ilan listeleri Zebra verisi gibi sunulur. Sync secret + cron.
