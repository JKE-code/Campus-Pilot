// @ts-check
/**
 * CampusPilot AI — Hardened Incident Clustering Service
 * Prevents clustering on generic or empty locations; requires token overlap >= 0.6.
 */

const STOP_WORDS = new Set([
  'room', 'block', 'floor', 'hostel', 'wing', 'washroom', 'washrooms',
  'taps', 'tap', 'water', 'building', 'campus', 'facility', 'area', 'near',
  'the', 'and', 'for', 'with', 'corridor', 'bathroom', 'dept'
]);

/**
 * Normalizes location string into specific location tokens
 * @param {string} location 
 * @returns {string[]}
 */
function extractLocationTokens(location) {
  if (!location || typeof location !== 'string') return [];
  const cleaned = location.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  return cleaned
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * Calculates Jaccard token similarity between two token sets
 * @param {string[]} tokensA 
 * @param {string[]} tokensB 
 * @returns {number}
 */
function calculateTokenSimilarity(tokensA, tokensB) {
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks for a potential incident cluster
 * @param {import('pg').PoolClient} client 
 * @param {string} category 
 * @param {string} location 
 * @returns {Promise<{ match: any, confidence: number } | null>}
 */
async function findClusterMatch(client, category, location) {
  const queryTokens = extractLocationTokens(location);
  // If location has no specific tokens (e.g. just "Hostel Room"), never cluster!
  if (queryTokens.length === 0) {
    return null;
  }

  // Look for active open requests in same category within past 12 hours
  const candidateRes = await client.query(`
    SELECT r.id, r.tracking_id, r.incident_id, r.location, r.category
    FROM requests r
    WHERE r.category = $1
      AND r.status != 'resolved'
      AND r.status != 'confirmed'
      AND r.status != 'rejected'
      AND r.created_at > NOW() - INTERVAL '12 hours'
      AND r.location IS NOT NULL
  `, [category]);

  let bestMatch = null;
  let highestScore = 0;

  for (const row of candidateRes.rows) {
    const candidateTokens = extractLocationTokens(row.location);
    const score = calculateTokenSimilarity(queryTokens, candidateTokens);
    if (score >= 0.6 && score > highestScore) {
      highestScore = score;
      bestMatch = row;
    }
  }

  if (bestMatch) {
    return { match: bestMatch, confidence: Math.round(highestScore * 100) / 100 };
  }

  return null;
}

module.exports = {
  extractLocationTokens,
  calculateTokenSimilarity,
  findClusterMatch
};
