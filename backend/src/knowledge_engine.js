/**
 * CampusPilot AI — High-Speed Local Grounded Knowledge Engine
 * Reads complete_hitam_knowledgebase.md directly for 100% deterministic, instant answers
 */

const fs = require('fs');
const path = require('path');

let kbText = '';
let paragraphs = [];

try {
  const kbPath = path.resolve(__dirname, '../../complete_hitam_knowledgebase.md');
  if (fs.existsSync(kbPath)) {
    kbText = fs.readFileSync(kbPath, 'utf8');
    // Split into readable paragraphs/blocks
    paragraphs = kbText.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 20);
    console.log(`[Knowledge Engine] Loaded complete_hitam_knowledgebase.md (${kbText.length} bytes, ${paragraphs.length} paragraphs)`);
  }
} catch (err) {
  console.error('[Knowledge Engine] Error loading handbook:', err.message);
}

/**
 * Searches the handbook directly for grounded facts
 */
function searchHandbook(query) {
  if (!kbText) return null;

  const lowerQuery = query.toLowerCase().trim();
  const tokens = lowerQuery.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(t => t.length > 2);

  // 1. Direct Entity Matching for Key People & Committees
  if (lowerQuery.includes('dharmendra')) {
    return "Mr. Dharmendra Roy is the CSE Program Head and Class Teacher for CSE II Section B at HITAM. He teaches FLAT, DAA (Section B), and NLP (IV Year). His office hours are Friday 1:00 PM – 2:00 PM (Cabin: Room S19, 2nd Floor). He also heads the Campus Canteen Committee (Contact: 9399826500 | dharmendra.cse@hitam.org).";
  }

  if (lowerQuery.includes('jahanara')) {
    return "Mrs. Jahanara teaches DAA and PBL in the CSE department. She is the Class Teacher for CSE II Section A (and teaches DAA in Sec D as substitute). Her office is in Room S19, 2nd Floor, with office hours on Friday from 1:00 PM – 2:00 PM.";
  }

  if (lowerQuery.includes('koti')) {
    return "Mr. Koti S teaches Design and Analysis of Algorithms (DAA) for CSE II Sections C and D, and serves as Class Teacher for CSE II Section D. Office: Room S19, 2nd Floor. Office Hours: Friday 1:00 PM – 2:00 PM (Mentor hour: Wednesday 1:00 PM – 2:00 PM).";
  }

  if (lowerQuery.includes('hemanth')) {
    return "Dr. S.V. Hemanth is the Head of Department (HOD) for CSE. He teaches Operating Systems (OS) and Deep Learning (DL, IV Year) with office hours on Friday 1:00 PM – 2:00 PM in Room S19, 2nd Floor.";
  }

  // 2. Token Matching across all handbook paragraphs
  let scoredParagraphs = paragraphs.map(p => {
    const lowerP = p.toLowerCase();
    let score = 0;
    tokens.forEach(tok => {
      if (lowerP.includes(tok)) {
        score += 2;
        // Exact word boundary bonus
        if (new RegExp(`\\b${tok}\\b`, 'i').test(p)) score += 3;
      }
    });
    return { text: p, score };
  });

  scoredParagraphs.sort((a, b) => b.score - a.score);

  if (scoredParagraphs.length > 0 && scoredParagraphs[0].score >= 4) {
    // Return top matching paragraph or top 2 if concise
    const top = scoredParagraphs.slice(0, 2).map(s => s.text).join('\n\n');
    return cleanMarkdownResponse(top);
  }

  return null;
}

function cleanMarkdownResponse(text) {
  // Strip excessive markdown artifacts for conversational delivery
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/\|\s*[-:]+\s*\|/g, '')
    .trim();
}

module.exports = {
  searchHandbook,
  kbText
};
