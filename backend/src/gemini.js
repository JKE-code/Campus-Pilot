/**
 * CampusPilot AI — Google Gemini API Client
 * Integrated using Gemini 3.8 Flash
 */

require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

async function callGemini(prompt, systemInstruction = '') {
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
 * Intelligently extracts intent, category, and missing detail flags using Gemini
 */
async function analyzeIntentWithGemini(userMessage) {
  const systemPrompt = `You are the intent parsing engine for CampusPilot AI at HITAM (Hyderabad Institute of Technology and Management).
Classify the user utterance into one of the following intents:
- "faq": general question about college timings, hostel curfew, library, canteen, Wi-Fi, syllabus, or HR24 exam regulations.
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

/**
 * Generates warm, grounded FAQ answer from knowledge items
 */
async function generateGroundedAnswer(question, relevantKnowledge) {
  const systemPrompt = `You are the friendly, witty HITAM Campus Assistant.
Rules:
1. Answer strictly using the provided Grounded Knowledge. Do not invent dates, rooms, or policies.
2. Tone: Warm, helpful, slightly gen-Z, concise (max 3 short sentences).
3. If the knowledge does not contain the answer, politely tell them to check with the department office.`;

  const prompt = `Grounded Knowledge:
${JSON.stringify(relevantKnowledge, null, 2)}

Student Question:
"${question}"`;

  return await callGemini(prompt, systemPrompt);
}

module.exports = {
  callGemini,
  analyzeIntentWithGemini,
  generateGroundedAnswer
};
