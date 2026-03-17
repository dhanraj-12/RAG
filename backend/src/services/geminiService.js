const genAI = require("../config/gemini");

const generateResponse = async (prompt, chatHistory = []) => {
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  // Build conversation history for context
  const contents = chatHistory.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.text }],
  }));

  // Add the current user prompt
  contents.push({
    role: "user",
    parts: [{ text: prompt }],
  });

  const result = await model.generateContent({ contents });
  const response = result.response;
  return response.text();
};

module.exports = { generateResponse };
