import OpenAI from "openai";
import { tools } from "../tools/toolRegistry";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function runAgent(userInput: string) {
  console.log("User Input:", userInput);
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

  return result;
}
