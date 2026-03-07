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
  const conversationState = session?.conversationState || {};

  console.log("Session Context:", session);
  console.log("Conversation State:", conversationState);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a healthcare appointment assistant.

Your job is to understand the user's request and return JSON.

Supported actions:
- checkAvailability
- bookAppointment
- cancelAppointment
- rescheduleAppointment

Extract:
doctorId
date
time (optional)

Return JSON ONLY.

Example 1:
User: "Book cardiologist tomorrow"

{
 "intent": "bookAppointment",
 "doctorId": "cardiologist",
 "date": "2026-03-08",
 "time": null
}

Example 2:
User: "Check dermatologist tomorrow"

{
 "intent": "checkAvailability",
 "doctorId": "dermatologist",
 "date": "2026-03-08"
}

Example 3 (missing doctor):
{
 "intent": "clarification",
 "message": "Which doctor would you like to see?"
}
`,
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

  let parsed;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      message: "Sorry, I couldn't understand that.",
    };
  }

  console.log("LLM Response:", cleaned);

  // clarification response
  if (parsed.intent === "clarification") {
    return {
      message: parsed.message,
    };
  }

  const toolName = parsed.intent;

  const tool = tools[toolName as keyof typeof tools];

  if (!tool) {
    throw new Error("Invalid tool requested by agent");
  }

  await saveSession(sessionId, {
    conversationState: {
      intent: parsed.intent || conversationState.intent,
      doctorId: parsed.doctorId || conversationState.doctorId || null,
      date: parsed.date || conversationState.date || null,
    },
  });

  console.log("Selected Tool:", toolName);

  const result = await tool({
    patientId: "user123",
    doctorId: parsed.doctorId,
    date: parsed.date,
    time: parsed.time,
  });

  console.log("session saved:", sessionId);

  return result;
}
