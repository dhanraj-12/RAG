import genAI from "../config/gemini";

export interface ChatMessage {
  role: string;
  text: string;
}

/**
 * Step 1 — Smart Query Rewriter for RAG
 * Determines if the current prompt needs context from previous conversation.
 * If self-contained, returns it as-is. If context-dependent, rewrites it
 * into a fully self-contained query using summary and history.
 */
const checkContext = async (
  currentPrompt: string,
  summary: string | null,
  recentMessages: ChatMessage[]
): Promise<{ isRelated: boolean; enhancedPrompt: string }> => {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const systemInstruction = `You are a smart query rewriter for a RAG system.

Your job is to decide whether the current user query needs context from previous conversation or not.

Inputs:
1. Conversation Summary: ${summary || "None"}
2. Previous Messages:
${recentMessages.length > 0 ? recentMessages.map((msg) => `${msg.role}: ${msg.text}`).join("\n") : "None"}
3. Current User Query: ${currentPrompt}

Instructions:

- If the current query is SELF-CONTAINED (clear, complete, and understandable on its own), 
  then RETURN IT EXACTLY AS-IS. Do NOT modify anything.

- If the current query is CONTEXT-DEPENDENT (e.g., contains pronouns like "it", "they", 
  "that", "those", or refers to previous discussion), then rewrite it into a 
  FULLY SELF-CONTAINED query using the summary and history.

- Only include relevant context. Do NOT add unnecessary details.

- Keep the rewritten query concise and natural.

- Do NOT change the meaning of the query.

- Do NOT always rewrite — rewriting should happen ONLY when necessary.

Examples:

1.
Query: "What is photosynthesis?"
Output: "What is photosynthesis?"

2.
Query: "What are its characteristics?"
(Previous context: talking about enzymes)
Output: "What are the characteristics of enzymes?"

3.
Query: "Explain it in simple terms"
(Previous context: Newton's laws)
Output: "Explain Newton's laws in simple terms"

Now process the input.

Return ONLY the final query.
Do NOT explain your reasoning.`;

  const contents = [
    { role: "user" as const, parts: [{ text: systemInstruction }] },
  ];

  try {
    const result = await model.generateContent({ contents });
    const enhancedPrompt = result.response.text().trim();

    // If the LLM returned something meaningful, use it; otherwise fall back
    if (!enhancedPrompt) {
      return { isRelated: false, enhancedPrompt: currentPrompt };
    }

    const isRelated = enhancedPrompt.toLowerCase() !== currentPrompt.toLowerCase();
    console.log(`[Context Check] Original: "${currentPrompt}" → Enhanced: "${enhancedPrompt}" (rewritten: ${isRelated})`);

    return { isRelated, enhancedPrompt };
  } catch (error) {
    console.error("Context check failed, falling back to original prompt:", error);
    return { isRelated: false, enhancedPrompt: currentPrompt };
  }
};

/**
 * Step 2 — Response Generation
 * Generates the final AI response using the (possibly enhanced) prompt,
 * conversation summary, and recent messages as context.
 */
const generateResponse = async (
  prompt: string,
  summary: string | null,
  recentMessages: ChatMessage[]
): Promise<string> => {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  // Inject summary as system context at the start of the conversation
  if (summary) {
    contents.push({
      role: "user",
      parts: [{ text: `[Previous conversation summary for context]\n${summary}` }],
    });
    contents.push({
      role: "model",
      parts: [{ text: "Understood. I have the conversation context. How can I help?" }],
    });
  }

  // Add recent messages
  for (const msg of recentMessages) {
    contents.push({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.text }],
    });
  }

  // Add the current prompt
  contents.push({ role: "user", parts: [{ text: prompt }] });

  const result = await model.generateContent({ contents });
  return result.response.text();
};

/**
 * Summarization — Generate a comprehensive summary
 * Combines the existing summary with new messages to produce an updated summary.
 */
const generateSummary = async (
  existingSummary: string | null,
  messages: ChatMessage[]
): Promise<string> => {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  let prompt = `You are a conversation summarizer. Create a comprehensive, concise summary that captures all important topics, decisions, facts, and context from the conversation below.

The summary should:
- Preserve key information, names, numbers, and decisions
- Be organized and easy to reference
- Be concise but not lose important details
- Be written in third person

`;

  if (existingSummary) {
    prompt += `[Previous Summary]\n${existingSummary}\n\n`;
  }

  prompt += `[New Messages to Incorporate]\n`;
  for (const msg of messages) {
    prompt += `${msg.role}: ${msg.text}\n`;
  }

  prompt += `\nGenerate the updated comprehensive summary:`;

  const contents = [{ role: "user" as const, parts: [{ text: prompt }] }];
  const result = await model.generateContent({ contents });
  return result.response.text();
};

export { checkContext, generateResponse, generateSummary };
