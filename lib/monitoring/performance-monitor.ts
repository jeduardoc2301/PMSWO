/**
 * Performance Monitoring Service
 * 
 * Tracks API response times, Bedrock calls, cache hit rates, and database queries.
 * Sends custom metrics to CloudWatch in production.
 * 
 * Requirements: 17.1
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch'
import { logInfo, logWarning } from '@/lib/logger'

export class PerformanceMonitor {
  private static cloudWatchClient: CloudWatchClient | null = null
  private static namespace: string = process.env.CLOUDWATCH_NAMESPACE || 'PMSaaS/Production'
  private static enabled: boolean = process.env.CLOUDWATCH_ENABLED === 'true'

  /**
   * Initialize CloudWatch client (lazy initialization)
   */
  private static getCloudWatchClient(): CloudWatchClient | null {
    if (!this.enabled) {
      return null
    }

    if (!this.cloudWatchClient && process.env.AWS_REGION) {
      try {
        this.cloudWatchClient = new CloudWatchClient({
          region: process.env.AWS_REGION,
        })
      } catch (error) {
        logWarning('Failed to initialize CloudWatch client', { error })
        return null
      }
    }

    return this.cloudWatchClient
  }

  /**
   * Send metric to CloudWatch
   */
  private static async sendMetric(
    metricName: string,
    value: number,
    unit: StandardUnit,
    dimensions?: Array<{ Name: string; Value: string }>
  ): Promise<void> {
    const client = this.getCloudWatchClient()
    
    if (!client) {
      // In development or when CloudWatch is disabled, just log
      logInfo(`[Metric] ${metricName}: ${value} ${unit}`, { dimensions })
      return
    }

    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: dimensions,
          },
        ],
      })

      await client.send(command)
    } catch (error) {
      logWarning('Failed to send metric to CloudWatch', {
        metricName,
        value,
        error,
      })
    }
  }

  /**
   * Track API response time
   */
  static async trackAPIResponse(
    endpoint: string,
    method: string,
    duration: number,
    statusCode: number
  ): Promise<void> {
    // Send response time metric
    await this.sendMetric(
      'APIResponseTime',
      duration,
      StandardUnit.Milliseconds,
      [
        { Name: 'Endpoint', Value: endpoint },
        { Name: 'Method', Value: method },
        { Name: 'StatusCode', Value: statusCode.toString() },
      ]
    )

    // Track error rate
    if (statusCode >= 400) {
      await this.sendMetric(
        'APIErrorRate',
        1,
        StandardUnit.Count,
        [
          { Name: 'Endpoint', Value: endpoint },
          { Name: 'Method', Value: method },
          { Name: 'StatusCode', Value: statusCode.toString() },
        ]
      )
    }

    // Log slow requests (> 2 seconds)
    if (duration > 2000) {
      logWarning('[Performance] Slow API request detected', {
        endpoint,
        method,
        duration: `${duration}ms`,
        statusCode,
      })
    }
  }

  /**
   * Track AWS Bedrock call
   */
  static async trackBedrockCall(
    duration: number,
    modelId: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<void> {
    // Track call duration
    await this.sendMetric(
      'BedrockCallDuration',
      duration,
      StandardUnit.Milliseconds,
      [{ Name: 'ModelId', Value: modelId }]
    )

    // Track token usage
    await this.sendMetric(
      'BedrockInputTokens',
      inputTokens,
      StandardUnit.Count,
      [{ Name: 'ModelId', Value: modelId }]
    )

    await this.sendMetric(
      'BedrockOutputTokens',
      outputTokens,
      StandardUnit.Count,
      [{ Name: 'ModelId', Value: modelId }]
    )

    // Estimate cost (approximate pricing for Claude 3 Sonnet)
    // Input: $0.003 per 1K tokens, Output: $0.015 per 1K tokens
    const estimatedCost = (inputTokens / 1000) * 0.003 + (outputTokens / 1000) * 0.015

    await this.sendMetric(
      'BedrockEstimatedCost',
      estimatedCost,
      StandardUnit.None,
      [{ Name: 'ModelId', Value: modelId }]
    )

    logInfo('[Performance] Bedrock call tracked', {
      modelId,
      duration: `${duration}ms`,
      inputTokens,
      outputTokens,
      estimatedCost: `$${estimatedCost.toFixed(4)}`,
    })
  }

  /**
   * Track cache hit/miss
   */
  static async trackCacheHit(cacheType: string, hit: boolean): Promise<void> {
    await this.sendMetric(
      hit ? 'CacheHit' : 'CacheMiss',
      1,
      StandardUnit.Count,
      [{ Name: 'CacheType', Value: cacheType }]
    )

    // Calculate and send cache hit rate (this would need aggregation in CloudWatch)
    logInfo(`[Performance] Cache ${hit ? 'hit' : 'miss'}`, { cacheType })
  }

  /**
   * Track database query performance
   */
  static async trackDatabaseQuery(
    model: string,
    action: string,
    duration: number
  ): Promise<void> {
    await this.sendMetric(
      'DatabaseQueryDuration',
      duration,
      StandardUnit.Milliseconds,
      [
        { Name: 'Model', Value: model },
        { Name: 'Action', Value: action },
      ]
    )

    // Log slow queries (> 1 second)
    if (duration > 1000) {
      logWarning('[Performance] Slow database query detected', {
        model,
        action,
        duration: `${duration}ms`,
      })
    }
  }
}
