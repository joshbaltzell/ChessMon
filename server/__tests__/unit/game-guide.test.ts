import { describe, it, expect } from 'vitest'
import { getGameGuide, getOnboardingGuide } from '../../src/models/game-guide.js'

describe('Game Guide', () => {
  it('should return a complete guide with all sections', () => {
    const guide = getGameGuide()

    expect(guide.overview).toBeTruthy()
    expect(guide.overview.flow.length).toBeGreaterThan(3)

    expect(guide.attributes.stats).toHaveLength(5)
    expect(guide.attributes.stats.map(s => s.name)).toEqual([
      'Aggression', 'Positional', 'Tactical', 'Endgame', 'Creativity',
    ])
    expect(guide.attributes.tips.length).toBeGreaterThan(0)

    expect(guide.alignments.attack).toHaveLength(3)
    expect(guide.alignments.style).toHaveLength(3)

    expect(guide.training.actions).toHaveLength(3)
    expect(guide.training.actions.find(a => a.name === 'Spar')!.cost).toBe(2)
    expect(guide.training.actions.find(a => a.name === 'Purchase Tactic')!.cost).toBe(3)
    expect(guide.training.actions.find(a => a.name === 'Drill')!.cost).toBe(1)

    expect(guide.levelTests.mechanics.length).toBeGreaterThan(0)
    expect(guide.mlLearning.details.length).toBeGreaterThan(0)
    expect(guide.openingBooks.categories.length).toBe(4)
    expect(guide.cosmetics.tiers).toHaveLength(5)
  })

  it('should return a complete onboarding guide', () => {
    const onboarding = getOnboardingGuide()

    expect(onboarding.steps).toHaveLength(4)
    expect(onboarding.steps[0].step).toBe(1)
    expect(onboarding.steps[1].title).toContain('Attribute')
    expect(onboarding.steps[1].builds.length).toBe(4)

    // Every build should sum to 50
    for (const build of onboarding.steps[1].builds) {
      const { aggression, positional, tactical, endgame, creativity } = build.distribution
      expect(aggression + positional + tactical + endgame + creativity).toBe(50)
    }

    expect(onboarding.steps[2].combos.length).toBeGreaterThan(0)
    expect(onboarding.steps[3].plan.length).toBeGreaterThan(0)
  })
})
