// @ts-check
/**
 * CampusPilot AI — Embedding Provider Interface & Implementations
 * Supports local deterministic embeddings for zero-cost test/CI/offline execution,
 * and external LLM embeddings (e.g. Gemini text-embedding-004) behind a unified interface.
 */

class EmbeddingProvider {
  /**
   * Generate vector embedding for a given text
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text) {
    throw new Error('generateEmbedding must be implemented by subclass');
  }

  /**
   * Compute cosine similarity between two vector embeddings
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} Value between -1.0 and 1.0
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'and', 'a', 'an', 'in', 'to', 'of', 'for',
  'with', 'about', 'what', 'how', 'can', 'do', 'does', 'from', 'by', 'or', 'it',
  'this', 'that', 'these', 'those', 'i', 'my', 'me', 'we', 'our', 'be', 'are', 'as'
]);

/**
 * High-Speed Local Semantic Embedding Provider
 * Produces deterministic 256-dimensional normalized dense vectors using
 * semantic token hashing, subword n-grams, and keyword frequency weighting.
 */
class LocalSemanticEmbeddingProvider extends EmbeddingProvider {
  constructor(dimension = 256) {
    super();
    this.dimension = dimension;
  }

  /**
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text) {
    const vec = new Array(this.dimension).fill(0);
    if (!text || typeof text !== 'string') return vec;

    const clean = text.toLowerCase().replace(/[^a-z0-9\s§\-_]/g, ' ');
    const rawTokens = clean.split(/\s+/).filter(t => t.length > 0);
    const tokens = rawTokens.filter(t => !STOP_WORDS.has(t));

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      
      // 1. Full word hash position
      const wordHash = this._hashString(token);
      const pos1 = Math.abs(wordHash) % this.dimension;
      vec[pos1] += 3.0;

      // 2. Bigrams / character sub-trigrams for morphological similarity
      for (let j = 0; j < token.length - 2; j++) {
        const tri = token.slice(j, j + 3);
        const triHash = this._hashString(tri);
        const pos2 = Math.abs(triHash) % this.dimension;
        vec[pos2] += 0.5;
      }
    }

    // L2 Normalize vector to unit length
    let norm = 0;
    for (let i = 0; i < this.dimension; i++) norm += vec[i] * vec[i];
    const mag = Math.sqrt(norm);
    if (mag > 0) {
      for (let i = 0; i < this.dimension; i++) vec[i] = vec[i] / mag;
    }

    return vec;
  }

  /**
   * Jenkins one-at-a-time hash
   * @private
   */
  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash += str.charCodeAt(i);
      hash += (hash << 10);
      hash ^= (hash >> 6);
    }
    hash += (hash << 3);
    hash ^= (hash >> 11);
    hash += (hash << 15);
    return hash;
  }
}


/**
 * Gemini Embedding Provider (Google Generative AI)
 */
class GeminiEmbeddingProvider extends EmbeddingProvider {
  constructor(apiKey = process.env.GEMINI_API_KEY) {
    super();
    this.apiKey = apiKey;
    this.localFallback = new LocalSemanticEmbeddingProvider();
  }

  /**
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  async generateEmbedding(text) {
    if (!this.apiKey || process.env.NODE_ENV === 'test') {
      return this.localFallback.generateEmbedding(text);
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${this.apiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'models/text-embedding-004',
          content: { parts: [{ text }] }
        })
      });

      if (!res.ok) {
        console.warn(`[GeminiEmbeddingProvider] External API returned ${res.status}, falling back to local provider`);
        return this.localFallback.generateEmbedding(text);
      }

      const data = await res.json();
      return data.embedding?.values || this.localFallback.generateEmbedding(text);
    } catch (err) {
      console.warn('[GeminiEmbeddingProvider] Error contacting embedding endpoint, falling back to local provider:', err.message);
      return this.localFallback.generateEmbedding(text);
    }
  }
}

let activeProvider = null;

/**
 * Factory to get active Embedding Provider based on configuration
 * @returns {EmbeddingProvider}
 */
function getEmbeddingProvider() {
  if (!activeProvider) {
    const providerType = process.env.EMBEDDING_PROVIDER || 'local';
    if (providerType === 'gemini' && process.env.GEMINI_API_KEY && process.env.NODE_ENV !== 'test') {
      activeProvider = new GeminiEmbeddingProvider();
    } else {
      activeProvider = new LocalSemanticEmbeddingProvider();
    }
  }
  return activeProvider;
}

module.exports = {
  EmbeddingProvider,
  LocalSemanticEmbeddingProvider,
  GeminiEmbeddingProvider,
  getEmbeddingProvider
};
