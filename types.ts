
export interface Chunk {
  id: string;
  text: string;
  pageNumber: number;
  fileName: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isAudioPlaying?: boolean;
  audioBuffer?: AudioBuffer; // Cached for seeking
  audioOffset?: number; // Current playback position in seconds
  retrievedChunks?: Chunk[]; // The context used for this specific answer
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  chunks: Chunk[];
  timestamp: number;
  coverImage?: string; // Base64 or URL for the session thumbnail
}

export interface ProcessingStatus {
  step: 'idle' | 'extracting' | 'chunking' | 'indexing' | 'ready';
  progress: number;
}

export enum AppMode {
  QA = 'QA',
  TOPIC_EXPLANATION = 'TOPIC_EXPLANATION'
}
