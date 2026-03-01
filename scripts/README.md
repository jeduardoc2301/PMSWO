# Background Jobs and Scripts

This directory contains background jobs and utility scripts for the project management platform.

## Blocker Severity Escalation

### Overview

The blocker severity escalation system automatically escalates the severity of long-running blockers to CRITICAL status. This ensures that blockers that have been active for an extended period receive appropriate attention.

### How It Works

1. The system checks all active blockers (where `resolvedAt` is `null`) across all organizations
2. For each blocker, it calculates the duration from `startDate` to the current time
3. If the duration exceeds the organization's configured threshold (`blockerEscalationThresholdHours`), the blocker's severity is escalated to `CRITICAL`
4. Blockers already at `CRITICAL` severity are not processed

### Configuration

Each organization can configure its escalation threshold in the organization settings:

```typescript
{
  blockerEscalationThresholdHours: 48  // Default: 48 hours
}
```

### Running the Escalation Job

#### Manual Execution

```bash
# Using ts-node
ts-node scripts/escalate-blockers.ts

# Using npm script (if configured)
npm run escalate-blockers
```

#### Automated Execution with Cron

To run the escalation job automatically, add it to your crontab:

```bash
# Run every hour
0 * * * * cd /path/to/project && ts-node scripts/escalate-blockers.ts >> /var/log/blocker-escalation.log 2>&1

# Run every 6 hours
0 */6 * * * cd /path/to/project && ts-node scripts/escalate-blockers.ts >> /var/log/blocker-escalation.log 2>&1

# Run daily at 2 AM
0 2 * * * cd /path/to/project && ts-node scripts/escalate-blockers.ts >> /var/log/blocker-escalation.log 2>&1
```

#### Using AWS EventBridge (for production)

For production deployments on AWS, consider using EventBridge to trigger the escalation job:

1. Create a Lambda function that calls the escalation service
2. Set up an EventBridge rule to trigger the Lambda on a schedule
3. Configure appropriate IAM permissions for database access

### Output

The script logs its progress and results:

```
[2025-01-08T09:00:00.000Z] Starting blocker severity escalation job...
Found 3 organization(s) to process
Processing organization: Acme Corp (org-123)
  ✓ Escalated 2 blocker(s) to CRITICAL
    Blocker IDs: blocker-456, blocker-789
Processing organization: Tech Inc (org-456)
  ✓ No blockers to escalate
Processing organization: Consulting LLC (org-789)
  ✓ Escalated 1 blocker(s) to CRITICAL
    Blocker IDs: blocker-101

[2025-01-08T09:00:05.000Z] Job completed successfully
Total blockers escalated: 3
```

### API Usage

You can also call the escalation service programmatically:

```typescript
import { blockerService } from '@/services/blocker.service'

// Escalate blockers for a specific organization
const result = await blockerService.escalateBlockerSeverity('org-id')

console.log(`Escalated ${result.escalatedCount} blockers`)
console.log(`Blocker IDs: ${result.escalatedBlockers.join(', ')}`)
```

### Requirements

This feature implements **Requirement 5.5**: Automatic severity escalation for blockers that exceed the configured duration threshold.

### Testing

Unit tests for the escalation functionality are located in:
- `services/__tests__/blocker-escalation.service.test.ts`

Run tests with:
```bash
npm test services/__tests__/blocker-escalation.service.test.ts
```
