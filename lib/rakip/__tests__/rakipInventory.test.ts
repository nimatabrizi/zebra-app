/**
 * Offline Rakip inventory normalize/query tests — no network, no real PII.
 * Run: npm run test:rakip:inventory
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';

import {
  CODEX_CONTACT_HEADERS,
  inventoryBundleFromBytes,
  listInventoryOffices,
  listInventoryPeople,
  parseCodexSourceWorkbook,
} from '../inventory';

function buildSyntheticWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();

  const offices = [
    ['Türkiye Geneli Kurumsal Emlak Ofisleri'],
    ['Açıklama'],
    [],
    [
      'Ofis Anahtarı',
      'Marka',
      'Ofis',
      'İl',
      'İlçe',
      'Adres',
      'Telefon',
      'E-posta',
      'Kaynak',
      'Son Görülme',
      'Kapsam Durumu',
      'İlk Görülme',
      'Son Güncelleme',
    ],
    [
      'cb:example-office-1',
      'Coldwell Banker',
      'EXAMPLE DENİZ',
      'İzmir',
      'Karşıyaka',
      'SECRET ADDRESS',
      '+90 555 000 0000',
      'secret@example.com',
      'https://www.cb.com.tr/ofisler/example-deniz',
      '2026-11-16 10:00',
      'Kapsam içi',
      '2026-08-01',
      '2026-11-16',
    ],
    [
      'cb:example-office-ist',
      'Coldwell Banker',
      'EXAMPLE IST',
      'İstanbul-Avrupa',
      'Beşiktaş',
      'ADDR',
      '',
      '',
      'https://www.cb.com.tr/ofisler/example-ist',
      '2026-11-16 10:00',
      'Kapsam dışı',
      '2026-08-01',
      '2026-11-16',
    ],
    [
      'cb:example-ayvalik',
      'Coldwell Banker',
      'EXAMPLE FARK',
      'Balıkesir',
      'Ayvalık',
      '',
      '',
      '',
      'https://www.cb.com.tr/ofisler/example-fark',
      '2026-11-16 10:00',
      'Kapsam içi',
      '2026-08-01',
      '2026-11-16',
    ],
  ];

  const people = [
    ['Türkiye Geneli Aktif Ekip'],
    ['Açıklama'],
    [],
    [
      'Kişi Anahtarı',
      'Marka',
      'Ofis',
      'İl',
      'İlçe',
      'Ad Soyad',
      'Görev',
      'Telefon',
      'WhatsApp',
      'E-posta',
      'Profil',
      'Kaynak',
      'Son Görülme',
      'İlk Görülme',
      'Son Güncelleme',
      'Durum',
      'Ofis Anahtarı',
      'Ayrılma Takibi',
      'Instagram Profil',
    ],
    [
      'cb:example-person-1',
      'Coldwell Banker',
      'EXAMPLE DENİZ',
      'İzmir',
      'Karşıyaka',
      'Örnek Danışman',
      'Gayrimenkul Danışmanı',
      '+90 555 111 1111',
      '+90 555 111 1111',
      'person@example.com',
      'https://www.cb.com.tr/danismanlar/ornek-1',
      'https://www.cb.com.tr/ofisler/example-deniz',
      '2026-11-16 10:05',
      '2026-08-01',
      '2026-11-16',
      'Aktif',
      'cb:example-office-1',
      '',
      'https://instagram.com/secret_handle',
    ],
    [
      'cb:example-person-ist',
      'Coldwell Banker',
      'EXAMPLE IST',
      'İstanbul-Avrupa',
      'Beşiktaş',
      'Dış Kapsam Kişi',
      'Danışman',
      '',
      '',
      '',
      'https://www.cb.com.tr/danismanlar/ornek-ist',
      '',
      '2026-11-16',
      '2026-08-01',
      '2026-11-16',
      '',
      'cb:example-office-ist',
      '',
      '',
    ],
  ];

  const summary = [
    ['İzmir, Manisa, Aydın ve Balıkesir Kurumsal Emlak Kaynak Envanteri'],
    ['Sentetik test envanteri · 2026-11-16'],
  ];

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(summary),
    'Özet'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(offices),
    'Ofisler'
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(people),
    'Aktif Ekip'
  );

  return Buffer.from(
    XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer
  );
}

describe('parseCodexSourceWorkbook', () => {
  it('strips contact columns and keeps identity/source fields', () => {
    const parsed = parseCodexSourceWorkbook(buildSyntheticWorkbook());
    assert.equal(parsed.offices.length, 3);
    assert.equal(parsed.people.length, 2);
    const officeJson = JSON.stringify(parsed.offices);
    const peopleJson = JSON.stringify(parsed.people);
    for (const h of CODEX_CONTACT_HEADERS) {
      assert.equal(officeJson.includes(h), false);
      assert.equal(peopleJson.includes(h), false);
    }
    assert.equal(officeJson.includes('+90'), false);
    assert.equal(peopleJson.includes('secret@example.com'), false);
    assert.equal(peopleJson.includes('secret_handle'), false);
    assert.equal(parsed.people[0]?.fullName, 'Örnek Danışman');
    assert.equal(
      parsed.people[0]?.officialProfileUrl,
      'https://www.cb.com.tr/danismanlar/ornek-1'
    );
  });
});

describe('normalizeCodexInventory regional scope', () => {
  it('keeps İzmir + Ayvalık and excludes İstanbul; no departure events', () => {
    const bundle = inventoryBundleFromBytes(buildSyntheticWorkbook(), 'regional');
    assert.equal(bundle.meta.scopedOfficeCount, 2);
    assert.equal(bundle.meta.scopedPersonCount, 1);
    assert.equal(bundle.meta.rawPersonRows, 2);
    assert.equal(bundle.meta.uniquePersonKeys, 2);
    assert.ok(
      bundle.meta.notes.some((n) => n.includes('not departure'))
    );
    assert.equal(
      bundle.offices.some((o) => o.province === 'İstanbul-Avrupa'),
      false
    );
    assert.equal(
      bundle.offices.some((o) => o.district === 'Ayvalık'),
      true
    );
  });
});

describe('inventory query', () => {
  it('filters by brand and name search', () => {
    const bundle = inventoryBundleFromBytes(buildSyntheticWorkbook(), 'regional');
    const offices = listInventoryOffices(bundle, {
      brand: 'Coldwell Banker',
      q: 'deniz',
    });
    assert.equal(offices.total, 1);
    assert.equal(offices.items[0]?.officeName, 'EXAMPLE DENİZ');

    const people = listInventoryPeople(bundle, { q: 'örnek' });
    assert.equal(people.total, 1);
    assert.equal(people.items[0]?.personKey, 'cb:example-person-1');
  });
});
