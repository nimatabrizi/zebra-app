/**
 * One-time Staging operator checklist for inventory snapshot migration + upload.
 * Documentation-as-code — does not execute live actions.
 */

export const RAKIP_INVENTORY_STAGING_OPERATOR_CHECKLIST = {
  checklistId: 'rakip-inventory-staging-upload-v1',
  privacyClassification: {
    level: 'professional_identifiers_pii_minimized',
    anonymous: false,
    contactsOmitted: true,
    contains: [
      'fullName',
      'officeRelation',
      'officialProfileUrl',
      'durableOfficePersonKeys',
    ],
    omitted: ['phone', 'email', 'whatsapp', 'address', 'instagramHandle'],
    handling:
      'Private bucket + service_role metadata only; UUID allowlist on every UI read; never commit snapshot JSON; never public/static.',
  },
  preflight: [
    {
      step: 1,
      action:
        'Confirm target is Staging project ref noagxyztimvefmewjybj and Preview host allowlist only',
      ban: 'Production project / Production Vercel env',
    },
    {
      step: 2,
      action:
        'Confirm local snapshot file path, snapshotVersionId, byteSize, SHA-256 out-of-band (do not paste secrets)',
      ban: 'Modifying source.xlsx; committing snapshot JSON to git',
    },
    {
      step: 3,
      action:
        'Confirm RAKIP_ALLOWED_USER_IDS set on Preview host (UUID gate); empty allowlist remains fail-closed',
      ban: 'Name/email-based allowlisting',
    },
  ],
  migration: [
    {
      step: 4,
      action:
        'Review supabase/migrations/20261119_cb360_inventory_snapshot_draft.sql offline (RLS + service_role-only)',
      ban: 'Applying to Production',
    },
    {
      step: 5,
      action:
        'Apply draft migration ONLY on Staging after explicit approval (Supabase SQL editor / controlled migrate)',
      ban: 'Auto-apply from CI without approval',
    },
    {
      step: 6,
      action:
        'Verify tables exist, RLS enabled, anon/authenticated cannot SELECT; cb360-private remains non-public',
      ban: 'Adding authenticated SELECT policies for inventory tables',
    },
  ],
  upload: [
    {
      step: 7,
      action:
        'Dry-run: npx tsx lib/rakip/inventory/stagingImportCli.ts --file <path> --sha256 <hex> --snapshot-id <id> --byte-size <n> --approve --mode dry-run with RAKIP_INVENTORY_OPERATOR_APPROVAL=<id>',
      ban: 'Skipping SHA / id / byte checks',
    },
    {
      step: 8,
      action:
        'Execute once: set RAKIP_INVENTORY_ALLOW_LIVE_IMPORT=1 for shell only; --mode execute; unset immediately after',
      ban: 'Leaving live-import flag permanently enabled; public bucket upload',
    },
    {
      step: 9,
      action:
        'Confirm report outcome imported|idempotent_replay; labeledAsCurrent=false; lastResearchAt null unless intentionally merged',
      ban: 'Marking baseline as current publish / touching cb360_current_bundle',
    },
  ],
  verification: [
    {
      step: 10,
      action:
        'On Preview: RAKIP_INVENTORY_USE_STAGING_STORE=1 + Staging secrets present; GET /api/rakip-ui/inventory as allowlisted UUID',
      ban: 'Service_role in client bundle; Cache-Control shared caches of inventory JSON',
    },
    {
      step: 11,
      action:
        'Confirm unauthorized session → 401/403; wrong project ref → fail-closed; UI label Son Kayıtlı Envanter',
      ban: 'Interpreting missing people/offices as departures',
    },
  ],
  rollback: [
    {
      step: 12,
      action:
        'Point cb360_inventory_latest.snapshot_id back to prior snapshot id (if any) or clear pointer; leave immutable object in place',
      ban: 'Deleting evidence objects without tracker; Production changes',
    },
    {
      step: 13,
      action:
        'Unset RAKIP_INVENTORY_USE_STAGING_STORE / ALLOW_LIVE_IMPORT / OPERATOR_APPROVAL; fall back to local snapshot/xlsx for Mac-only debug',
      ban: 'Pushing snapshot JSON or PII to GitHub',
    },
  ],
} as const;
