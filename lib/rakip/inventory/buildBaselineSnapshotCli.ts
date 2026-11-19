/**
 * Local-only baseline snapshot builder.
 * Reads source.xlsx RO → rakip-inventory-snapshot-v1 JSON outside git.
 *
 *   npx tsx lib/rakip/inventory/buildBaselineSnapshotCli.ts \
 *     --workbook /path/to/source.xlsx \
 *     --out-dir /path/to/safe-local-dir
 *
 * Never uploads. Never prints person lists / contacts.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  buildInventorySnapshotV1,
  inventoryBundleFromBytes,
  parseInventorySnapshotJson,
  RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION,
} from './index';

type Args = {
  workbook: string;
  outDir: string;
};

function parseArgs(argv: string[]): Args {
  let workbook = '';
  let outDir = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--workbook') workbook = argv[++i] || '';
    else if (a === '--out-dir') outDir = argv[++i] || '';
  }
  if (!workbook || !outDir) {
    throw new Error('Usage: --workbook <source.xlsx> --out-dir <safe-dir>');
  }
  return { workbook, outDir };
}

function assertSafeOutDir(outDir: string): void {
  const resolved = path.resolve(outDir);
  const publicDir = path.resolve(process.cwd(), 'public');
  if (resolved === publicDir || resolved.startsWith(publicDir + path.sep)) {
    throw new Error('Refusing to write snapshot under public/');
  }
  if (resolved.includes(`${path.sep}.next${path.sep}`) || resolved.endsWith(`${path.sep}.next`)) {
    throw new Error('Refusing to write snapshot under .next/');
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertSafeOutDir(args.outDir);

  const bytes = await fs.readFile(args.workbook);
  const bundle = inventoryBundleFromBytes(bytes, 'regional');

  // Baseline export: research not yet merged — do not invent lastResearchAt.
  if (bundle.meta.lastResearchAt) {
    bundle.meta.lastResearchAt = null;
  }
  bundle.meta.origin = 'local_xlsx';
  bundle.meta.notes = [
    ...bundle.meta.notes,
    'Baseline snapshot exported for Staging review; labeled Son Kayıtlı Envanter only.',
    'Contains professional identifiers (names, office links, profile URLs) — not anonymous.',
  ];

  const snapshot = buildInventorySnapshotV1(bundle, {
    supersedesSnapshotVersionId: null,
  });

  // Re-validate round-trip shape
  parseInventorySnapshotJson(JSON.parse(JSON.stringify(snapshot)));

  const officeKeys = new Set(snapshot.bundle.offices.map((o) => o.officeKey));
  const personKeys = new Set(snapshot.bundle.people.map((p) => p.personKey));
  const officeDupes =
    snapshot.bundle.offices.length - officeKeys.size;
  const personDupes =
    snapshot.bundle.people.length - personKeys.size;

  const brandClasses = {
    research_target: snapshot.bundle.meta.brands.filter(
      (b) => b.brandClass === 'research_target'
    ).length,
    archive_only: snapshot.bundle.meta.brands.filter(
      (b) => b.brandClass === 'archive_only'
    ).length,
    unknown: snapshot.bundle.meta.brands.filter((b) => b.brandClass === 'unknown')
      .length,
  };

  // Contact leakage heuristics (header keys / phone / email patterns)
  const blob = JSON.stringify(snapshot);
  const security = {
    contactHeaderKeysPresent: /"(Telefon|WhatsApp|E-posta)"\s*:/.test(blob),
    phoneLikePresent: /\+90\s*\d/.test(blob),
    emailLikePresent: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(blob),
    labeledAsCurrent: snapshot.attestations.labeledAsCurrent,
    lastResearchInvented: snapshot.bundle.meta.lastResearchAt != null,
    schemaOk:
      snapshot.schemaVersion === RAKIP_INVENTORY_SNAPSHOT_SCHEMA_VERSION,
  };

  await fs.mkdir(args.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `rakip-inventory-snapshot-v1-${stamp}.json`;
  const outPath = path.join(args.outDir, fileName);
  const json = `${JSON.stringify(snapshot, null, 2)}\n`;
  await fs.writeFile(outPath, json, 'utf8');

  const outBytes = Buffer.from(json, 'utf8');
  const sha256 = createHash('sha256').update(outBytes).digest('hex');

  const report = {
    generatedAt: new Date().toISOString(),
    workbookPathSet: true,
    outPath,
    snapshotVersionId: snapshot.snapshotVersionId,
    schemaVersion: snapshot.schemaVersion,
    counts: {
      offices: snapshot.bundle.offices.length,
      people: snapshot.bundle.people.length,
      uniqueOfficeKeys: officeKeys.size,
      uniquePersonKeys: personKeys.size,
      officeDuplicateExtras: officeDupes,
      personDuplicateExtras: personDupes,
      reviewQueue: snapshot.bundle.reviewQueue.length,
    },
    brands: brandClasses,
    dates: {
      sourceCapturedAt: snapshot.bundle.meta.sourceCapturedAt,
      lastObservedAt: snapshot.bundle.meta.lastObservedAt,
      lastResearchAt: snapshot.bundle.meta.lastResearchAt,
      lastVerificationAt: snapshot.bundle.meta.lastVerificationAt,
      inventoryStatusLabel: snapshot.bundle.meta.inventoryStatusLabel,
    },
    byteSize: outBytes.byteLength,
    sha256,
    security,
    dataClassification: {
      anonymous: false,
      contactsOmitted: snapshot.attestations.contactsOmitted,
      containsProfessionalIdentifiers: true,
      identifierKinds: [
        'fullName',
        'officeRelation',
        'officialProfileUrl',
        'durableKeys',
      ],
    },
    gitSafety: {
      intendedOutsideTrackedTree: true,
      refusedPublicDir: true,
    },
  };

  const reportPath = path.join(
    args.outDir,
    `rakip-inventory-snapshot-v1-${stamp}.report.json`
  );
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  // Machine summary only — no person payloads
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
