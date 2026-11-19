/**
 * Rakip İstihbaratı UI metadata — tabs, brands, capability flags.
 * Capability flags stay false until an executor PoC is proven.
 */

export const RAKIP_TAB_IDS = [
  'rakip-ozet',
  'rakip-inceleme',
  'rakip-danismanlar',
  'rakip-ofisler',
  'rakip-taramalar',
] as const;

export type RakipTabId = (typeof RAKIP_TAB_IDS)[number];

export function isRakipTabId(tabId: string): tabId is RakipTabId {
  return (RAKIP_TAB_IDS as readonly string[]).includes(tabId);
}

export const RAKIP_NAV_LEAVES: ReadonlyArray<{
  id: RakipTabId;
  label: string;
}> = [
  { id: 'rakip-ozet', label: 'Özet' },
  { id: 'rakip-inceleme', label: 'İnceleme Kuyruğu' },
  { id: 'rakip-danismanlar', label: 'Danışmanlar' },
  { id: 'rakip-ofisler', label: 'Ofisler' },
  { id: 'rakip-taramalar', label: 'Taramalar' },
];

/** Placeholder brand slots until real inventory is wired. */
export const RAKIP_TRACKED_BRANDS: ReadonlyArray<{
  id: string;
  label: string;
}> = Array.from({ length: 13 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: `tracked_brand_${n}`, label: `Takip markası ${n}` };
});

/** Browser / Work executor not proven for Zebra button → keep launch disabled. */
export const RAKIP_SCAN_EXECUTOR_READY = false;

/** Nightly 00:00 Europe/Istanbul cron not installed yet. */
export const RAKIP_NIGHTLY_AUTOMATION_READY = false;

export const RAKIP_NIGHTLY_SCHEDULE_LABEL =
  'Her gece 00:00 (Europe/Istanbul) — planlandı, henüz kurulmadı';

export type RakipShellPayload = {
  inventoryReady: false;
  scanExecutorReady: boolean;
  nightlyAutomationReady: boolean;
  nightlyScheduleLabel: string;
  trackedBrandCount: number;
  brands: ReadonlyArray<{ id: string; label: string }>;
  message: string;
};

export function buildRakipShellPayload(): RakipShellPayload {
  return {
    inventoryReady: false,
    scanExecutorReady: RAKIP_SCAN_EXECUTOR_READY,
    nightlyAutomationReady: RAKIP_NIGHTLY_AUTOMATION_READY,
    nightlyScheduleLabel: RAKIP_NIGHTLY_SCHEDULE_LABEL,
    trackedBrandCount: RAKIP_TRACKED_BRANDS.length,
    brands: RAKIP_TRACKED_BRANDS,
    message:
      'Rakip envanteri henüz bağlanmadı. İlk gerçek tarama sonrası güncel envanter burada görünecek.',
  };
}
