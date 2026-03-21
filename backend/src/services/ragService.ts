import axios from "axios";

const RAG_API_URL = process.env.RAG_API_URL || "http://13.201.26.129:8001";

export interface Citation {
  chapter: string;
  page_start: number;
  page_end: number;
  section: string;
  section_name: string;
  source_tag: string;
}

export interface RAGResponse {
  answer: string;
  citations: Citation[];
  latency: number;
  success: boolean;
}

/**
 * Queries the RAG backend for an answer based on the provided prompt.
 * Replaces Step 2 (Gemini generateResponse) in the two-step pipeline.
 */
const queryRAG = async (query: string): Promise<RAGResponse> => {
  try {
    const response = await axios.post<RAGResponse>(`${RAG_API_URL}/api/query`, {
      query,
    });

    return response.data;
  } catch (error: any) {
    console.error("RAG query error:", error.message);
    // Return a fallback response on failure
    return {
      answer: "Sorry, I couldn't retrieve an answer at this time. Please try again.",
      citations: [],
      latency: 0,
      success: false,
    };
  }
};

export { queryRAG };
