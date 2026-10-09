/**
 * Creator Matching Engine for Genra AI Content Creator Marketplace
 * Calculates an explainable score from 0–100 with full breakdown, matching items, missing requirements, and explanations.
 */

export function calculateCreatorMatch(creator, brief) {
  if (!creator || !brief) {
    return {
      creator: creator || {},
      score: 0,
      breakdown: {
        tools: { score: 0, max: 25, matching: [], missing: [], verifiedCount: 0 },
        skills: { score: 0, max: 25, matching: [], missing: [] },
        formats: { score: 0, max: 15, matching: [], missing: [] },
        specialization: { score: 0, max: 20, matching: [], missing: [] },
        commercialRights: { score: 0, max: 15, compatible: false, verified: false },
      },
      matchingSkills: [],
      missingRequirements: ['Invalid brief or creator data'],
      explanation: 'Unable to calculate match due to missing data.',
      reasons: [],
    }
  }

  const creatorTools = (creator.tools || []).map((t) =>
    typeof t === 'string'
      ? { name: t, verified: true }
      : { name: t.name, verified: Boolean(t.verified) }
  )
  const creatorToolNames = creatorTools.map((t) => t.name.toLowerCase())
  const creatorSkills = (creator.skills || []).map((s) => s.toLowerCase().trim())
  const creatorFormats = (creator.formats || []).map((f) => f.trim())
  const creatorSpecs = [
    ...(creator.specializations || []),
    ...(creator.specialties || []),
    ...(creator.contentTypes || []),
  ].map((s) => s.toLowerCase().replace(/[-_]/g, ' ').trim())

  const requiredTools = (brief.requiredTools || brief.tools || []).map((t) => t.trim())
  const requiredSkills = (brief.requiredSkills || brief.skills || []).map((s) => s.trim())
  const requiredFormats = (brief.formats || []).map((f) => f.trim())
  const briefStyle = (brief.style || []).map((s) => s.toLowerCase().replace(/[-_]/g, ' ').trim())
  const briefType = (brief.contentType || brief.type || '')
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .trim()
  const briefRequiresCommercial = Boolean(
    brief.usage?.commercialUse ?? brief.commercialUse ?? true
  )

  const missingRequirements = []
  const matchingSkillsList = []
  const reasons = []

  // -----------------------------------------------------------------
  // 1. AI Tools Match (0–25 points)
  // -----------------------------------------------------------------
  let toolsScore = 0
  const matchingTools = []
  const missingTools = []
  let verifiedToolMatches = 0

  if (requiredTools.length > 0) {
    requiredTools.forEach((tool) => {
      const toolLower = tool.toLowerCase()
      const found = creatorTools.find(
        (ct) => ct.name.toLowerCase() === toolLower || ct.name.toLowerCase().includes(toolLower)
      )
      if (found) {
        matchingTools.push(tool)
        matchingSkillsList.push(tool)
        if (found.verified) verifiedToolMatches++
      } else {
        missingTools.push(tool)
        missingRequirements.push(`Tool: missing ${tool}`)
      }
    })

    const toolRatio = matchingTools.length / requiredTools.length
    toolsScore = Math.round(toolRatio * 20)
    // Bonus up to 5 points for verified receipts
    if (verifiedToolMatches > 0) {
      toolsScore += Math.min(5, verifiedToolMatches * 2)
    }
  } else {
    // If no specific tools were mandated, award baseline for rich toolkit
    const count = Math.min(creatorTools.length, 4)
    toolsScore = 15 + count * 2
    if (creatorTools.some((t) => t.verified)) toolsScore += 2
  }
  toolsScore = Math.min(25, Math.max(0, toolsScore))

  // -----------------------------------------------------------------
  // 2. Skills Match (0–25 points)
  // -----------------------------------------------------------------
  let skillsScore = 0
  const matchingSkills = []
  const missingSkills = []

  if (requiredSkills.length > 0) {
    requiredSkills.forEach((skill) => {
      const skillLower = skill.toLowerCase()
      const found = creatorSkills.some(
        (cs) => cs === skillLower || cs.includes(skillLower) || skillLower.includes(cs)
      )
      if (found) {
        matchingSkills.push(skill)
        matchingSkillsList.push(skill)
      } else {
        missingSkills.push(skill)
        missingRequirements.push(`Skill: missing ${skill}`)
      }
    })
    const skillRatio = matchingSkills.length / requiredSkills.length
    skillsScore = Math.round(skillRatio * 25)
  } else {
    // If brief didn't specify granular skills, evaluate relevance against title & description
    const briefKeywords = [brief.title, brief.description, brief.campaignDescription]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    const matchedCount = creatorSkills.filter((cs) => briefKeywords.includes(cs)).length
    skillsScore = 16 + Math.min(9, matchedCount * 3)
    matchingSkills.push(...creator.skills.slice(0, 3))
    matchingSkillsList.push(...creator.skills.slice(0, 3))
  }
  skillsScore = Math.min(25, Math.max(0, skillsScore))

  // -----------------------------------------------------------------
  // 3. Formats Match (0–15 points)
  // -----------------------------------------------------------------
  let formatsScore = 0
  const matchingFormats = []
  const missingFormats = []

  if (requiredFormats.length > 0) {
    requiredFormats.forEach((format) => {
      if (creatorFormats.includes(format)) {
        matchingFormats.push(format)
      } else {
        missingFormats.push(format)
        missingRequirements.push(`Format: lacks ${format} output`)
      }
    })
    const formatRatio = matchingFormats.length / requiredFormats.length
    formatsScore = Math.round(formatRatio * 15)
  } else {
    formatsScore = creatorFormats.length > 0 ? 15 : 10
    matchingFormats.push(...creatorFormats)
  }
  formatsScore = Math.min(15, Math.max(0, formatsScore))

  // -----------------------------------------------------------------
  // 4. Specialization Match (0–20 points)
  // -----------------------------------------------------------------
  let specScore = 0
  const matchingSpecs = []
  const missingSpecs = []

  const targetSpecs = [briefType, ...briefStyle].filter(Boolean)
  if (targetSpecs.length > 0) {
    targetSpecs.forEach((target) => {
      const found = creatorSpecs.some(
        (cs) => cs === target || cs.includes(target) || target.includes(cs)
      )
      if (found) {
        matchingSpecs.push(target)
      } else {
        missingSpecs.push(target)
      }
    })

    const specRatio = matchingSpecs.length / targetSpecs.length
    specScore = Math.round(specRatio * 16)
    if (matchingSpecs.includes(briefType)) specScore += 4 // Bonus for exact content type
  } else {
    specScore = 15
  }
  specScore = Math.min(20, Math.max(0, specScore))

  // -----------------------------------------------------------------
  // 5. Commercial Rights & Verification (0–15 points)
  // -----------------------------------------------------------------
  let commercialScore = 0
  const creatorOffersCommercial = Boolean(creator.commercialUse ?? true)
  const isVerifiedCreator = Boolean(
    creator.verified || (creator.verificationScore || creator.verification?.score || 0) >= 80
  )

  if (briefRequiresCommercial) {
    if (creatorOffersCommercial) {
      commercialScore += 10
    } else {
      missingRequirements.push('Rights: Creator does not offer commercial license')
    }
  } else {
    commercialScore += 10
  }

  if (isVerifiedCreator) {
    commercialScore += 5
  } else {
    commercialScore += 2
  }
  commercialScore = Math.min(15, Math.max(0, commercialScore))

  // -----------------------------------------------------------------
  // 6. Aggregate Total Score & Explanations
  // -----------------------------------------------------------------
  const totalScore = Math.min(
    100,
    Math.max(0, toolsScore + skillsScore + formatsScore + specScore + commercialScore)
  )

  // Construct UI reasons
  if (matchingTools.length > 0) {
    reasons.push(
      `Mastery in ${matchingTools.join(' & ')} ${verifiedToolMatches > 0 ? '(verified receipts)' : ''}`
    )
  }
  if (matchingFormats.length > 0) {
    reasons.push(`Full ${matchingFormats.join(' / ')} aspect coverage`)
  }
  if (matchingSpecs.length > 0) {
    reasons.push(`Specialized in ${matchingSpecs.slice(0, 2).join(' and ')} aesthetics`)
  }
  if (creatorOffersCommercial && briefRequiresCommercial) {
    reasons.push('Commercial rights & provenance included')
  }

  // Construct Human-readable Explanation
  let explanation = ''
  if (totalScore >= 90) {
    explanation = `Exceptional fit (${totalScore}% match). ${creator.name} covers all required tools (${matchingTools.join(', ') || 'AI pipelines'}) with verified receipts and full format delivery.`
  } else if (totalScore >= 75) {
    explanation = `Strong match (${totalScore}%). Excellent alignment on ${matchingSpecs.join(', ') || 'aesthetic direction'}, with minor gaps in ${missingTools[0] || missingFormats[0] || 'secondary specifications'}.`
  } else if (totalScore >= 50) {
    explanation = `Moderate match (${totalScore}%). Good baseline creative capability, but lacks direct experience in ${missingTools.concat(missingSpecs).slice(0, 2).join(' or ')}.`
  } else {
    explanation = `Lower compatibility (${totalScore}%). Significant requirement gaps in tools (${missingTools.join(', ') || 'unspecified'}) or formatting.`
  }

  return {
    creator,
    score: totalScore,
    breakdown: {
      tools: {
        score: toolsScore,
        max: 25,
        matching: matchingTools,
        missing: missingTools,
        verifiedCount: verifiedToolMatches,
      },
      skills: {
        score: skillsScore,
        max: 25,
        matching: matchingSkills,
        missing: missingSkills,
      },
      formats: {
        score: formatsScore,
        max: 15,
        matching: matchingFormats,
        missing: missingFormats,
      },
      specialization: {
        score: specScore,
        max: 20,
        matching: matchingSpecs,
        missing: missingSpecs,
      },
      commercialRights: {
        score: commercialScore,
        max: 15,
        compatible: creatorOffersCommercial,
        verified: isVerifiedCreator,
      },
    },
    matchingSkills: Array.from(new Set(matchingSkillsList)),
    missingRequirements,
    explanation,
    reasons,
  }
}

/**
 * Match a brief against a collection of creators and return ranked matches
 */
export function rankCreatorsForBrief(creators, brief) {
  if (!Array.isArray(creators)) return []
  return creators
    .map((creator) => calculateCreatorMatch(creator, brief))
    .sort((a, b) => b.score - a.score)
}
