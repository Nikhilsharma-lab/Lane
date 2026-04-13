import { describe, it, expect } from 'vitest'
import {
  getPhaseLabel,
  getStageLabel,
  getActiveStageLabel,
  nextPredesignStage,
  nextDesignStage,
  isPredesign,
  isDesign,
  isDev,
  isTrack,
  PREDESIGN_STAGES,
  DESIGN_STAGES,
} from '@/lib/workflow'

describe('getPhaseLabel', () => {
  it('returns correct label for each phase', () => {
    expect(getPhaseLabel('predesign')).toBe('Predesign')
    expect(getPhaseLabel('design')).toBe('Design')
    expect(getPhaseLabel('dev')).toBe('Dev')
    expect(getPhaseLabel('track')).toBe('Track & Impact')
  })
})

describe('getStageLabel', () => {
  it('returns human-readable labels for all design stages', () => {
    expect(getStageLabel('sense')).toBe('Sense')
    expect(getStageLabel('frame')).toBe('Frame')
    expect(getStageLabel('diverge')).toBe('Diverge')
    expect(getStageLabel('converge')).toBe('Converge')
    expect(getStageLabel('prove')).toBe('Prove')
  })

  it('returns human-readable labels for predesign stages', () => {
    expect(getStageLabel('intake')).toBe('Intake')
    expect(getStageLabel('context')).toBe('Context')
    expect(getStageLabel('shape')).toBe('Shape')
    expect(getStageLabel('bet')).toBe('Prioritize')
  })

  it('returns stage value itself for unknown stages', () => {
    expect(getStageLabel('unknown-stage')).toBe('unknown-stage')
  })

  it('returns "Unknown" for null/undefined', () => {
    expect(getStageLabel(null)).toBe('Unknown')
    expect(getStageLabel(undefined)).toBe('Unknown')
  })
})

describe('nextPredesignStage', () => {
  it('advances through predesign stages in order', () => {
    expect(nextPredesignStage('intake')).toBe('context')
    expect(nextPredesignStage('context')).toBe('shape')
    expect(nextPredesignStage('shape')).toBe('bet')
  })

  it('returns null at the last predesign stage', () => {
    expect(nextPredesignStage('bet')).toBeNull()
  })
})

describe('nextDesignStage', () => {
  it('advances through design stages in order', () => {
    expect(nextDesignStage('sense')).toBe('frame')
    expect(nextDesignStage('frame')).toBe('diverge')
    expect(nextDesignStage('diverge')).toBe('converge')
    expect(nextDesignStage('converge')).toBe('prove')
  })

  it('returns null at prove (ready for dev handoff)', () => {
    expect(nextDesignStage('prove')).toBeNull()
  })
})

describe('phase detection helpers', () => {
  it('isPredesign uses phase when available', () => {
    expect(isPredesign({ phase: 'predesign', stage: 'intake' })).toBe(true)
    expect(isPredesign({ phase: 'design', stage: 'intake' })).toBe(false)
  })

  it('isPredesign falls back to legacy stage when no phase', () => {
    const nullPhase = null as unknown as 'predesign'
    expect(isPredesign({ phase: nullPhase, stage: 'intake' })).toBe(true)
    expect(isPredesign({ phase: nullPhase, stage: 'explore' })).toBe(false)
  })

  it('isDesign uses phase when available', () => {
    expect(isDesign({ phase: 'design', stage: 'intake' })).toBe(true)
    expect(isDesign({ phase: 'predesign', stage: 'intake' })).toBe(false)
  })

  it('isDev returns true for dev phase', () => {
    expect(isDev({ phase: 'dev', stage: 'build' })).toBe(true)
    expect(isDev({ phase: 'design', stage: 'build' })).toBe(false)
  })

  it('isTrack returns true for track phase', () => {
    expect(isTrack({ phase: 'track', stage: 'impact' })).toBe(true)
    expect(isTrack({ phase: 'dev', stage: 'impact' })).toBe(false)
  })
})

describe('getActiveStageLabel', () => {
  it('returns predesign sub-stage label', () => {
    const req = { phase: 'predesign' as const, stage: 'intake' as const, predesignStage: 'shape' as const, designStage: null, kanbanState: null, trackStage: null }
    expect(getActiveStageLabel(req)).toBe('Shape')
  })

  it('defaults to intake when predesignStage is null', () => {
    const req = { phase: 'predesign' as const, stage: 'intake' as const, predesignStage: null, designStage: null, kanbanState: null, trackStage: null }
    expect(getActiveStageLabel(req)).toBe('Intake')
  })

  it('returns design sub-stage label', () => {
    const req = { phase: 'design' as const, stage: 'intake' as const, predesignStage: null, designStage: 'diverge' as const, kanbanState: null, trackStage: null }
    expect(getActiveStageLabel(req)).toBe('Diverge')
  })
})
