/**
 * Cloud event candidates → Zebra review queue (no notifications).
 * Evidence gates: no prior ⇒ no join/depart/transfer/office-change promotion.
 */
import { createHash } from 'node:crypto';
import type {
  RakipEventCandidateType,
  RakipReviewQueueItem,
} from './types';

export type CloudEventCandidateInput = {
  eventCandidateId?: string;
  eventType?: string;
  personKey?: string;
  fullName?: string;
  brandSlug?: string;
  officeKey?: string;
  observedAt?: string;
  sourceUrl?: string;
  confidence?: 'high' | 'medium' | 'low' | string;
  verificationStatus?: string;
  priorRecordAvailable?: boolean;
  evidence?: unknown;
};

const MOVEMENT_TYPES = new Set<RakipEventCandidateType>([
  'consultant_joined',
  'consultant_departed_candidate',
  'consultant_office_changed',
  'consultant_brand_transfer_candidate',
  'consultant_reactivated_candidate',
]);

const ALLOWED_TYPES = new Set<string>([
  'consultant_joined',
  'consultant_departed_candidate',
  'consultant_office_changed',
  'consultant_brand_transfer_candidate',
  'consultant_reactivated_candidate',
  'identity_match_proposed',
  'instagram_affiliation_signal',
  'coverage_gap',
  'source_access_failed',
]);

function reviewIdFor(
  researchRunId: string,
  candidate: CloudEventCandidateInput
): string {
  if (candidate.eventCandidateId) {
    return `rev_${candidate.eventCandidateId}`;
  }
  const basis = [
    researchRunId,
    candidate.eventType || '',
    candidate.personKey || '',
    candidate.officeKey || '',
    candidate.observedAt || '',
  ].join('|');
  return `rev_${createHash('sha256').update(basis).digest('hex').slice(0, 16)}`;
}

/**
 * Convert cloud eventCandidates into review-queue items.
 * Movement events without prior inventory are demoted / dropped.
 */
export function reviewItemsFromCloudEventCandidates(
  candidates: CloudEventCandidateInput[],
  opts: { researchRunId: string; priorInventoryAvailable: boolean }
): RakipReviewQueueItem[] {
  const out: RakipReviewQueueItem[] = [];

  for (const c of candidates) {
    const eventType = String(c.eventType || '');
    if (!ALLOWED_TYPES.has(eventType)) continue;

    const typed = eventType as RakipEventCandidateType;
    const priorOk =
      c.priorRecordAvailable === true || opts.priorInventoryAvailable === true;

    if (MOVEMENT_TYPES.has(typed) && !priorOk) {
      // Do not assert movement without prior — keep as coverage note only when useful.
      out.push({
        reviewId: reviewIdFor(opts.researchRunId, {
          ...c,
          eventType: 'coverage_gap',
        }),
        eventType: 'coverage_gap',
        personKey: c.personKey || null,
        fullName: c.fullName || null,
        brandSlug: c.brandSlug || null,
        officeKey: c.officeKey || null,
        observedAt: c.observedAt || null,
        sourceUrl: c.sourceUrl || null,
        confidence: (c.confidence as 'high' | 'medium' | 'low') || 'low',
        verificationStatus: 'insufficient_prior',
        priorRecordAvailable: false,
        evidenceSummary:
          'Movement candidate ignored without prior inventory; recorded as coverage_gap.',
        researchRunId: opts.researchRunId,
        notificationStatus: 'not_sent',
      });
      continue;
    }

    out.push({
      reviewId: reviewIdFor(opts.researchRunId, c),
      eventType: typed,
      personKey: c.personKey || null,
      fullName: c.fullName || null,
      brandSlug: c.brandSlug || null,
      officeKey: c.officeKey || null,
      observedAt: c.observedAt || null,
      sourceUrl: c.sourceUrl || null,
      confidence: (c.confidence as 'high' | 'medium' | 'low') || null,
      verificationStatus:
        c.verificationStatus || 'needs_zebra_verification',
      priorRecordAvailable: priorOk,
      evidenceSummary: `${typed} candidate queued for human/Zebra verification`,
      researchRunId: opts.researchRunId,
      notificationStatus: 'not_sent',
    });
  }

  return out;
}
