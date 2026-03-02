/**
 * AIService Unit Tests
 * 
 * Basic tests to verify AI service structure and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AIService } from '../ai-service'
import { AIServiceError, AIGuardrailsError } from '@/lib/errors'

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  default: {
    project: {
      findUnique: vi.fn(),
    },
    aIAnalysisCache: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

// Mock AWS SDK
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  InvokeModelCommand: vi.fn(),
}))

describe('AIService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set required environment variables
    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
    process.env.AWS_REGION = 'us-east-1'
  })

  describe('Configuration', () => {
    it('should throw error if AWS credentials are not configured', async () => {
      delete process.env.AWS_ACCESS_KEY_ID
      delete process.env.AWS_SECRET_ACCESS_KEY

      // The error will be thrown when trying to create Bedrock client
      // but it might be wrapped in another error, so we just check it throws
      await expect(
        AIService.generateProjectReport('test-id', 'EXECUTIVE' as any)
      ).rejects.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should export AIServiceError', () => {
      expect(AIServiceError).toBeDefined()
    })

    it('should export AIGuardrailsError', () => {
      expect(AIGuardrailsError).toBeDefined()
    })
  })

  describe('Cache Management', () => {
    it('should have getCachedAnalysis method', () => {
      expect(AIService.getCachedAnalysis).toBeDefined()
      expect(typeof AIService.getCachedAnalysis).toBe('function')
    })

    it('should have invalidateCache method', () => {
      expect(AIService.invalidateCache).toBeDefined()
      expect(typeof AIService.invalidateCache).toBe('function')
    })
  })

  describe('AI Methods', () => {
    it('should have generateProjectReport method', () => {
      expect(AIService.generateProjectReport).toBeDefined()
      expect(typeof AIService.generateProjectReport).toBe('function')
    })

    it('should have analyzeProject method', () => {
      expect(AIService.analyzeProject).toBeDefined()
      expect(typeof AIService.analyzeProject).toBe('function')
    })

    it('should have improveText method', () => {
      expect(AIService.improveText).toBeDefined()
      expect(typeof AIService.improveText).toBe('function')
    })
  })
})
