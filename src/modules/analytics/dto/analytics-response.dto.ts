export interface ComplianceScoreResult {
  score: number;
  totalRules: number;
  passed: number;
  failed: number;
  trend?: { date: string; score: number }[];
}

export interface ViolationBreakdown {
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}

export interface EvidenceCoverage {
  totalControls: number;
  controlsWithEvidence: number;
  coveragePercent: number;
}

export interface RoadmapProgress {
  overallProgressPercent: number;
  overdueCount: number;
  openViolationCount: number;
  byPhase: Record<string, { total: number; progressPercent: number }>;
}

export interface RightsRequestMetrics {
  total: number;
  open: number;
  closed: number;
  overdueCount?: number;
  openedThisMonth?: number;
  avgResolutionDays: number | null;
  byType: Record<string, number>;
}

export interface ConsentMetrics {
  totalRecords: number;
  granted: number;
  withdrawn: number;
  grantedThisMonth: number;
  withdrawnThisMonth: number;
  expired: number;
  expiringSoon: number;
}

export interface DashboardOverview {
  complianceScore: ComplianceScoreResult;
  violations: ViolationBreakdown;
  evidence: EvidenceCoverage;
  roadmapProgress?: RoadmapProgress;
  rightsRequests: RightsRequestMetrics;
  consent: ConsentMetrics;
}
