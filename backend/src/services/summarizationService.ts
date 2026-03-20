import Chat from "../models/Chat";
import Message from "../models/Message";
import ChatSummary from "../models/ChatSummary";
import { generateSummary, ChatMessage } from "./geminiService";

const SUMMARY_THRESHOLD = 10;

/**
 * Checks if summarization is needed and triggers it.
 * Called asynchronously (fire-and-forget) after sending a response to avoid blocking the user.
 *
 * Summarization triggers when:
 *   chat.messageCount - chat.lastSummaryAtMessageSeq >= SUMMARY_THRESHOLD
 *
 * When triggered:
 * 1. Fetch the latest existing summary for this chat (if any)
 * 2. Fetch all unsummarized messages (sequenceNumber > lastSummaryAtMessageSeq)
 * 3. Call Gemini to generate a new comprehensive summary
 * 4. Store the new ChatSummary document
 * 5. Update chat.lastSummaryAtMessageSeq
 */
const checkAndSummarize = async (chatId: string): Promise<void> => {
  try {
    const chat = await Chat.findById(chatId);
    if (!chat) return;

    const unsummarizedCount = chat.messageCount - chat.lastSummaryAtMessageSeq;
    if (unsummarizedCount < SUMMARY_THRESHOLD) return;

    console.log(`[Summarization] Triggered for chat ${chatId} — ${unsummarizedCount} unsummarized messages`);

    // Fetch the latest existing summary
    const latestSummary = await ChatSummary.findOne({ chatId })
      .sort({ toMessageSeq: -1 })
      .lean();

    // Fetch unsummarized messages using the compound index (folder-like access)
    const unsummarizedMessages = await Message.find({
      chatId,
      sequenceNumber: { $gt: chat.lastSummaryAtMessageSeq },
    })
      .sort({ sequenceNumber: 1 })
      .lean();

    if (unsummarizedMessages.length === 0) return;

    // Convert to ChatMessage format for Gemini
    const messagesToSummarize: ChatMessage[] = unsummarizedMessages.map((msg) => ({
      role: msg.role,
      text: msg.text,
    }));

    // Generate new summary via Gemini
    const newSummaryText = await generateSummary(
      latestSummary?.summaryText || null,
      messagesToSummarize
    );

    const lastSeq = unsummarizedMessages[unsummarizedMessages.length - 1].sequenceNumber;

    // Store the new summary
    await ChatSummary.create({
      chatId,
      summaryText: newSummaryText,
      fromMessageSeq: chat.lastSummaryAtMessageSeq + 1,
      toMessageSeq: lastSeq,
    });

    // Update chat tracking
    await Chat.findByIdAndUpdate(chatId, {
      lastSummaryAtMessageSeq: lastSeq,
    });

    console.log(`[Summarization] Complete for chat ${chatId} — summarized up to seq ${lastSeq}`);
  } catch (error: any) {
    // Summarization is non-critical — log and continue
    console.error(`[Summarization] Error for chat ${chatId}:`, error.message);
  }
};

export { checkAndSummarize, SUMMARY_THRESHOLD };
