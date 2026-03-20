import genAI from "../config/gemini";

export interface ChatMessage {
  role: string;
  text: string;
}

/**
 * Step 1 — Context Check
 * Determines if the current prompt relates to the ongoing conversation.
 * If related, returns an enhanced prompt with relevant context woven in.
 * If not related, returns the original prompt as-is.
 */
const checkContext = async (
  currentPrompt: string,
  summary: string | null,
  recentMessages: ChatMessage[]
): Promise<{ isRelated: boolean; enhancedPrompt: string }> => {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  const systemInstruction = `You are a context analysis assistant. Your job is to determine whether a new user message relates to the ongoing conversation context provided below.

You will be given:
1. A conversation summary (if available)
2. Recent messages from the conversation
3. The new user message

Respond ONLY with valid JSON in this exact format (no markdown, no code fences):
{"isRelated": true/false, "enhancedPrompt": "..."}

Rules:
- If the new message relates to or builds upon the conversation context, set "isRelated" to true and rewrite "enhancedPrompt" to incorporate relevant context so it can stand alone.
- If the new message is completely unrelated (a new topic, a greeting, a standalone question), set "isRelated" to false and set "enhancedPrompt" to the original user message exactly as-is.
- Keep the enhanced prompt concise — only add necessary context, don't repeat the entire history.`;

  let contextBlock = "";
  if (summary) {
    contextBlock += `[Conversation Summary]\n${summary}\n\n`;
  }
  if (recentMessages.length > 0) {
    contextBlock += `[Recent Messages]\n`;
    for (const msg of recentMessages) {
      contextBlock += `${msg.role}: ${msg.text}\n`;
    }
    contextBlock += "\n";
  }
  contextBlock += `[New User Message]\n${currentPrompt}`;

  const contents = [
    { role: "user" as const, parts: [{ text: `${systemInstruction}\n\n${contextBlock}` }] },
  ];

  try {
    const result = await model.generateContent({ contents });
    const responseText = result.response.text().trim();

    // Parse JSON response, stripping any accidental markdown fences
    const cleanJson = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleanJson);

    return {
      isRelated: Boolean(parsed.isRelated),
      enhancedPrompt: parsed.enhancedPrompt || currentPrompt,
    };
  } catch (error) {
    console.error("Context check failed, falling back to original prompt:", error);
    // On failure, fall back to treating it as unrelated — send original prompt
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
