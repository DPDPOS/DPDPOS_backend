import { randomBytes, createHmac } from "node:crypto";

export interface AgentRecord {
  agentId: string;
  tenantId: string;
  agentName: string;
  version: string;
  environment: string;
  targetType: string;
  targetUriMasked: string;
  status: string;
  lastHeartbeat: string;
  lastDdlChecksum?: string;
  memoryMb: number;
  enrolledAt: string;
}

export interface TableColumnMetadata {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  detectedPii?: {
    piiType: string;
    confidence: number;
    sampleCount: number;
    matchCount: number;
    sampleMasked?: string;
  };
  manualOverridePii?: string;
  purposeTags?: string[];
}

export interface TableMetadata {
  tableName: string;
  rowCountEstimated: number;
  ddlChecksum: string;
  columns: TableColumnMetadata[];
}

export interface DiscoveryReportPayload {
  agentId: string;
  tenantId: string;
  targetId: string;
  targetType: string;
  targetUriMasked: string;
  timestamp: string;
  tables: TableMetadata[];
  overallDdlChecksum: string;
}

export interface AgentTask {
  taskId: string;
  type: string;
  createdAt: string;
  data: any;
}

export interface DsrReceiptPayload {
  taskId: string;
  dsrId: string;
  agentId: string;
  status: string;
  recordsAffected: number;
  completedAt: string;
  executionSignature: string;
  errorMessage?: string;
}

export class AgentOrchestrationService {
  private static instance: AgentOrchestrationService;
  private agents: Map<string, AgentRecord> = new Map();
  private discoveryReports: Map<string, DiscoveryReportPayload> = new Map();
  private taskQueues: Map<string, AgentTask[]> = new Map();
  private secretKey: string = process.env.CP_SECRET_KEY || "dpdp-control-plane-master-secret-2026";

  public static getInstance(): AgentOrchestrationService {
    if (!AgentOrchestrationService.instance) {
      AgentOrchestrationService.instance = new AgentOrchestrationService();
    }
    return AgentOrchestrationService.instance;
  }

  enroll(payload: {
    agentId: string;
    agentName: string;
    version: string;
    environment: string;
    targetType: string;
    targetUriMasked: string;
    tenantId?: string;
  }): { success: boolean; agentToken: string; heartbeatIntervalSec: number; tenantId: string } {
    const tenantId = payload.tenantId || "tenant-default";
    const now = new Date().toISOString();
    const tokenPayload = `${payload.agentId}:${tenantId}:${Date.now()}`;
    const agentToken = createHmac("sha256", this.secretKey).update(tokenPayload).digest("hex");

    const record: AgentRecord = {
      agentId: payload.agentId,
      tenantId,
      agentName: payload.agentName,
      version: payload.version,
      environment: payload.environment,
      targetType: payload.targetType,
      targetUriMasked: payload.targetUriMasked,
      status: "ACTIVE",
      lastHeartbeat: now,
      memoryMb: 0,
      enrolledAt: now,
    };

    this.agents.set(payload.agentId, record);

    return {
      success: true,
      agentToken,
      heartbeatIntervalSec: 5,
      tenantId,
    };
  }

  processHeartbeat(payload: {
    agentId: string;
    tenantId?: string;
    status: string;
    ddlChecksum?: string;
    timestamp: string;
    memoryUsageMb?: number;
  }): { acknowledged: boolean; pendingTasks: AgentTask[]; serverTime: string } {
    const existing = this.agents.get(payload.agentId);
    const now = new Date().toISOString();

    if (existing) {
      existing.status = payload.status;
      existing.lastHeartbeat = now;
      existing.lastDdlChecksum = payload.ddlChecksum;
      existing.memoryMb = payload.memoryUsageMb || 0;
    } else {
      this.agents.set(payload.agentId, {
        agentId: payload.agentId,
        tenantId: payload.tenantId || "tenant-default",
        agentName: `Zone Agent (${payload.agentId})`,
        version: "1.0.0",
        environment: "production",
        targetType: "POSTGRES",
        targetUriMasked: "db-internal",
        status: payload.status,
        lastHeartbeat: now,
        lastDdlChecksum: payload.ddlChecksum,
        memoryMb: payload.memoryUsageMb || 0,
        enrolledAt: now,
      });
    }

    const queue = this.taskQueues.get(payload.agentId) || [];
    this.taskQueues.set(payload.agentId, []);

    return {
      acknowledged: true,
      pendingTasks: queue,
      serverTime: now,
    };
  }

  ingestDiscovery(report: DiscoveryReportPayload): void {
    this.discoveryReports.set(report.agentId, report);
  }

  queueTask(agentId: string, task: AgentTask): void {
    const queue = this.taskQueues.get(agentId) || [];
    queue.push(task);
    this.taskQueues.set(agentId, queue);
  }

  broadcastTaskToTenant(tenantId: string, task: AgentTask): void {
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.tenantId === tenantId) {
        this.queueTask(agentId, task);
      }
    }
  }

  listAgents(tenantId?: string): AgentRecord[] {
    const list = Array.from(this.agents.values());
    if (tenantId) {
      return list.filter((a) => a.tenantId === tenantId);
    }
    return list;
  }

  getDiscoveryReports(tenantId?: string): DiscoveryReportPayload[] {
    const list = Array.from(this.discoveryReports.values());
    if (tenantId) {
      return list.filter((r) => r.tenantId === tenantId);
    }
    return list;
  }

  getDataMap(tenantId: string = "tenant-default") {
    const reports = this.getDiscoveryReports(tenantId);
    const targets = reports.map((rep) => {
      let totalPiiCount = 0;
      for (const table of rep.tables) {
        for (const col of table.columns) {
          if (col.detectedPii && col.detectedPii.piiType !== "UNKNOWN") {
            totalPiiCount++;
          }
        }
      }

      return {
        targetId: rep.targetId,
        agentId: rep.agentId,
        targetType: rep.targetType,
        targetUriMasked: rep.targetUriMasked,
        tableCount: rep.tables.length,
        totalPiiCount,
        tables: rep.tables,
      };
    });

    return { targets };
  }

  overrideColumn(
    tenantId: string,
    tableName: string,
    columnName: string,
    action: { purposeTags?: string[]; piiType?: string; isMasked?: boolean }
  ): void {
    const reports = this.getDiscoveryReports(tenantId);
    for (const rep of reports) {
      for (const table of rep.tables) {
        if (table.tableName === tableName) {
          const col = table.columns.find((c) => c.name === columnName);
          if (col) {
            if (action.purposeTags) col.purposeTags = action.purposeTags;
            if (action.piiType) {
              col.manualOverridePii = action.piiType;
              if (col.detectedPii) col.detectedPii.piiType = action.piiType;
            }
            if (action.isMasked && col.detectedPii) {
              col.detectedPii.sampleMasked = "XXXX-XXXX-XXXX";
              if (!col.purposeTags) col.purposeTags = [];
              if (!col.purposeTags.includes("masked")) col.purposeTags.push("masked");
            }
          }
        }
      }
    }
  }

  generateEnrollmentScript(tenantId: string, dbType: string, controlPlaneUrl: string): string {
    const token = `dpdp_live_tok_${randomBytes(8).toString("hex")}`;
    return `docker run -d --name dpdp-zone-agent \\
  --restart unless-stopped \\
  -e CONTROL_PLANE_URL="${controlPlaneUrl}" \\
  -e TENANT_ID="${tenantId}" \\
  -e AGENT_ENROLLMENT_TOKEN="${token}" \\
  -e DATABASE_URL="${dbType}://app_user:YourSecurePass@<DB_HOST>:5432/<DATABASE_NAME>" \\
  dpdp/zone-agent:latest`;
  }
}
