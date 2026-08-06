import type { DataAssetRecord } from "../../inventory/types/data-asset.types.js";
import type { ProcessingActivityRecord } from "../../inventory/types/processing-activity.types.js";
import type { NoticeRecord } from "../../consent/types/notice.types.js";
import type { ConsentRecordRecord } from "../../consent/types/consent-record.types.js";
import type { DataSubjectRequestRecord } from "../../rights/types/data-subject-request.types.js";

/**
 * Org-scoped discovery snapshot handed to every evaluator.
 * Built once per run by the execution engine — evaluators never query.
 */
export type RuleEvaluationInput = {
  organizationId: string;

  dataAssets: DataAssetRecord[];
  processingActivities: ProcessingActivityRecord[];
  notices: NoticeRecord[];
  consentRecords: ConsentRecordRecord[];
  dataSubjectRequests: DataSubjectRequestRecord[];
};
