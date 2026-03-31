/**
 * Script to clear AI analysis cache
 * Run with: npx tsx scripts/clear-ai-cache.ts
 */

import prisma from '../lib/prisma'

async function clearAICache() {
  try {
    console.log('Clearing AI analysis cache...')
    
    const result = await prisma.aIAnalysisCache.deleteMany({})
    
    console.log(`✅ Cleared ${result.count} cached analyses`)
    process.exit(0)
  } catch (error) {
    console.error('❌ Error clearing cache:', error)
    process.exit(1)
  }
}

clearAICache()
