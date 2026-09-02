export const NOTIFICATION_TEMPLATES: Record<string, { subject: string; body: string }> = {
  VIOLATION_CREATED: {
    subject: 'New Violation: {title}',
    body: 'A new {severity} violation "{title}" has been opened and requires attention.',
  },
  VIOLATION_CLOSED: {
    subject: 'Violation Closed: {title}',
    body: 'Violation "{title}" has been closed.',
  },
  REMEDIATION_TASK_ASSIGNED: {
    subject: 'Remediation assigned: {title}',
    body: 'A remediation task was assigned to you (violation {violationId}).',
  },
  REMEDIATION_COMPLETED: {
    subject: 'Remediation completed: {title}',
    body: 'A remediation task was completed. Review the parent violation to validate or close it.',
  },
  EVIDENCE_APPROVED: {
    subject: 'Evidence Approved: {fileName}',
    body: 'Evidence file "{fileName}" has been approved.',
  },
  RIGHTS_REQUEST_SUBMITTED: {
    subject: 'New Rights Request',
    body: 'A new {requestType} request has been submitted.',
  },
  REPORT_GENERATED: {
    subject: 'Report Ready: {title}',
    body: 'Your report "{title}" is ready for download.',
  },
  VALIDATION_FAILED: {
    subject: 'Validation Failed',
    body: 'Validation run found {failCount} failure(s). Review needed.',
  },
  SLA_WARNING: {
    subject: 'SLA Warning',
    body: 'Item "{title}" is approaching its due date.',
  },
};

export function renderTemplate(type: string, vars: Record<string, string | number>): { subject: string; body: string } {
  const template = NOTIFICATION_TEMPLATES[type] || { subject: 'Notification', body: 'You have a new notification.' };
  
  let subject = template.subject;
  let body = template.body;

  for (const [key, value] of Object.entries(vars)) {
    const placeholder = `{${key}}`;
    subject = subject.replaceAll(placeholder, String(value));
    body = body.replaceAll(placeholder, String(value));
  }

  return { subject, body };
}
