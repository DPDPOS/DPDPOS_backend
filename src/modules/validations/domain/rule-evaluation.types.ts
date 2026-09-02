import type { DataAssetRecord } from "../../inventory/types/data-asset.types.js";
import type { ProcessingActivityRecord } from "../../inventory/types/processing-activity.types.js";
import type { NoticeRecord } from "../../consent/types/notice.types.js";
import type { ConsentRecordRecord } from "../../consent/types/consent-record.types.js";
import type { DataSubjectRequestRecord } from "../../rights/types/data-subject-request.types.js";

export type VendorValidationSnapshot = {
  id: string;
  name: string;
  status: string;
  criticality: string;
  hasActiveDpa: boolean;
  latestReviewOutcome: string | null;
  crossBorderAllowed: boolean;
};

export type ControlValidationSnapshot = {
  id: string;
  code: string;
  status: string;
  approvedEvidenceCount: number;
};

export type OrganizationValidationSnapshot = {
  isSignificantDataFiduciary: boolean;
  processesChildrenData: boolean;
  hasDpoUser: boolean;
  frameworkId: string | null;
};

export type OpenFindingValidationSnapshot = {
  id: string;
  ruleCode: string;
  severity: string;
  status: string;
  systemId: string | null;
  dataAssetId: string | null;
  lastSeenAt: Date;
};

export type AgentValidationSnapshot = {
  id: string;
  state: string;
  lastHeartbeatAt: Date | null;
};

/**
 * Org-scoped discovery snapshot handed to every evaluator.
 * Built once per run by the execution engine — evaluators never query.
 */
export type RuleEvaluationInput = {
  organizationId: string;
  organization: OrganizationValidationSnapshot;
  controls: ControlValidationSnapshot[];

  dataAssets: DataAssetRecord[];
  processingActivities: ProcessingActivityRecord[];
  notices: NoticeRecord[];
  consentRecords: ConsentRecordRecord[];
  dataSubjectRequests: DataSubjectRequestRecord[];
  vendors?: VendorValidationSnapshot[];
  openErasureRequests: number;
  openFindings: OpenFindingValidationSnapshot[];
  agents: AgentValidationSnapshot[];
  catalogRevisionAgeHours: number | null;
};
