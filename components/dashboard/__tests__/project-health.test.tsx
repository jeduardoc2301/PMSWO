import { render, screen } from '@testing-library/react'
import { ProjectHealthVisualization } from '../project-health'
import { ProjectHealth, ProjectHealthStatus, HealthFactorImpact } from '@/types'

describe('ProjectHealthVisualization', () => {
  it('should display healthy status with green color coding', () => {
    const health: ProjectHealth = {
      status: ProjectHealthStatus.HEALTHY,
      score: 85,
      factors: [
        {
          name: 'Completion Rate',
          impact: HealthFactorImpact.POSITIVE,
          description: 'High completion rate: 85% of work items completed',
        },
        {
          name: 'No Blockers',
          impact: HealthFactorImpact.POSITIVE,
          description: 'No active blockers',
        },
      ],
    }

    render(<ProjectHealthVisualization health={health} />)

    // Check score is displayed
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.getByText('/ 100')).toBeInTheDocument()

    // Check status badge
    expect(screen.getByText('HEALTHY')).toBeInTheDocument()

    // Check factors are displayed
    expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    expect(screen.getByText('High completion rate: 85% of work items completed')).toBeInTheDocument()
    expect(screen.getByText('No Blockers')).toBeInTheDocument()
    expect(screen.getByText('No active blockers')).toBeInTheDocument()
  })

  it('should display at-risk status with yellow color coding', () => {
    const health: ProjectHealth = {
      status: ProjectHealthStatus.AT_RISK,
      score: 55,
      factors: [
        {
          name: 'Completion Rate',
          impact: HealthFactorImpact.NEUTRAL,
          description: 'Moderate completion rate: 55% of work items completed',
        },
        {
          name: 'Active Blockers',
          impact: HealthFactorImpact.NEGATIVE,
          description: '2 active blocker(s) (non-critical)',
        },
      ],
    }

    render(<ProjectHealthVisualization health={health} />)

    // Check score is displayed
    expect(screen.getByText('55')).toBeInTheDocument()

    // Check status badge
    expect(screen.getByText('AT_RISK')).toBeInTheDocument()

    // Check factors are displayed
    expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    expect(screen.getByText('Active Blockers')).toBeInTheDocument()
    expect(screen.getByText('2 active blocker(s) (non-critical)')).toBeInTheDocument()
  })

  it('should display critical status with red color coding', () => {
    const health: ProjectHealth = {
      status: ProjectHealthStatus.CRITICAL,
      score: 25,
      factors: [
        {
          name: 'Completion Rate',
          impact: HealthFactorImpact.NEGATIVE,
          description: 'Low completion rate: 25% of work items completed',
        },
        {
          name: 'Critical Blockers',
          impact: HealthFactorImpact.NEGATIVE,
          description: '3 critical blocker(s) affecting progress',
        },
        {
          name: 'Overdue Work Items',
          impact: HealthFactorImpact.NEGATIVE,
          description: '5 work item(s) overdue (50% of total)',
        },
      ],
    }

    render(<ProjectHealthVisualization health={health} />)

    // Check score is displayed
    expect(screen.getByText('25')).toBeInTheDocument()

    // Check status badge
    expect(screen.getByText('CRITICAL')).toBeInTheDocument()

    // Check all negative factors are displayed
    expect(screen.getByText('Completion Rate')).toBeInTheDocument()
    expect(screen.getByText('Critical Blockers')).toBeInTheDocument()
    expect(screen.getByText('3 critical blocker(s) affecting progress')).toBeInTheDocument()
    expect(screen.getByText('Overdue Work Items')).toBeInTheDocument()
    expect(screen.getByText('5 work item(s) overdue (50% of total)')).toBeInTheDocument()
  })

  it('should display health factors with correct impact indicators', () => {
    const health: ProjectHealth = {
      status: ProjectHealthStatus.HEALTHY,
      score: 75,
      factors: [
        {
          name: 'Positive Factor',
          impact: HealthFactorImpact.POSITIVE,
          description: 'This is good',
        },
        {
          name: 'Negative Factor',
          impact: HealthFactorImpact.NEGATIVE,
          description: 'This needs attention',
        },
        {
          name: 'Neutral Factor',
          impact: HealthFactorImpact.NEUTRAL,
          description: 'This is neutral',
        },
      ],
    }

    render(<ProjectHealthVisualization health={health} />)

    // Check all factors are displayed
    expect(screen.getByText('Positive Factor')).toBeInTheDocument()
    expect(screen.getByText('This is good')).toBeInTheDocument()
    expect(screen.getByText('Negative Factor')).toBeInTheDocument()
    expect(screen.getByText('This needs attention')).toBeInTheDocument()
    expect(screen.getByText('Neutral Factor')).toBeInTheDocument()
    expect(screen.getByText('This is neutral')).toBeInTheDocument()
  })

  it('should display health score legend', () => {
    const health: ProjectHealth = {
      status: ProjectHealthStatus.HEALTHY,
      score: 80,
      factors: [],
    }

    render(<ProjectHealthVisualization health={health} />)

    // Check legend is displayed
    expect(screen.getByText('Health Score Ranges:')).toBeInTheDocument()
    expect(screen.getByText('Healthy (70-100)')).toBeInTheDocument()
    expect(screen.getByText('At Risk (40-69)')).toBeInTheDocument()
    expect(screen.getByText(/Critical \(<40\)/)).toBeInTheDocument()
  })

  it('should handle empty factors array', () => {
    const health: ProjectHealth = {
      status: ProjectHealthStatus.HEALTHY,
      score: 100,
      factors: [],
    }

    render(<ProjectHealthVisualization health={health} />)

    // Check score is displayed
    expect(screen.getByText('100')).toBeInTheDocument()
    expect(screen.getByText('HEALTHY')).toBeInTheDocument()

    // Check Health Factors section header is still displayed
    expect(screen.getByText('Health Factors')).toBeInTheDocument()
  })

  it('should display multiple factors of the same impact type', () => {
    const health: ProjectHealth = {
      status: ProjectHealthStatus.CRITICAL,
      score: 30,
      factors: [
        {
          name: 'Critical Blockers',
          impact: HealthFactorImpact.NEGATIVE,
          description: '2 critical blocker(s) affecting progress',
        },
        {
          name: 'High Risks',
          impact: HealthFactorImpact.NEGATIVE,
          description: '3 high-level risk(s) identified',
        },
        {
          name: 'Overdue Work Items',
          impact: HealthFactorImpact.NEGATIVE,
          description: '4 work item(s) overdue (40% of total)',
        },
      ],
    }

    render(<ProjectHealthVisualization health={health} />)

    // Check all negative factors are displayed
    expect(screen.getByText('Critical Blockers')).toBeInTheDocument()
    expect(screen.getByText('High Risks')).toBeInTheDocument()
    expect(screen.getByText('Overdue Work Items')).toBeInTheDocument()
  })
})
