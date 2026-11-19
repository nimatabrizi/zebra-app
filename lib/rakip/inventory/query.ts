import type {
  RakipInventoryBundle,
  RakipInventoryListResult,
  RakipInventoryQuery,
  RakipOfficeView,
  RakipPersonView,
} from './types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function norm(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function clampPaging(query: RakipInventoryQuery): {
  limit: number;
  offset: number;
} {
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(query.limit) || DEFAULT_LIMIT)
  );
  const offset = Math.max(0, Number(query.offset) || 0);
  return { limit, offset };
}

function matchBrandClass(
  brandClass: string,
  query: RakipInventoryQuery
): boolean {
  if (!query.brandClass || query.brandClass === 'all') return true;
  return brandClass === query.brandClass;
}

function matchOffice(item: RakipOfficeView, query: RakipInventoryQuery): boolean {
  if (query.brand && norm(item.brand) !== norm(query.brand)) return false;
  if (!matchBrandClass(item.brandClass, query)) return false;
  if (query.province && norm(item.province) !== norm(query.province)) return false;
  if (query.office) {
    const q = norm(query.office);
    if (norm(item.officeName) !== q && norm(item.officeKey) !== q) return false;
  }
  if (query.q) {
    const q = norm(query.q);
    const hay = norm(
      `${item.officeName} ${item.brand} ${item.province} ${item.district} ${item.officeKey}`
    );
    if (!hay.includes(q)) return false;
  }
  return true;
}

function matchPerson(item: RakipPersonView, query: RakipInventoryQuery): boolean {
  if (query.brand && norm(item.brand) !== norm(query.brand)) return false;
  if (!matchBrandClass(item.brandClass, query)) return false;
  if (query.province && norm(item.province) !== norm(query.province)) return false;
  if (query.office) {
    const q = norm(query.office);
    if (
      norm(item.officeName) !== q &&
      norm(item.officeKey) !== q &&
      !norm(item.officeName).includes(q)
    ) {
      return false;
    }
  }
  if (query.q) {
    const q = norm(query.q);
    const hay = norm(
      `${item.fullName} ${item.brand} ${item.officeName} ${item.province} ${item.district} ${item.roleTitle}`
    );
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function listInventoryOffices(
  bundle: RakipInventoryBundle,
  query: RakipInventoryQuery = {}
): RakipInventoryListResult<RakipOfficeView> {
  const { limit, offset } = clampPaging(query);
  const filtered = bundle.offices.filter((o) => matchOffice(o, query));
  return {
    meta: bundle.meta,
    total: filtered.length,
    offset,
    limit,
    items: filtered.slice(offset, offset + limit),
  };
}

export function listInventoryPeople(
  bundle: RakipInventoryBundle,
  query: RakipInventoryQuery = {}
): RakipInventoryListResult<RakipPersonView> {
  const { limit, offset } = clampPaging(query);
  const filtered = bundle.people.filter((p) => matchPerson(p, query));
  return {
    meta: bundle.meta,
    total: filtered.length,
    offset,
    limit,
    items: filtered.slice(offset, offset + limit),
  };
}
