/**
 * CampusPilot AI — Google Gemini API Client
 * Optimized with Intelligent Chunk Retrieval and Response Caching
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

// In-memory cache for fast responses
const responseCache = new Map();

// Parse sample_fictional_handbook.md into structured sections
let handbookSections = [];
let fullKbText = '';

try {
  const kbPath = process.env.CAMPUS_HANDBOOK_PATH || path.resolve(__dirname, '../../data/sample_fictional_handbook.md');
  if (fs.existsSync(kbPath)) {
    fullKbText = fs.readFileSync(kbPath, 'utf8');
    
    // Split into sections by Markdown headings
    const rawSections = fullKbText.split(/\n(?=#{1,3}\s+)/);
    handbookSections = rawSections.map(sec => {
      const firstLine = sec.split('\n')[0] || '';
      const title = firstLine.replace(/^#+\s*/, '').trim();
      return {
        title,
        content: sec.trim(),
        lower: sec.toLowerCase()
      };
    }).filter(s => s.content.length > 50);

    console.log(`[Gemini Knowledge Base] Indexed ${handbookSections.length} topical sections from sample_fictional_handbook.md`);
  }
} catch (err) {
  console.warn('[Gemini Knowledge Base] Could not index markdown file:', err.message);
}

/**
 * Retrieves the most relevant knowledge sections based on query tokens
 */
function getRelevantKbContext(query) {
  if (handbookSections.length === 0) return fullKbText.substring(0, 3000);

  const tokens = query.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(t => t.length > 2);
  
  const scored = handbookSections.map(sec => {
    let score = 0;
    tokens.forEach(tok => {
      if (sec.title.toLowerCase().includes(tok)) score += 5;
      if (sec.lower.includes(tok)) score += 1;
    });
    return { ...sec, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Take top 2 sections or default to first 2 sections
  const topSections = scored.filter(s => s.score > 0).slice(0, 2);
  if (topSections.length === 0) {
    return handbookSections.slice(0, 2).map(s => s.content).join('\n\n---\n\n');
  }

  return topSections.map(s => s.content).join('\n\n---\n\n');
}

async function callGemini(prompt, systemInstruction = '') {
  if (!GEMINI_API_KEY) {
    console.warn('[Gemini] No GEMINI_API_KEY provided in .env');
    return null;
  }

  try {
    const payload = {
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 250,
        temperature: 0.2
      }
    };

    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errData = await response.json();
      console.warn(`[Gemini API Error ${response.status}]:`, errData.error?.message);
      return null;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const textPart = candidate?.content?.parts?.find(p => p.text);
    return textPart ? textPart.text.trim() : null;
  } catch (err) {
    console.warn('[Gemini Client Exception]:', err.message);
    return null;
  }
}

/**
 * Answers questions quickly using relevant chunks from complete_hitam_knowledgebase.md
 */
async function answerWithHitamKnowledgeBase(userQuestion) {
  const cacheKey = userQuestion.toLowerCase().trim();
  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey);
  }

  const relevantContext = getRelevantKbContext(userQuestion);

  const systemInstruction = `You are the official HITAM Campus Assistant.
Grounding: Answer strictly using facts from the provided HITAM Knowledge Base.
Identity: Built by Sahil Ranakoti (B.Tech CSE Section D). Refer to him in third person.
Tone: Warm, concise, direct (2-3 sentences max). Never sound like a brochure.
If info is absent, say: "I don't have that in the official handbook — please check with your department office."

HITAM EXCERPT:
${relevantContext}`;

  const prompt = `Student Question: "${userQuestion}"`;
  const answer = await callGemini(prompt, systemInstruction);

  if (answer) {
    responseCache.set(cacheKey, answer);
    if (responseCache.size > 100) {
      const oldestKey = responseCache.keys().next().value;
      responseCache.delete(oldestKey);
    }
  }

  return answer;
}

/**
 * Fast intent analysis with local fallback
 */
async function analyzeIntentWithGemini(userMessage) {
  const prompt = `Classify this student utterance: "${userMessage}". Return JSON: {"intent": "faq"|"complaint"|"suggestion"|"event_proposal"|"outpass"|"track"}`;
  const res = await callGemini(prompt);
  if (!res) return null;
  try {
    const cleaned = res.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

module.exports = {
  callGemini,
  analyzeIntentWithGemini,
  answerWithHitamKnowledgeBase,
  getRelevantKbContext
};

