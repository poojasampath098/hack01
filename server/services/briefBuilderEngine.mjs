/**
 * Intelligent Heuristic Brief Builder Engine
 * Converts rough, messy thoughts into production-ready creative briefs without requiring paid AI API keys.
 */

export function structureRoughIdea(rawIdea = '') {
  const idea = String(rawIdea || '').trim()
  if (!idea) {
    throw new Error('A rough idea or project description is required')
  }

  const lower = idea.toLowerCase()

  // 1. Classify Content Type
  let contentType = 'Brand film'
  if (lower.includes('music') || lower.includes('track') || lower.includes('album') || lower.includes('song') || lower.includes('visualizer')) {
    contentType = 'Music visual'
  } else if (lower.includes('social') || lower.includes('reel') || lower.includes('tiktok') || lower.includes('loop') || lower.includes('scroll') || lower.includes('short')) {
    contentType = 'Social short'
  } else if (lower.includes('product') || lower.includes('bottle') || lower.includes('device') || lower.includes('hardware') || lower.includes('perfume') || lower.includes('watch') || lower.includes('shoes')) {
    contentType = 'Product film'
  } else if (lower.includes('character') || lower.includes('cartoon') || lower.includes('mascot') || lower.includes('anime') || lower.includes('animation')) {
    contentType = 'Animation'
  } else if (lower.includes('doc') || lower.includes('story') || lower.includes('interview') || lower.includes('human')) {
    contentType = 'Documentary'
  }

  // 2. Identify Aesthetics and Styles
  const styleSet = new Set()
  if (lower.includes('surreal') || lower.includes('dream') || lower.includes('strange') || lower.includes('weird') || lower.includes('otherworldly')) {
    styleSet.add('Surreal')
  }
  if (lower.includes('minimal') || lower.includes('clean') || lower.includes('quiet') || lower.includes('sleek') || lower.includes('modern')) {
    styleSet.add('Minimal')
  }
  if (lower.includes('3d') || lower.includes('gloss') || lower.includes('chrome') || lower.includes('render') || lower.includes('liquid')) {
    styleSet.add('3D glossy')
  }
  if (lower.includes('photoreal') || lower.includes('real') || lower.includes('raw') || lower.includes('authentic')) {
    styleSet.add('Photoreal')
  }
  if (lower.includes('tactile') || lower.includes('warm') || lower.includes('organic') || lower.includes('human') || lower.includes('nature')) {
    styleSet.add('Tactile & Warm')
  }
  if (lower.includes('editorial') || lower.includes('fashion') || lower.includes('vogue') || lower.includes('luxury')) {
    styleSet.add('High-gloss Editorial')
  }

  // Default fallback if no explicit mood identified
  if (styleSet.size === 0) {
    styleSet.add('Cinematic')
    styleSet.add('Minimal')
  } else if (styleSet.size === 1) {
    styleSet.add('Cinematic')
  }
  const style = Array.from(styleSet)

  // 3. Recommended AI Tool Stack
  const toolsSet = new Set(['Runway'])
  if (style.includes('Surreal') || contentType === 'Music visual') {
    toolsSet.add('Kling')
    toolsSet.add('Sora')
  }
  if (style.includes('Minimal') || contentType === 'Product film' || contentType === 'Brand film') {
    toolsSet.add('Veo')
    toolsSet.add('ComfyUI')
  }
  if (style.includes('3D glossy') || lower.includes('3d') || lower.includes('render')) {
    toolsSet.add('Blender')
    toolsSet.add('ComfyUI')
  }
  if (lower.includes('sound') || lower.includes('music') || contentType === 'Music visual') {
    toolsSet.add('Suno')
  }
  if (lower.includes('voice') || lower.includes('narrat') || lower.includes('speech')) {
    toolsSet.add('ElevenLabs')
  }
  if (lower.includes('character') || lower.includes('still') || lower.includes('visual')) {
    toolsSet.add('Midjourney')
    toolsSet.add('Flux')
  }
  toolsSet.add('Topaz')
  const requiredTools = Array.from(toolsSet).slice(0, 4)

  // 4. Required Creative Skills
  const skillsSet = new Set(['Art direction', 'Generative film'])
  if (contentType === 'Social short' || contentType === 'Product film') {
    skillsSet.add('Motion design')
    skillsSet.add('Product styling')
  }
  if (contentType === 'Music visual') {
    skillsSet.add('Sound design')
    skillsSet.add('Motion systems')
  }
  if (style.includes('3D glossy') || requiredTools.includes('Blender')) {
    skillsSet.add('3D art direction')
    skillsSet.add('Lighting & materials')
  }
  const requiredSkills = Array.from(skillsSet)

  // 5. Detect Deliverables Count
  let deliverables = 3
  const countMatch = lower.match(/(\d+)\s*(deliverable|video|clip|short|piece|asset|version|loop|film)/)
  if (countMatch && countMatch[1]) {
    deliverables = Math.min(10, Math.max(1, Number(countMatch[1])))
  } else if (lower.includes('single') || lower.includes('one hero')) {
    deliverables = 1
  } else if (lower.includes('series') || lower.includes('set of five') || lower.includes('5')) {
    deliverables = 5
  }

  // 6. Output Formats
  let formats = ['16:9', '9:16']
  if (contentType === 'Social short' || lower.includes('mobile') || lower.includes('reel') || lower.includes('tiktok')) {
    formats = ['9:16', '1:1', '4:5']
  } else if (contentType === 'Product film') {
    formats = ['16:9', '1:1', '9:16']
  }

  // 7. Title Generation
  let title = 'A visual world with a point of view'
  if (lower.includes('coffee') || lower.includes('ritual') || lower.includes('morning')) {
    title = 'A new kind of morning'
  } else if (lower.includes('fragrance') || lower.includes('scent') || lower.includes('perfume')) {
    title = 'Intimate echoes'
  } else if (lower.includes('fashion') || lower.includes('garment') || lower.includes('wear')) {
    title = 'Movement as identity'
  } else if (lower.includes('watch') || lower.includes('hardware') || lower.includes('phone') || lower.includes('device')) {
    title = 'Objects of attention'
  } else if (lower.includes('sound') || lower.includes('electronic') || lower.includes('music')) {
    title = 'Motion with a pulse'
  } else if (lower.includes('nature') || lower.includes('sustainable') || lower.includes('eco')) {
    title = 'Common ground'
  } else {
    // Generate from first capitalized clause or core subject
    const subjectWords = idea.split(/\s+/).slice(0, 5).join(' ')
    title = `${subjectWords.charAt(0).toUpperCase() + subjectWords.slice(1)} — reimagined`
  }

  // 8. Creative Objective Expansion
  const expandedObjective = `Create a ${style.join(' and ').toLowerCase()} ${contentType.toLowerCase()} that earns attention in the first frame. ${idea.trim()} The final deliverables must balance emotional restraint, auditable generative craft, and uncompromising commercial provenance.`

  // 9. Recommended Budget Estimation
  const baseBudget = deliverables * 1800
  const minBudget = Math.round((baseBudget * 0.8) / 500) * 500
  const maxBudget = Math.round((baseBudget * 1.4) / 500) * 500
  const budget = {
    min: Math.max(3000, minBudget),
    max: Math.max(5000, maxBudget),
    currency: 'USD',
    formatted: `$${Math.round(minBudget / 1000)}k – $${Math.round(maxBudget / 1000)}k`,
  }

  // 10. Suggested Deadline (3 weeks out)
  const deadlineDate = new Date()
  deadlineDate.setDate(deadlineDate.getDate() + 21)
  const deadlineStr = deadlineDate.toISOString().split('T')[0]

  return {
    title,
    rawIdea: idea,
    objective: expandedObjective,
    campaignDescription: expandedObjective,
    contentType,
    type: contentType,
    style,
    formats,
    requiredTools,
    tools: requiredTools,
    requiredSkills,
    skills: requiredSkills,
    deliverables,
    budget,
    deadline: deadlineStr,
    usage: {
      commercialUse: true,
      channels: ['web', 'paid-social'],
      territories: ['Global'],
      durationMonths: 12,
      exclusivity: false,
      requireProvenance: true,
    },
    completeness: 85,
    suggestions: [
      'Refine the working title to align with your brand campaign book.',
      'Select preferred aspect ratio formats for your paid media schedule.',
      'Set target budget constraints to increase creator matching precision.',
    ],
  }
}
