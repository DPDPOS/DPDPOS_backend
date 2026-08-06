import type { BaseDomainEvent } from "../../../../events/types/base-event.interface.js";
import { auditService } from "../../services/audit.service.js";

export async function onAuditableEvent(event: BaseDomainEvent): Promise<void> {
  await auditService.logEvent(event);
}
