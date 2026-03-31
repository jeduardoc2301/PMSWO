import { describe, it, expect } from 'vitest'
import esMessages from '@/messages/es.json'
import ptMessages from '@/messages/pt.json'
import esTemplates from '@/messages/es/templates.json'
import ptTemplates from '@/messages/pt/templates.json'

describe('Translation Files', () => {
  it('should have Spanish translations', () => {
    expect(esMessages).toBeDefined()
    expect(esMessages.common).toBeDefined()
    expect(esMessages.common.appName).toBe('Gestión de Proyectos Ejecutiva')
    expect(esMessages.nav).toBeDefined()
    expect(esMessages.auth).toBeDefined()
  })

  it('should have Portuguese translations', () => {
    expect(ptMessages).toBeDefined()
    expect(ptMessages.common).toBeDefined()
    expect(ptMessages.common.appName).toBe('Gestão de Projetos Executiva')
    expect(ptMessages.nav).toBeDefined()
    expect(ptMessages.auth).toBeDefined()
  })

  it('should have matching keys in both languages', () => {
    const esKeys = Object.keys(esMessages)
    const ptKeys = Object.keys(ptMessages)
    
    expect(esKeys).toEqual(ptKeys)
    
    // Check nested keys
    expect(Object.keys(esMessages.common)).toEqual(Object.keys(ptMessages.common))
    expect(Object.keys(esMessages.nav)).toEqual(Object.keys(ptMessages.nav))
    expect(Object.keys(esMessages.auth)).toEqual(Object.keys(ptMessages.auth))
  })

  it('should have templates namespace in Spanish', () => {
    expect(esTemplates).toBeDefined()
    expect(esTemplates.title).toBe('Plantillas')
    expect(esTemplates.createTemplate).toBeDefined()
    expect(esTemplates.validation).toBeDefined()
    expect(esTemplates.errors).toBeDefined()
    expect(esTemplates.success).toBeDefined()
  })

  it('should have templates namespace in Portuguese', () => {
    expect(ptTemplates).toBeDefined()
    expect(ptTemplates.title).toBe('Modelos')
    expect(ptTemplates.createTemplate).toBeDefined()
    expect(ptTemplates.validation).toBeDefined()
    expect(ptTemplates.errors).toBeDefined()
    expect(ptTemplates.success).toBeDefined()
  })

  it('should have matching keys in templates namespace', () => {
    const esKeys = Object.keys(esTemplates)
    const ptKeys = Object.keys(ptTemplates)
    
    expect(esKeys.sort()).toEqual(ptKeys.sort())
  })
})
