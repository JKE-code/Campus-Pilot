// @ts-check
/**
 * CampusPilot AI — High-Speed Local Grounded Knowledge Engine
 * Reads campus handbook directly for deterministic, instant answers
 */

const fs = require('fs');
const path = require('path');

let kbText = '';
let paragraphs = [];

try {
  const kbPath = process.env.CAMPUS_HANDBOOK_PATH || path.resolve(__dirname, '../../complete_hitam_knowledgebase.md');
  if (fs.existsSync(kbPath)) {
    kbText = fs.readFileSync(kbPath, 'utf8');
    paragraphs = kbText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
    console.log(`[Knowledge Engine] Loaded handbook (${kbText.length} bytes, ${paragraphs.length} paragraphs)`);
  }
} catch (err) {
  console.error('[Knowledge Engine] Error loading handbook:', err.message);
}

/**
 * Searches the handbook directly for grounded facts using token matching
 * @param {string} query
 * @returns {string|null}
 */
function searchHandbook(query) {
  if (!kbText || !paragraphs.length) return null;

  const lowerQuery = query.toLowerCase().trim();
  const tokens = lowerQuery.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(t => t.length > 2);
  if (tokens.length === 0) return null;

  // Token Matching across all handbook paragraphs
  const scoredParagraphs = paragraphs.map(p => {
    const lowerP = p.toLowerCase();
    let score = 0;
    tokens.forEach(tok => {
      if (lowerP.includes(tok)) {
        score += 2;
        if (new RegExp(`\\b${tok}\\b`, 'i').test(p)) score += 3;
      }
    });
    return { text: p, score };
  });

  scoredParagraphs.sort((a, b) => b.score - a.score);

  if (scoredParagraphs.length > 0 && scoredParagraphs[0].score >= 4) {
    const top = scoredParagraphs.slice(0, 2).map(s => s.text).join('\n\n');
    return cleanMarkdownResponse(top);
  }

  return null;
}

function cleanMarkdownResponse(text) {
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/\|\s*[-:]+\s*\|/g, '')
    .trim();
}

module.exports = {
  searchHandbook,
  kbText
};
