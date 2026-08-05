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

export interface RightsRequestMetrics {
  total: number;
  open: number;
  closed: number;
  avgResolutionDays: number | null;
  byType: Record<string, number>;
}

export interface ConsentMetrics {
  totalRecords: number;
  granted: number;
  withdrawn: number;
}

export interface DashboardOverview {
  complianceScore: ComplianceScoreResult;
  violations: ViolationBreakdown;
  evidence: EvidenceCoverage;
  rightsRequests: RightsRequestMetrics;
  consent: ConsentMetrics;
}
