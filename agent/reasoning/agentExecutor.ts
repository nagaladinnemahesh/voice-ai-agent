import OpenAI from "openai";
import { tools } from "../tools/toolRegistry";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function runAgent(userInput: string) {
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

  const parsed = JSON.parse(text);

  const tool = tools[parsed.tool as keyof typeof tools];

  if (!tool) {
    throw new Error("Invalid tool requested by agent");
  }

  const result = await tool(parsed.parameters);

  return result;
}
