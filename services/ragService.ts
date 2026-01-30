
import { Chunk } from '../types';

export class SimpleRetriever {
  private chunks: Chunk[] = [];

  constructor(chunks: Chunk[]) {
    this.chunks = chunks;
  }

  // Simple keyword-based scoring as a proxy for vector search
  // In a production app, we'd use actual embeddings (e.g. via Gemini or transformers.js)
  public retrieve(query: string, topK: number = 5): Chunk[] {
    const keywords = query.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    
    if (keywords.length === 0) return this.chunks.slice(0, topK);

    const scored = this.chunks.map(chunk => {
      const text = chunk.text.toLowerCase();
      let score = 0;
      keywords.forEach(keyword => {
        if (text.includes(keyword)) {
          score += 1;
          // Exact match bonus
          const regex = new RegExp(`\\b${keyword}\\b`, 'g');
          const matches = text.match(regex);
          if (matches) score += matches.length;
        }
      });
      return { chunk, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(item => item.score > 0)
      .map(item => item.chunk);
  }
}
