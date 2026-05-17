import prisma from '@/lib/prisma'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthConfig {
  criticalBlockerMin: number
  highRiskMin: number
  spiMinElapsedPct: number
  criticalSpiThreshold: number
  atRiskSpiThreshold: number
  overdueTaskPctThreshold: number
  onTrackSpiMin: number
}

export type HealthCategory = 'CRITICO' | 'EN_RIESGO' | 'A_TIEMPO' | 'SIN_ALERTAS'

export interface ProjectHealthInput {
  startDate: Date
  estimatedEndDate: Date
  totalWorkItems: number
  completedWorkItems: number
  overdueWorkItems: number
  criticalBlockers: number
  highRisks: number
}

export interface ProjectHealthResult {
  category: HealthCategory
  spi: number | null
  timeElapsedPct: number
  completionRate: number
  scheduleVariance: number | null
}

// ─── Default config values (mirrors Prisma model defaults) ────────────────────

const DEFAULT_CONFIG: HealthConfig = {
  criticalBlockerMin: 1,
  highRiskMin: 1,
  spiMinElapsedPct: 15.0,
  criticalSpiThreshold: 0.50,
  atRiskSpiThreshold: 0.80,
  overdueTaskPctThreshold: 25.0,
  onTrackSpiMin: 0.90,
}

// ─── Service ──────────────────────────────────────────────────────────────────

class HealthConfigService {
  /**
   * Get the health config for an org, creating it with defaults if not found.
   * Result is lightweight (single row lookup) — no need to cache separately.
   */
  async getConfig(organizationId: string): Promise<HealthConfig> {
    let row = await prisma.projectHealthConfig.findUnique({
      where: { organizationId },
    })

    if (!row) {
      row = await prisma.projectHealthConfig.create({
        data: { organizationId },
      })
    }

    return {
      criticalBlockerMin: row.criticalBlockerMin,
      highRiskMin: row.highRiskMin,
      spiMinElapsedPct: row.spiMinElapsedPct,
      criticalSpiThreshold: row.criticalSpiThreshold,
      atRiskSpiThreshold: row.atRiskSpiThreshold,
      overdueTaskPctThreshold: row.overdueTaskPctThreshold,
      onTrackSpiMin: row.onTrackSpiMin,
    }
  }

  async updateConfig(organizationId: string, updates: Partial<HealthConfig>): Promise<HealthConfig> {
    const row = await prisma.projectHealthConfig.upsert({
      where: { organizationId },
      create: { organizationId, ...updates },
      update: updates,
    })

    return {
      criticalBlockerMin: row.criticalBlockerMin,
      highRiskMin: row.highRiskMin,
      spiMinElapsedPct: row.spiMinElapsedPct,
      criticalSpiThreshold: row.criticalSpiThreshold,
      atRiskSpiThreshold: row.atRiskSpiThreshold,
      overdueTaskPctThreshold: row.overdueTaskPctThreshold,
      onTrackSpiMin: row.onTrackSpiMin,
    }
  }

  /**
   * Classify a single project's health category using the org's config.
   *
   * Category precedence (evaluated in order):
   *   1. CRÍTICO  — critical blocker threshold met, OR SPI critically low
   *   2. EN RIESGO — high risk threshold met, OR SPI at-risk, OR overdue task % too high
   *   3. A TIEMPO  — SPI >= onTrackSpiMin (or completion >= 70% when no timeline data)
   *   4. SIN ALERTAS — everything else
   */
  classifyProject(input: ProjectHealthInput, config: HealthConfig): ProjectHealthResult {
    const {
      startDate, estimatedEndDate,
      totalWorkItems, completedWorkItems, overdueWorkItems,
      criticalBlockers, highRisks,
    } = input

    const now = new Date()

    // ── Compute timeline metrics ───────────────────────────────────────────
    const totalMs = estimatedEndDate.getTime() - startDate.getTime()
    const elapsedMs = now.getTime() - startDate.getTime()

    const timeElapsedPct = totalMs > 0
      ? Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100))
      : 0

    const completionRate = totalWorkItems > 0
      ? (completedWorkItems / totalWorkItems) * 100
      : 0

    // SPI = completionRate / timeElapsedPct (only meaningful once project has elapsed enough)
    const spiApplicable = timeElapsedPct >= config.spiMinElapsedPct
    const spi = spiApplicable && timeElapsedPct > 0
      ? completionRate / timeElapsedPct
      : null

    const scheduleVariance = spi !== null ? completionRate - timeElapsedPct : null

    const overdueTaskPct = totalWorkItems > 0
      ? (overdueWorkItems / totalWorkItems) * 100
      : 0

    // ── 1. CRÍTICO ─────────────────────────────────────────────────────────
    const isCritico =
      criticalBlockers >= config.criticalBlockerMin ||
      (spi !== null && spi < config.criticalSpiThreshold)

    if (isCritico) {
      return { category: 'CRITICO', spi, timeElapsedPct, completionRate, scheduleVariance }
    }

    // ── 2. EN RIESGO ───────────────────────────────────────────────────────
    const isEnRiesgo =
      highRisks >= config.highRiskMin ||
      (spi !== null && spi < config.atRiskSpiThreshold) ||
      overdueTaskPct >= config.overdueTaskPctThreshold

    if (isEnRiesgo) {
      return { category: 'EN_RIESGO', spi, timeElapsedPct, completionRate, scheduleVariance }
    }

    // ── 3. A TIEMPO ────────────────────────────────────────────────────────
    // If SPI is available, use it; otherwise fall back to absolute completion threshold
    const isATiempo = spi !== null
      ? spi >= config.onTrackSpiMin
      : completionRate >= 70

    if (isATiempo) {
      return { category: 'A_TIEMPO', spi, timeElapsedPct, completionRate, scheduleVariance }
    }

    // ── 4. SIN ALERTAS ─────────────────────────────────────────────────────
    return { category: 'SIN_ALERTAS', spi, timeElapsedPct, completionRate, scheduleVariance }
  }
}

export const healthConfigService = new HealthConfigService()
