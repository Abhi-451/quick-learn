
import { Chunk } from '../types';

declare const pdfjsLib: any;

export const extractTextFromPdf = async (file: File): Promise<Chunk[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const chunks: Chunk[] = [];
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (pageText.length > 50) {
      // Simple chunking: one chunk per page or split large pages
      // In a real RAG, we might split by paragraph or fixed tokens
      const pageChunks = splitIntoChunks(pageText, 1000, 200);
      pageChunks.forEach((text, index) => {
        chunks.push({
          id: `${file.name}-p${i}-c${index}`,
          text,
          pageNumber: i,
          fileName: file.name
        });
      });
    }
  }
  
  return chunks;
};

const splitIntoChunks = (text: string, size: number, overlap: number): string[] => {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    start += size - overlap;
  }
  
  return chunks;
};
