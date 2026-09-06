import { randomBytes, createHmac } from "node:crypto";
import { AgentOrchestrationService, DiscoveryReportPayload, TableMetadata } from "../../agents/services/agent-orchestrator.service.js";

export interface ComplianceFinding {
  id: string;
  statutoryClause: string;
  isoControl: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  affectedAssets: string[];
  remediation?: {
    id: string;
    title: string;
    description: string;
    actionType: "ASSIGN_PURPOSE" | "MAP_PURPOSE" | "ENABLE_MASKING" | "CONFIGURE_RETENTION" | "REVIEW_PII";
    targetTable?: string;
    targetColumn?: string;
    suggestedPurpose?: string;
    autoFixable: boolean;
  };
}

export interface ComplianceReport {
  tenantId: string;
  score: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  generatedAt: string;
  totalPiiFields: number;
  unmappedPiiFields: number;
  activeDsrCount: number;
  findings: ComplianceFinding[];
  summary: {
    purposeMappingPassed: boolean;
    dataMinimizationPassed: boolean;
    retentionLimitationPassed: boolean;
    encryptionSafeguardsPassed: boolean;
  };
}

export interface ConsentNotice {
  noticeId: string;
  tenantId: string;
  version: string;
  title: string;
  purposes: Array<{
    purposeId: string;
    description: string;
    isMandatory: boolean;
    retentionDays: number;
  }>;
  publishedAt: string;
}

export interface ConsentRecord {
  recordId: string;
  tenantId: string;
  principalId: string;
  noticeVersion: string;
  consentedPurposes: string[];
  timestamp: string;
  channel: string;
}

export interface DsrRequestItem {
  dsrId: string;
  tenantId: string;
  principalId: string;
  requestType: "ACCESS" | "CORRECTION" | "ERASURE" | "NOMINATION";
  status: "PENDING_REVIEW" | "APPROVED" | "SOFT_DELETED" | "HARD_PURGED" | "REJECTED" | "RESTORED";
  requestedBy: string;
  requestedAt: string;
  slaDeadline: string;
  gracePeriodDays: number;
  softDeletedAt?: string;
  retentionExpiresAt?: string;
  approvedBy?: string;
  notes?: string;
}

export interface AuditLogEntry {
  id: string;
  tenantId: string;
  timestamp: string;
  action: string;
  actor: string;
  payload: any;
  checksum: string;
}

export class ComplianceGovernanceService {
  private static instance: ComplianceGovernanceService;
  private reports: Map<string, ComplianceReport> = new Map();
  private notices: Map<string, ConsentNotice[]> = new Map();
  private consents: Map<string, ConsentRecord[]> = new Map();
  private dsrs: Map<string, DsrRequestItem[]> = new Map();
  private auditLogs: Map<string, AuditLogEntry[]> = new Map();
  private orchestrator = AgentOrchestrationService.getInstance();
  private hmacKey = process.env.AUDIT_HMAC_KEY || "dpdp-iso27001-tamper-evident-key";

  public static getInstance(): ComplianceGovernanceService {
    if (!ComplianceGovernanceService.instance) {
      ComplianceGovernanceService.instance = new ComplianceGovernanceService();
    }
    return ComplianceGovernanceService.instance;
  }

  constructor() {
    this.initDefaultNotices();
  }

  private initDefaultNotices() {
    const defaultNotices: ConsentNotice[] = [
      {
        noticeId: "not_v1_enterprise",
        tenantId: "tenant-default",
        version: "v1.0",
        title: "Enterprise Customer Privacy Notice & Consent Policy",
        purposes: [
          { purposeId: "essential", description: "Account management, order fulfillment, and billing", isMandatory: true, retentionDays: 1095 },
          { purposeId: "marketing", description: "Personalized promotions and discount campaigns", isMandatory: false, retentionDays: 365 },
          { purposeId: "analytics", description: "Platform telemetry and service improvement", isMandatory: false, retentionDays: 180 },
          { purposeId: "statutory_kyc", description: "Statutory identification verification and tax compliance", isMandatory: true, retentionDays: 2555 },
        ],
        publishedAt: new Date().toISOString(),
      },
    ];
    this.notices.set("tenant-default", defaultNotices);
  }

  // --- COMPLIANCE EVALUATION & SCORING ---

  public generateReport(tenantId: string = "tenant-default"): ComplianceReport {
    const discoveryReports = this.orchestrator.getDiscoveryReports(tenantId);
    const notices = this.getNotices(tenantId);
    const dsrRequests = this.listDsrs(tenantId);

    const findings: ComplianceFinding[] = [];
    let totalPiiFields = 0;
    let unmappedPiiFields = 0;

    const registeredPurposes = new Set<string>();
    for (const notice of notices) {
      for (const purpose of notice.purposes) {
        registeredPurposes.add(purpose.purposeId.toLowerCase());
      }
    }

    if (registeredPurposes.size === 0) {
      registeredPurposes.add("essential");
      registeredPurposes.add("marketing");
      registeredPurposes.add("analytics");
      registeredPurposes.add("statutory_kyc");
    }

    for (const report of discoveryReports) {
      for (const table of report.tables) {
        for (const col of table.columns) {
          if (col.detectedPii && col.detectedPii.piiType !== "UNKNOWN") {
            totalPiiFields++;
            const piiType = col.detectedPii.piiType;
            const assetKey = `${table.tableName}.${col.name}`;

            const hasMappedPurpose =
              col.purposeTags &&
              col.purposeTags.length > 0 &&
              col.purposeTags.some((tag: string) => registeredPurposes.has(tag.toLowerCase()));

            if (!hasMappedPurpose) {
              unmappedPiiFields++;
              findings.push({
                id: `finding-purpose-${table.tableName}-${col.name}`,
                statutoryClause: "DPDP Act Sec. 5(1) & 6(1) - Notice & Purpose Specification",
                isoControl: "ISO 27001 A.5.34 (Privacy and protection of PII)",
                title: `Unmapped Personal Data: ${assetKey} (${piiType})`,
                description: `Discovered personal data identifier (${piiType}) in table '${table.tableName}', column '${col.name}' is not bound to any registered statutory consent purpose.`,
                severity: "HIGH",
                affectedAssets: [assetKey],
                remediation: {
                  id: `rem-map-${table.tableName}-${col.name}`,
                  title: `Bind ${col.name} to Lawful Consent Purpose`,
                  description: `Map column '${col.name}' to a registered consent notice purpose in the Consent Registry.`,
                  actionType: "MAP_PURPOSE",
                  targetTable: table.tableName,
                  targetColumn: col.name,
                  suggestedPurpose: this.suggestPurpose(piiType),
                  autoFixable: true,
                },
              });
            }

            if (["AADHAAR", "CREDIT_CARD", "SALARY"].includes(piiType)) {
              const isMasked =
                col.detectedPii.sampleMasked || (col.purposeTags && col.purposeTags.includes("masked"));
              if (!isMasked) {
                findings.push({
                  id: `finding-mask-${table.tableName}-${col.name}`,
                  statutoryClause: "DPDP Act Sec. 8(5) - Technical Security Safeguards",
                  isoControl: "ISO 27001 A.8.11 (Data Masking) & A.8.24 (Cryptography)",
                  title: `High-Risk Plaintext Identifier: ${assetKey}`,
                  description: `Column '${col.name}' holds high-risk personal data (${piiType}) requiring active pseudonymization and masking in operational views.`,
                  severity: "MEDIUM",
                  affectedAssets: [assetKey],
                  remediation: {
                    id: `rem-mask-${table.tableName}-${col.name}`,
                    title: `Enable Dynamic Masking for ${col.name}`,
                    description: `Configure masking rule to transform values to masked previews (e.g., 'XXXX-XXXX-1234') in non-privileged audit contexts.`,
                    actionType: "ENABLE_MASKING",
                    targetTable: table.tableName,
                    targetColumn: col.name,
                    autoFixable: true,
                  },
                });
              }
            }
          }
        }
      }
    }

    const now = new Date();
    for (const dsr of dsrRequests) {
      if (dsr.status === "PENDING_REVIEW") {
        const slaDeadline = new Date(dsr.slaDeadline);
        if (now > slaDeadline) {
          findings.push({
            id: `finding-dsr-sla-${dsr.dsrId}`,
            statutoryClause: "DPDP Act Sec. 12(3) - Statutory DSR Response Timeline",
            isoControl: "ISO 27001 A.8.10 (Information Deletion)",
            title: `DSR Erasure Request Overdue (${dsr.dsrId})`,
            description: `DSR Request for principal '${dsr.principalId}' has exceeded the 30-day statutory resolution SLA without DPO review.`,
            severity: "CRITICAL",
            affectedAssets: [`dsr:${dsr.dsrId}`],
            remediation: {
              id: `rem-review-${dsr.dsrId}`,
              title: `Immediate DPO Review & Erasure Approval`,
              description: `Review statutory retention grounds and approve or reject the erasure request in the DSR Review Center.`,
              actionType: "REVIEW_PII",
              autoFixable: false,
            },
          });
        }
      } else if (dsr.status === "SOFT_DELETED" && dsr.retentionExpiresAt) {
        const retentionExpiry = new Date(dsr.retentionExpiresAt);
        if (now > retentionExpiry) {
          findings.push({
            id: `finding-retention-expired-${dsr.dsrId}`,
            statutoryClause: "DPDP Act Sec. 8(7) - Storage Limitation & Data Purge",
            isoControl: "ISO 27001 A.8.10 (Information Deletion)",
            title: `Retention Grace Period Expired: Ready for Hard Purge (${dsr.dsrId})`,
            description: `Account deletion grace period for principal '${dsr.principalId}' has expired. Data must now be permanently deleted from primary storage.`,
            severity: "HIGH",
            affectedAssets: [`dsr:${dsr.dsrId}`],
            remediation: {
              id: `rem-purge-${dsr.dsrId}`,
              title: `Execute Permanent Hard Purge`,
              description: `Dispatch hard purge task to the Zone Agent to permanently delete masked quarantine records.`,
              actionType: "CONFIGURE_RETENTION",
              autoFixable: true,
            },
          });
        }
      }
    }

    let score = 100;
    for (const f of findings) {
      if (f.severity === "CRITICAL") score -= 25;
      else if (f.severity === "HIGH") score -= 10;
      else if (f.severity === "MEDIUM") score -= 5;
      else if (f.severity === "LOW") score -= 2;
    }
    score = Math.max(0, Math.min(100, score));

    let grade: ComplianceReport["grade"] = "F";
    if (score >= 95) grade = "A+";
    else if (score >= 85) grade = "A";
    else if (score >= 70) grade = "B";
    else if (score >= 55) grade = "C";
    else if (score >= 40) grade = "D";

    const report: ComplianceReport = {
      tenantId,
      score,
      grade,
      generatedAt: now.toISOString(),
      totalPiiFields,
      unmappedPiiFields,
      activeDsrCount: dsrRequests.filter((d) => d.status === "PENDING_REVIEW" || d.status === "SOFT_DELETED").length,
      findings,
      summary: {
        purposeMappingPassed: unmappedPiiFields === 0,
        dataMinimizationPassed: findings.filter((f) => f.severity === "MEDIUM").length === 0,
        retentionLimitationPassed: findings.filter((f) => f.id.startsWith("finding-retention-expired")).length === 0,
        encryptionSafeguardsPassed: findings.filter((f) => f.id.startsWith("finding-mask")).length === 0,
      },
    };

    this.reports.set(tenantId, report);
    return report;
  }

  public getLatestReport(tenantId: string = "tenant-default"): ComplianceReport {
    return this.reports.get(tenantId) || this.generateReport(tenantId);
  }

  public applyRemediation(
    tenantId: string,
    action: {
      type: "ASSIGN_PURPOSE" | "MAP_PURPOSE" | "ENABLE_MASKING" | "SET_RETENTION" | "OVERRIDE_PII";
      agentId?: string;
      tableName: string;
      columnName: string;
      purposeTags?: string[];
      piiType?: string;
      retentionDays?: number;
    }
  ): ComplianceReport {
    this.orchestrator.overrideColumn(tenantId, action.tableName, action.columnName, {
      purposeTags: action.purposeTags || (action.type === "MAP_PURPOSE" || action.type === "ASSIGN_PURPOSE" ? ["essential"] : undefined),
      piiType: action.piiType,
      isMasked: action.type === "ENABLE_MASKING",
    });

    this.recordAuditLog(tenantId, "REMEDIATION_APPLIED", "DPO", {
      actionType: action.type,
      tableName: action.tableName,
      columnName: action.columnName,
      params: action,
    });

    return this.generateReport(tenantId);
  }

  public getDashboardStats(tenantId: string = "tenant-default") {
    const report = this.getLatestReport(tenantId);
    const agents = this.orchestrator.listAgents(tenantId);
    const dsrs = this.listDsrs(tenantId);
    const dataMap = this.orchestrator.getDataMap(tenantId);

    return {
      complianceScore: report.score,
      complianceGrade: report.grade,
      activeAgentsCount: agents.filter((a) => a.status === "ACTIVE").length,
      totalAgentsCount: agents.length,
      totalPiiCount: report.totalPiiFields,
      unmappedPiiCount: report.unmappedPiiFields,
      activeDsrCount: dsrs.filter((d) => d.status === "PENDING_REVIEW" || d.status === "APPROVED" || d.status === "SOFT_DELETED").length,
      totalDsrCount: dsrs.length,
      targetsCount: dataMap.targets.length,
      lastReportGeneratedAt: report.generatedAt,
    };
  }

  private suggestPurpose(piiType: string): string {
    switch (piiType) {
      case "EMAIL":
      case "PHONE":
      case "ADDRESS":
        return "essential";
      case "AADHAAR":
      case "PAN":
        return "statutory_kyc";
      case "CREDIT_CARD":
      case "UPI_ID":
      case "SALARY":
        return "essential";
      default:
        return "essential";
    }
  }

  // --- CONSENT NOTICES & LEDGER ---

  public getNotices(tenantId: string = "tenant-default"): ConsentNotice[] {
    return this.notices.get(tenantId) || [];
  }

  public createNotice(
    tenantId: string,
    version: string,
    title: string,
    purposes: any[]
  ): ConsentNotice {
    const list = this.getNotices(tenantId);
    const notice: ConsentNotice = {
      noticeId: `not_${randomBytes(6).toString("hex")}`,
      tenantId,
      version,
      title,
      purposes,
      publishedAt: new Date().toISOString(),
    };
    list.push(notice);
    this.notices.set(tenantId, list);

    this.recordAuditLog(tenantId, "NOTICE_PUBLISHED", "DPO", { version, title });
    return notice;
  }

  public recordConsent(
    tenantId: string,
    principalId: string,
    noticeVersion: string,
    consentedPurposes: string[],
    channel: string = "WEB_PORTAL"
  ): ConsentRecord {
    const list = this.consents.get(tenantId) || [];
    const record: ConsentRecord = {
      recordId: `cr_${randomBytes(6).toString("hex")}`,
      tenantId,
      principalId,
      noticeVersion,
      consentedPurposes,
      timestamp: new Date().toISOString(),
      channel,
    };
    list.push(record);
    this.consents.set(tenantId, list);

    this.orchestrator.broadcastTaskToTenant(tenantId, {
      taskId: `task_sync_${Date.now()}`,
      type: "SYNC_CONSENT_CACHE",
      createdAt: new Date().toISOString(),
      data: {
        principalId,
        hasConsent: noticeVersion !== "WITHDRAWN",
        purposes: consentedPurposes,
      },
    });

    this.recordAuditLog(tenantId, "CONSENT_RECORDED", principalId, {
      noticeVersion,
      consentedPurposes,
      channel,
    });

    return record;
  }

  public getConsent(tenantId: string, principalId: string): ConsentRecord | null {
    const list = this.consents.get(tenantId) || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      if (item && item.principalId === principalId) {
        return item;
      }
    }
    return null;
  }

  // --- DSR 3-STAGE LIFECYCLE GOVERNANCE ---

  public listDsrs(tenantId: string = "tenant-default"): DsrRequestItem[] {
    return this.dsrs.get(tenantId) || [];
  }

  public submitDsr(
    tenantId: string,
    principalId: string,
    requestType: "ACCESS" | "CORRECTION" | "ERASURE" | "NOMINATION" = "ERASURE",
    requestedBy: string = "CUSTOMER_PORTAL",
    gracePeriodDays: number = 30
  ): DsrRequestItem {
    const list = this.listDsrs(tenantId);
    const now = new Date();
    const slaDeadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const dsr: DsrRequestItem = {
      dsrId: `dsr_${randomBytes(6).toString("hex")}`,
      tenantId,
      principalId,
      requestType,
      status: "PENDING_REVIEW",
      requestedBy,
      requestedAt: now.toISOString(),
      slaDeadline: slaDeadline.toISOString(),
      gracePeriodDays,
    };

    list.push(dsr);
    this.dsrs.set(tenantId, list);

    this.recordAuditLog(tenantId, "DSR_SUBMITTED", requestedBy, {
      dsrId: dsr.dsrId,
      principalId,
      requestType,
    });

    return dsr;
  }

  public approveDsr(tenantId: string, dsrId: string, dpoUserId: string, notes?: string): DsrRequestItem | null {
    const list = this.listDsrs(tenantId);
    const dsr = list.find((d) => d.dsrId === dsrId);
    if (!dsr || dsr.status !== "PENDING_REVIEW") return null;

    const now = new Date();
    const retentionExpiry = new Date(now.getTime() + dsr.gracePeriodDays * 24 * 60 * 60 * 1000);

    dsr.status = "SOFT_DELETED";
    dsr.softDeletedAt = now.toISOString();
    dsr.retentionExpiresAt = retentionExpiry.toISOString();
    dsr.approvedBy = dpoUserId;
    dsr.notes = notes;

    this.orchestrator.broadcastTaskToTenant(tenantId, {
      taskId: `task_dsr_${dsrId}_${Date.now()}`,
      type: "EXECUTE_DSR",
      createdAt: now.toISOString(),
      data: {
        dsrId: dsr.dsrId,
        action: "SOFT_DELETE_AND_MASK",
        principalId: dsr.principalId,
        targetTables: ["users", "customers", "orders"],
      },
    });

    this.recordAuditLog(tenantId, "DSR_APPROVED", dpoUserId, {
      dsrId,
      principalId: dsr.principalId,
      gracePeriodDays: dsr.gracePeriodDays,
    });

    return dsr;
  }

  public rejectDsr(tenantId: string, dsrId: string, dpoUserId: string, reason: string): DsrRequestItem | null {
    const list = this.listDsrs(tenantId);
    const dsr = list.find((d) => d.dsrId === dsrId);
    if (!dsr || dsr.status !== "PENDING_REVIEW") return null;

    dsr.status = "REJECTED";
    dsr.approvedBy = dpoUserId;
    dsr.notes = reason;

    this.recordAuditLog(tenantId, "DSR_REJECTED", dpoUserId, { dsrId, reason });
    return dsr;
  }

  public restoreDsr(tenantId: string, dsrId: string, reason: string): DsrRequestItem | null {
    const list = this.listDsrs(tenantId);
    const dsr = list.find((d) => d.dsrId === dsrId);
    if (!dsr || dsr.status !== "SOFT_DELETED") return null;

    dsr.status = "RESTORED";
    dsr.notes = reason;

    this.orchestrator.broadcastTaskToTenant(tenantId, {
      taskId: `task_restore_${dsrId}_${Date.now()}`,
      type: "RESTORE_DSR",
      createdAt: new Date().toISOString(),
      data: {
        dsrId: dsr.dsrId,
        principalId: dsr.principalId,
      },
    });

    this.recordAuditLog(tenantId, "DSR_RESTORED", "CUSTOMER", { dsrId, reason });
    return dsr;
  }

  // --- TAMPER-EVIDENT AUDIT LOGS (ISO 27001 A.8.15) ---

  public recordAuditLog(tenantId: string, action: string, actor: string, payload: any): AuditLogEntry {
    const list = this.auditLogs.get(tenantId) || [];
    const timestamp = new Date().toISOString();
    const id = `aud_${randomBytes(6).toString("hex")}`;
    const rawData = `${id}:${tenantId}:${timestamp}:${action}:${actor}:${JSON.stringify(payload)}`;
    const checksum = createHmac("sha256", this.hmacKey).update(rawData).digest("hex");

    const entry: AuditLogEntry = {
      id,
      tenantId,
      timestamp,
      action,
      actor,
      payload,
      checksum,
    };

    list.unshift(entry);
    this.auditLogs.set(tenantId, list);
    return entry;
  }

  public getAuditLogs(tenantId: string = "tenant-default", limit: number = 100): AuditLogEntry[] {
    const list = this.auditLogs.get(tenantId) || [];
    return list.slice(0, limit);
  }
}
