import { Cb360Error, type Cb360BrandResult, type Cb360RunStatus } from './types';

export type PublishDecision =
  | { publish: true; becameCurrent: true; status: 'completed' }
  | {
      publish: false;
      becameCurrent: false;
      status: Extract<Cb360RunStatus, 'partial' | 'failed' | 'rejected_policy'>;
      errorCode: string;
    };

/**
 * Work'ün bildirdiği marka sonuçları bağımsız doğrulanmış sayılmaz.
 * PARTIAL/ERROR asla current bundle'ı değiştirmez.
 */
export function decidePublish(params: {
  brandResults: Cb360BrandResult[];
  plannedBrandCount: number | null;
  forcePartial?: boolean;
  forceFailed?: boolean;
}): PublishDecision {
  if (params.forceFailed) {
    return {
      publish: false,
      becameCurrent: false,
      status: 'failed',
      errorCode: 'run_failed',
    };
  }

  if (params.forcePartial) {
    return {
      publish: false,
      becameCurrent: false,
      status: 'partial',
      errorCode: 'partial_not_publishable',
    };
  }

  const results = params.brandResults;
  const planned = params.plannedBrandCount;
  const ok = results.filter((r) => r.outcome === 'ok').length;
  const failed = results.filter((r) => r.outcome === 'failed').length;
  const skipped = results.filter((r) => r.outcome === 'skipped').length;

  if (planned != null && results.length !== planned) {
    return {
      publish: false,
      becameCurrent: false,
      status: 'partial',
      errorCode: 'brand_count_mismatch',
    };
  }

  if (failed > 0 || skipped > 0 || ok === 0) {
    return {
      publish: false,
      becameCurrent: false,
      status: 'partial',
      errorCode: 'partial_brands',
    };
  }

  if (planned != null && ok !== planned) {
    return {
      publish: false,
      becameCurrent: false,
      status: 'partial',
      errorCode: 'incomplete_brands',
    };
  }

  return { publish: true, becameCurrent: true, status: 'completed' };
}

export function assertBaseNotStale(params: {
  claimedBaseVersionId: string | null | undefined;
  claimedBaseSha256: string | null | undefined;
  currentSourceVersionId: string | null;
  currentSourceSha256: string | null;
}): void {
  const {
    claimedBaseVersionId,
    claimedBaseSha256,
    currentSourceVersionId,
    currentSourceSha256,
  } = params;

  if (!currentSourceVersionId || !currentSourceSha256) {
    // No published current yet — first publish allowed if claim is empty or matches bootstrap
    if (!claimedBaseVersionId && !claimedBaseSha256) return;
    throw new Cb360Error('stale_base', 'Current bundle yok; base claim tutarsız', 409);
  }

  if (
    claimedBaseVersionId !== currentSourceVersionId ||
    (claimedBaseSha256 &&
      claimedBaseSha256.toLowerCase() !== currentSourceSha256.toLowerCase())
  ) {
    throw new Cb360Error(
      'stale_base',
      'Stale base: current bundle run başlangıcından sonra değişmiş',
      409
    );
  }
}

export function assertNotPartialPublish(decision: PublishDecision): void {
  if (!decision.publish || !decision.becameCurrent) {
    throw new Cb360Error(
      'partial_not_publishable',
      'PARTIAL/ERROR sonuçları current bundle yayınlamaz',
      409
    );
  }
}
