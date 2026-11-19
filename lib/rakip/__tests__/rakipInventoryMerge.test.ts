/**
 * Offline Cloud Research merge + brand-scope + review-queue tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as XLSX from 'xlsx';

import {
  buildInventorySnapshotV1,
  classifyBrandLabel,
  inventoryBundleFromBytes,
  mergeCloudResearchIntoBundle,
  memoryRakipInventoryStore,
  RAKIP_BASELINE_IMPORT_PLAN,
  RAKIP_RESEARCH_TARGET_BRANDS,
} from '../inventory';

function buildWorkbookWithArmada(): Buffer {
  const wb = XLSX.utils.book_new();
  const offices = [
    ['title'],
    ['subtitle 31.07.2026 kaynak'],
    [],
    [
      'Ofis Anahtarı',
      'Marka',
      'Ofis',
      'İl',
      'İlçe',
      'Telefon',
      'Kaynak',
      'Son Görülme',
      'İlk Görülme',
      'Son Güncelleme',
      'Kapsam Durumu',
    ],
    [
      'cb:o1',
      'Coldwell Banker',
      'DENİZ',
      'İzmir',
      'Karşıyaka',
      '+90 555',
      'https://www.cb.com.tr/ofisler/deniz',
      '2026-11-16',
      '2026-08-01',
      '2026-11-16',
      'ok',
    ],
    [
      'ar:o1',
      'Armada',
      'ARMADA OFIS',
      'İzmir',
      'Konak',
      '',
      'https://example.invalid/armada',
      '2026-06-01',
      '2026-01-01',
      '2026-06-01',
      'archive',
    ],
  ];
  const people = [
    ['title'],
    ['desc'],
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
      'Profil',
      'Son Görülme',
      'İlk Görülme',
      'Son Güncelleme',
      'Durum',
      'Ofis Anahtarı',
    ],
    [
      'cb:p1',
      'Coldwell Banker',
      'DENİZ',
      'İzmir',
      'Karşıyaka',
      'Örnek Danışman',
      'Danışman',
      '+90',
      'https://www.cb.com.tr/danismanlar/p1',
      '2026-11-16',
      '2026-08-01',
      '2026-11-16',
      'Aktif',
      'cb:o1',
    ],
    [
      'ar:p1',
      'Armada',
      'ARMADA OFIS',
      'İzmir',
      'Konak',
      'Arşiv Kişi',
      'Danışman',
      '',
      'https://example.invalid/p',
      '2026-06-01',
      '2026-01-01',
      '2026-06-01',
      '',
      'ar:o1',
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Özet'], ['31.07.2026']]), 'Özet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(offices), 'Ofisler');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(people), 'Aktif Ekip');
  return Buffer.from(
    XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer
  );
}

describe('brand scope', () => {
  it('has exactly 13 research targets and classifies Armada as archive_only', () => {
    assert.equal(RAKIP_RESEARCH_TARGET_BRANDS.length, 13);
    assert.equal(classifyBrandLabel('Armada').brandClass, 'archive_only');
    assert.equal(classifyBrandLabel('Coldwell Banker').brandClass, 'research_target');
  });
});

describe('mergeCloudResearchIntoBundle', () => {
  it('upserts CB observations without deleting Armada archive rows; partial-safe', () => {
    const prior = inventoryBundleFromBytes(buildWorkbookWithArmada(), 'regional');
    assert.equal(prior.meta.archiveOnlyBrandCount >= 1, true);
    assert.ok(prior.offices.some((o) => o.brandClass === 'archive_only'));

    const { bundle, report } = mergeCloudResearchIntoBundle(prior, {
      schemaVersion: 'cb360-cloud-daily-research-v2',
      researchRunId: 'cloud_dry_cb',
      finishedAt: '2026-11-19T10:00:00+03:00',
      outcome: 'partial',
      priorInventory: { available: true },
      brands: [
        {
          brandSlug: 'coldwell-banker',
          brandName: 'Coldwell Banker',
          status: 'partial',
          offices: [
            {
              officeKey: 'cb:o1',
              officeName: 'DENİZ',
              province: 'İzmir',
              district: 'Karşıyaka',
              observedAt: '2026-11-19T09:50:00+03:00',
              officeUrl: 'https://www.cb.com.tr/ofisler/deniz',
            },
          ],
          people: [
            {
              personKey: 'cb:p1',
              fullName: 'Örnek Danışman',
              officeKey: 'cb:o1',
              observedAt: '2026-11-19T09:51:00+03:00',
              status: 'observed',
            },
            {
              personKey: 'cb:p2',
              fullName: 'Yeni Gözlem',
              officeKey: 'cb:o1',
              province: 'İzmir',
              observedAt: '2026-11-19T09:52:00+03:00',
              status: 'observed',
            },
          ],
        },
      ],
      eventCandidates: [
        {
          eventCandidateId: 'e1',
          eventType: 'consultant_joined',
          personKey: 'cb:p2',
          fullName: 'Yeni Gözlem',
          brandSlug: 'coldwell-banker',
          priorRecordAvailable: true,
          confidence: 'medium',
        },
      ],
    });

    assert.equal(report.deletedPriorRows, 0);
    assert.ok(bundle.offices.some((o) => o.officeKey === 'ar:o1'));
    assert.ok(bundle.people.some((p) => p.personKey === 'ar:p1'));
    assert.ok(bundle.people.some((p) => p.personKey === 'cb:p2'));
    assert.equal(bundle.meta.inventoryStatusLabel, 'Son Kayıtlı Envanter');
    assert.equal(bundle.meta.lastResearchAt, '2026-11-19T10:00:00+03:00');
    assert.equal(bundle.reviewQueue.length >= 1, true);
    assert.equal(
      bundle.reviewQueue.every((r) => r.notificationStatus === 'not_sent'),
      true
    );
  });

  it('demotes movement candidates without prior inventory', () => {
    const prior = inventoryBundleFromBytes(buildWorkbookWithArmada(), 'regional');
    const { bundle } = mergeCloudResearchIntoBundle(prior, {
      researchRunId: 'cloud_noprior',
      outcome: 'partial',
      priorInventory: { available: false },
      brands: [],
      eventCandidates: [
        {
          eventCandidateId: 'dep1',
          eventType: 'consultant_departed_candidate',
          personKey: 'cb:p1',
          priorRecordAvailable: false,
        },
      ],
    });
    assert.ok(
      bundle.reviewQueue.some(
        (r) =>
          r.eventType === 'coverage_gap' &&
          r.verificationStatus === 'insufficient_prior'
      )
    );
  });
});

describe('snapshot + memory store', () => {
  it('rejects labeledAsCurrent and stores Son Kayıtlı snapshot', async () => {
    memoryRakipInventoryStore.clear();
    const prior = inventoryBundleFromBytes(buildWorkbookWithArmada(), 'regional');
    const snap = buildInventorySnapshotV1(prior);
    assert.equal(snap.attestations.labeledAsCurrent, false);
    await memoryRakipInventoryStore.putSnapshot(snap);
    const latest = await memoryRakipInventoryStore.getLatestSnapshot();
    assert.equal(latest?.snapshotVersionId, snap.snapshotVersionId);
    assert.equal(RAKIP_BASELINE_IMPORT_PLAN.status.includes('awaiting'), true);
    memoryRakipInventoryStore.clear();
  });
});
