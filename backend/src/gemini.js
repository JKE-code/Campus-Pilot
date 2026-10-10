/**
 * CampusPilot AI — Google Gemini API Client
 * Integrated with complete_hitam_knowledgebase.md using Gemini 3.8 Flash
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

// Load complete_hitam_knowledgebase.md into memory
let hitamKnowledgeBaseText = '';
try {
  const kbPath = path.resolve(__dirname, '../../complete_hitam_knowledgebase.md');
  if (fs.existsSync(kbPath)) {
    hitamKnowledgeBaseText = fs.readFileSync(kbPath, 'utf8');
    console.log(`[Gemini Knowledge Base] Loaded complete_hitam_knowledgebase.md (${hitamKnowledgeBaseText.length} bytes)`);
  }
} catch (err) {
  console.warn('[Gemini Knowledge Base] Could not load markdown file:', err.message);
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
      ]
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
 * Answers questions using complete_hitam_knowledgebase.md directly
 */
async function answerWithHitamKnowledgeBase(userQuestion) {
  // If we have the full knowledge base, supply it as grounded authority
  const systemInstruction = `You are the HITAM Campus Assistant at Hyderabad Institute of Technology and Management.
You have access to the complete official campus knowledge base below.

RULES:
1. Grounding: Answer strictly using facts from the provided HITAM Knowledge Base. Never invent policies, names, bus timings, or rules.
2. Identity: You were built by Sahil Ranakoti (B.Tech CSE Section D) as a personal project. You are NOT Sahil. Refer to him in the third person.
3. Tone: Warm, helpful, slightly witty, concise (2-4 short sentences max). Never sound like a generic brochure.
4. If the question cannot be answered from the knowledge base, state honestly: "I don't have that info in the handbook — please check with your department office."

HITAM KNOWLEDGE BASE:
${hitamKnowledgeBaseText}`;

  const prompt = `Student Question: "${userQuestion}"`;
  return await callGemini(prompt, systemInstruction);
}

/**
 * Intelligently extracts intent, category, and missing detail flags using Gemini
 */
async function analyzeIntentWithGemini(userMessage) {
  const systemPrompt = `You are the intent parsing engine for CampusPilot AI at HITAM.
Classify the user utterance into one of the following intents:
- "faq": general question about college timings, hostel curfew, library, canteen, Wi-Fi, syllabus, buses, or HR24 exam regulations.
- "complaint": broken equipment, water leak, tap issue, Wi-Fi down, plumbing, hostel facility failure.
- "suggestion": improvement idea, request for new amenities, curriculum feedback.
- "event_proposal": request to organize a hackathon, fest, workshop, or student club event.
- "track": tracking an existing ticket ID (e.g. CP-2026-XXXX).

Return ONLY valid JSON with no markdown formatting:
{
  "intent": "faq" | "complaint" | "suggestion" | "event_proposal" | "track",
  "category": "maintenance" | "hostel" | "it_network" | "academics" | "student_activities",
  "location": "extracted location or null",
  "room_or_wing_specified": true | false,
  "urgency": "low" | "medium" | "high" | "critical",
  "summary": "clean 1-line title"
}`;

  const prompt = `Analyze this student utterance: "${userMessage}"`;
  const result = await callGemini(prompt, systemPrompt);

  if (!result) return null;

  try {
    const cleaned = result.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    return null;
  }
}

module.exports = {
  callGemini,
  analyzeIntentWithGemini,
  answerWithHitamKnowledgeBase,
  hitamKnowledgeBaseText
};
