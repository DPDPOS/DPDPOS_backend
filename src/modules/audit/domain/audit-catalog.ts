/**
 * Human-readable audit catalog — maps domain event names to entity type +
 * description so auditors see why an entry exists, not just CamelCase noise.
 */

export type AuditCatalogEntry = {
  entityType: string;
  description: string;
};

const CATALOG: Record<string, AuditCatalogEntry> = {
  OrganizationCreated: {
    entityType: "Organization",
    description: "Organization tenant was created",
  },
  OrganizationOnboarded: {
    entityType: "Organization",
    description: "Organization completed onboarding",
  },
  UserInvited: {
    entityType: "User",
    description: "User was invited to the organization",
  },
  UserDeactivated: {
    entityType: "User",
    description: "User account was deactivated",
  },
  UserLoggedIn: {
    entityType: "User",
    description: "User signed in successfully",
  },
  RoleAssigned: {
    entityType: "Role",
    description: "Role was assigned to a user",
  },
  RolePermissionsChanged: {
    entityType: "Role",
    description: "Role permissions were updated",
  },
  DepartmentCreated: {
    entityType: "Department",
    description: "Department was created",
  },
  FrameworkPublished: {
    entityType: "Framework",
    description: "Compliance framework was published",
  },
  ControlAssigned: {
    entityType: "Control",
    description: "Control ownership was assigned",
  },
  ControlUpdated: {
    entityType: "Control",
    description: "Control status or fields were updated",
  },
  RequirementMapped: {
    entityType: "Requirement",
    description: "Obligation was mapped to a control",
  },
  DataAssetCreated: {
    entityType: "DataAsset",
    description: "Data asset was registered in the inventory",
  },
  RetentionExpiringSoon: {
    entityType: "DataAsset",
    description: "Retention window for a data asset is expiring soon",
  },
  ConsentRecorded: {
    entityType: "ConsentRecord",
    description: "Data principal consent was recorded",
  },
  ConsentWithdrawn: {
    entityType: "ConsentRecord",
    description: "Data principal withdrew consent",
  },
  ProcessingActivityCreated: {
    entityType: "ProcessingActivity",
    description: "Processing activity was added to the RoPA",
  },
  RightsRequestSubmitted: {
    entityType: "DataSubjectRequest",
    description: "Data principal rights request was submitted",
  },
  RightsRequestClosed: {
    entityType: "DataSubjectRequest",
    description: "Data principal rights request was closed",
  },
  ValidationCompleted: {
    entityType: "ValidationRun",
    description: "Validation run completed successfully",
  },
  ValidationFailed: {
    entityType: "ValidationRun",
    description: "Validation run reported failures",
  },
  ViolationCreated: {
    entityType: "Violation",
    description: "Compliance violation was opened",
  },
  ViolationClosed: {
    entityType: "Violation",
    description: "Compliance violation was closed",
  },
  RemediationTaskAssigned: {
    entityType: "RemediationTask",
    description: "Remediation task was assigned",
  },
  RemediationCompleted: {
    entityType: "RemediationTask",
    description: "Remediation task was completed / verified",
  },
  EvidenceUploaded: {
    entityType: "EvidenceFile",
    description: "Evidence file was uploaded to the vault",
  },
  EvidenceApproved: {
    entityType: "EvidenceFile",
    description: "Evidence file was approved as proof",
  },
  ReportRequested: {
    entityType: "Report",
    description: "Report generation was requested",
  },
  ReportGenerated: {
    entityType: "Report",
    description: "Report finished generating and is ready to download",
  },
  SnapshotComputed: {
    entityType: "Analytics",
    description: "Compliance snapshot was recomputed",
  },
  NotificationSent: {
    entityType: "Notification",
    description: "In-app / email notification was sent",
  },
  NotificationFailed: {
    entityType: "Notification",
    description: "Notification delivery failed",
  },
  AiSummaryReady: {
    entityType: "AiUsage",
    description: "AI summary job finished",
  },
  AiDraftReady: {
    entityType: "AiUsage",
    description: "AI draft job finished",
  },
  PasswordResetRequested: {
    entityType: "User",
    description: "Password reset was requested",
  },
  VendorCreated: {
    entityType: "Vendor",
    description: "Vendor / processor was registered",
  },
  VendorRiskChanged: {
    entityType: "Vendor",
    description: "Vendor risk rating changed",
  },
  DpaExpiring: {
    entityType: "Vendor",
    description: "Data processing agreement is expiring soon",
  },
  SubProcessorAdded: {
    entityType: "Vendor",
    description: "Sub-processor was added to a vendor",
  },
  ErasureSoftDeleted: {
    entityType: "DataSubjectRequest",
    description: "Erasure soft-delete step completed",
  },
  ErasureCompleted: {
    entityType: "DataSubjectRequest",
    description: "Erasure request was fully completed",
  },
};

export function resolveAuditCatalog(actionType: string): AuditCatalogEntry {
  const known = CATALOG[actionType];
  if (known) return known;

  // Fallback: split CamelCase event names into a readable sentence.
  const spaced = actionType.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const match = actionType.match(
    /^([A-Z][a-zA-Z0-9]+?)(Created|Updated|Deleted|Approved|Uploaded|Closed|Assigned|Mapped|Published|Submitted|Completed|Failed|Sent|Ready|Changed|Added|Requested|Computed|Withdrawn|Recorded|Onboarded|Invited|Deactivated|LoggedIn)$/,
  );
  return {
    entityType: match?.[1] ?? "System",
    description: spaced,
  };
}
