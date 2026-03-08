import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// shimmer handles Hindi and Tamil better than alloy
const voiceMap: Record<string, "alloy" | "shimmer"> = {
  en: "alloy",
  hi: "shimmer",
  ta: "shimmer",
};

export async function textToSpeech(text: string, language = "en") {
  const voice = voiceMap[language] ?? "alloy";

  const response = await openai.audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice,
    input: text,
  });

  const audioBuffer = Buffer.from(await response.arrayBuffer());

  return audioBuffer;
}
