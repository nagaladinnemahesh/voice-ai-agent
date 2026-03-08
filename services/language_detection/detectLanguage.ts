import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// check unicode script blocks before calling LLM — faster and free
function detectByScript(text: string) {
  if (/[\u0900-\u097F]/.test(text)) return "hi"; // Devanagari — Hindi
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta"; // Tamil script
  return null;
}

// LLM fallback for romanised input e.g. "kal doctor se milna hai"
async function detectByLLM(text: string) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 5,
      messages: [
        {
          role: "system",
          content: `Detect the language. Reply with only one code: en, hi, or ta. No explanation.`,
        },
        { role: "user", content: text },
      ],
    });

    const result = response.choices[0].message.content?.trim().toLowerCase();

    if (result === "hi" || result === "ta" || result === "en") return result;

    return "en";
  } catch {
    return "en";
  }
}

export async function detectLanguage(text: string) {
  const scriptResult = detectByScript(text);

  if (scriptResult) {
    console.log("LANGUAGE: detected by script →", scriptResult);
    return scriptResult;
  }

  const llmResult = await detectByLLM(text);
  console.log("LANGUAGE: detected by LLM →", llmResult);

  return llmResult;
}
