
import { GoogleGenAI, Modality } from "@google/genai";

export const generateAnswer = async (query: string, context: string, mode: 'QA' | 'EXPLAIN'): Promise<string> => {
  // Always initialize a new GoogleGenAI instance right before the call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = mode === 'QA' 
    ? `You are an expert tutor. Answer the user's question strictly using the provided context from the syllabus/study material. 
       If the answer is not contained in the context, strictly respond with: "This topic is not covered in the uploaded syllabus."
       Do not use any external knowledge. Be precise and academic.`
    : `You are an expert tutor. Explain the topic specified by the user step-by-step based only on the provided context. 
       Make it student-friendly, exam-oriented, and easy to understand. 
       If the topic is not discussed in the context, strictly respond with: "This topic is not covered in the uploaded syllabus."
       Do not use any external knowledge. Use bullet points for clarity.`;

  const prompt = `Context Information:
  ${context}
  
  User Question/Topic: ${query}
  
  Answer:`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });
    return response.text || "No response generated.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error generating response. Please check your connection or context size.";
  }
};

export const generateImage = async (subject: string): Promise<string | null> => {
  // Always initialize a new GoogleGenAI instance right before the call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          {
            text: `A high-quality, professional 3D educational visualization of ${subject}. Futuristic, clean, minimalist scientific style. Cinematic lighting, soft shadows, 16:9 aspect ratio.`,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9"
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image Generation Error:", error);
    return null;
  }
};

export const textToSpeech = async (text: string): Promise<Uint8Array | null> => {
  // Always initialize a new GoogleGenAI instance right before the call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read this educational explanation clearly and at a moderate pace: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return decodeBase64(base64Audio);
    }
    return null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
