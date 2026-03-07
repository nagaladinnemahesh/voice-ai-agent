import OpenAI from "openai";
import { tools } from "../tools/toolRegistry";
import {
  getSession,
  saveSession,
} from "../../memory/session_memory/sessionManager";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function runAgent(userInput: string, sessionId: string) {
  console.log("User Input:", userInput);
  console.log("sessionId:", sessionId);

  const session = await getSession(sessionId);
  console.log("Conversation State:", session?.conversationState);
  const conversationState = session?.ConversationState || {};
  console.log("Session Context:", session);
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a healthcare appointment assistant.

Available tools:
checkAvailability
bookAppointment
cancelAppointment
rescheduleAppointment

Return JSON only.

Example format:
{
 "tool": "checkAvailability",
 "parameters": {
   "doctorId": "D1",
   "date": "2026-03-07"
 }
}
`,
      },
      // {
      //   role: "system",
      //   content: `Session Context: ${JSON.stringify(session || {})}`,
      // },
      {
        role: "system",
        content: `ConversationState: ${JSON.stringify(conversationState)}`,
      },
      {
        role: "user",
        content: userInput,
      },
    ],
  });

  const text = response.choices[0].message.content || "";

  // removing markdown formatting if present
  const cleaned = text.replace(/```json|```/g, "").trim();

  const parsed = JSON.parse(cleaned);

  console.log("LLM Response:", cleaned);

  const tool = tools[parsed.tool as keyof typeof tools];

  if (!tool) {
    throw new Error("Invalid tool requested by agent");
  }

  console.log("Selected Tool:", parsed.tool);

  const result = await tool(parsed.parameters);

  // await saveSession(sessionId, {
  //   lastTool: parsed.tool,
  //   parameters: parsed.parameters,
  // });
  await saveSession(sessionId, {
    conversationState: {
      intent: parsed.tool,
      doctorId:
        parsed.parameters?.doctorId || conversationState.doctorId || null,
      date: parsed.parameters?.date || conversationState.date || null,
    },
  });

  console.log("session saved:", sessionId);

  return result;
}
