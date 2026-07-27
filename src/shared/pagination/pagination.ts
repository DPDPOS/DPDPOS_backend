export type PaginationInput = {
  page?: number;
  pageSize?: number;
};

export type PaginationResult = {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export function normalizePagination(input: PaginationInput = {}): PaginationResult {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20));
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function buildPaginationMeta(total: number, page: number, pageSize: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
