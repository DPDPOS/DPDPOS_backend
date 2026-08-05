export type NoticeRecord = {
  id: string;
  organizationId: string;

  title: string;
  version: number;
  content: string;
  effectiveFrom: Date | null;
  publishedBy: string | null;

  createdBy: string | null;
  updatedBy: string | null;

  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

export type NoticeResponse = {
  id: string;

  title: string;
  version: number;
  content: string;
  effectiveFrom: string | null;
  publishedBy: string | null;

  createdAt: string;
  updatedAt: string;
};

export function toNoticeResponse(notice: NoticeRecord): NoticeResponse {
  return {
    id: notice.id,

    title: notice.title,
    version: notice.version,
    content: notice.content,
    effectiveFrom: notice.effectiveFrom
      ? notice.effectiveFrom.toISOString()
      : null,
    publishedBy: notice.publishedBy,

    createdAt: notice.createdAt.toISOString(),
    updatedAt: notice.updatedAt.toISOString(),
  };
}
