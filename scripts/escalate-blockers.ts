#!/usr/bin/env ts-node

/**
 * Blocker Severity Escalation Job
 * 
 * This script checks all active blockers across all organizations
 * and escalates their severity to CRITICAL if they exceed the
 * organization's configured threshold (blockerEscalationThresholdHours).
 * 
 * This script should be run periodically (e.g., via cron) to ensure
 * timely escalation of long-running blockers.
 * 
 * Usage:
 *   ts-node scripts/escalate-blockers.ts
 * 
 * Or with cron (example: run every hour):
 *   0 * * * * cd /path/to/project && ts-node scripts/escalate-blockers.ts >> /var/log/blocker-escalation.log 2>&1
 * 
 * Requirement: 5.5
 */

import prisma from '@/lib/prisma'
import { blockerService } from '@/services/blocker.service'

async function main() {
  console.log(`[${new Date().toISOString()}] Starting blocker severity escalation job...`)

  try {
    // Get all organizations
    const organizations = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
      },
    })

    console.log(`Found ${organizations.length} organization(s) to process`)

    let totalEscalated = 0

    // Process each organization
    for (const org of organizations) {
      console.log(`Processing organization: ${org.name} (${org.id})`)

      try {
        const result = await blockerService.escalateBlockerSeverity(org.id)

        if (result.escalatedCount > 0) {
          console.log(`  ✓ Escalated ${result.escalatedCount} blocker(s) to CRITICAL`)
          console.log(`    Blocker IDs: ${result.escalatedBlockers.join(', ')}`)
          totalEscalated += result.escalatedCount
        } else {
          console.log(`  ✓ No blockers to escalate`)
        }
      } catch (error) {
        console.error(`  ✗ Error processing organization ${org.name}:`, error)
      }
    }

    console.log(`\n[${new Date().toISOString()}] Job completed successfully`)
    console.log(`Total blockers escalated: ${totalEscalated}`)
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Job failed:`, error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the job
main()
  .catch((error) => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
