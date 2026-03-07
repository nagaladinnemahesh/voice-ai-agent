import OpenAI from "openai";
import { Readable } from "stream";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function speechToText(audioBuffer: Buffer) {
  const stream = Readable.from(audioBuffer);
  const response = await openai.audio.transcriptions.create({
    file: Object.assign(stream, { path: "audio.webm" }) as any,
    model: "whisper-1",
  });

  return response.text;
}
