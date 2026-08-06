import type { ValidationDataProvider } from "../interfaces/validation-data-provider.interface.js";
import type { RuleEvaluationInput } from "../domain/rule-evaluation.types.js";

import { DataAssetRepository } from "../../inventory/repositories/data-asset.repository.js";
import { ProcessingActivityRepository } from "../../inventory/repositories/processing-activity.repository.js";
import { NoticeRepository } from "../../consent/repositories/notice.repository.js";
import { ConsentRecordRepository } from "../../consent/repositories/consent-record.repository.js";
import { DataSubjectRequestRepository } from "../../rights/repositories/data-subject-request.repository.js";

/**
 * Loads the discovery snapshot for one organization by reading Dev B's own
 * modules (inventory / consent / rights) through their repositories —
 * the same direct-repo pattern the consent module uses for data assets.
 */
export class PrismaValidationDataProvider implements ValidationDataProvider {
  constructor(
    private readonly dataAssets = new DataAssetRepository(),
    private readonly processingActivities = new ProcessingActivityRepository(),
    private readonly notices = new NoticeRepository(),
    private readonly consentRecords = new ConsentRecordRepository(),
    private readonly dataSubjectRequests = new DataSubjectRequestRepository(),
  ) {}

  async loadSnapshot(organizationId: string): Promise<RuleEvaluationInput> {
    const [assets, activities, notices, consents, requests] =
      await Promise.all([
        this.dataAssets.list(organizationId),
        this.processingActivities.list(organizationId),
        this.notices.list(organizationId),
        this.consentRecords.list(organizationId),
        this.dataSubjectRequests.list(organizationId),
      ]);

    return {
      organizationId,
      dataAssets: assets,
      processingActivities: activities,
      notices,
      consentRecords: consents,
      dataSubjectRequests: requests,
    };
  }
}
