import { WebSocketServer } from "ws";
import { speechToText } from "../../services/speech_to_text/whisperService";
import { runAgent } from "../../agent/reasoning/agentExecutor";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";
import { text } from "node:stream/consumers";
import { response } from "express";
import { v4 as uuidv4 } from "uuid";
import { request } from "node:http";

export function startVoiceGateway(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: any) => {
    console.log("Voice client connected");

    ws.on("message", async (message: any) => {
      const requestId = uuidv4();
      console.log(`\n----- Voice Request ${requestId} -----`);
      const startTime = Date.now();
      try {
        const data = JSON.parse(message.toString());

        const { audioPath, sessionId } = data;
        console.log("Received audio:", audioPath);

        //speech to text
        const sttStart = Date.now();
        const transcript = await speechToText(audioPath);
        const sttLatency = Date.now() - sttStart;
        console.log(`[${requestId}] STT latency: ${sttLatency} ms`);
        console.log("Transcript:", transcript);

        //agent reasoning
        const agentStart = Date.now();
        const agentResponse = await runAgent(transcript, sessionId);
        const agentLatency = Date.now() - agentStart;
        console.log(
          `[${requestId}] Agent reasoning latency: ${agentLatency} ms`,
        );

        let textResponse = "Sorry, I couldn't process your request";

        const response: any = agentResponse;

        if ((agentResponse as any).availableSlots) {
          textResponse = `The available slots are ${(agentResponse as any).availableSlots.join(", ")}`;
        } else if (response.result?.status === "confirmed") {
          textResponse = `Your appointment has been successfully booked.`;
        } else if (response.result?.status === "failed") {
          textResponse = `That slot is unavailable. Available slots are ${response.result.alternatives.join(", ")}`;
        }

        //text to speech
        const audioOutput = "./audioSamples/response.wav";

        const ttsStart = Date.now();

        await textToSpeech(textResponse, audioOutput);
        const ttsLatency = Date.now() - ttsStart;
        console.log(`[${requestId}] TTS latency: ${ttsLatency} ms`);

        ws.send(
          JSON.stringify({
            requestId,
            transcript,
            response: agentResponse,
            audio: audioOutput,
          }),
        );

        const totalLatency = Date.now() - startTime;
        console.log(
          `[${requestId}] Total voice pipeline latency: ${totalLatency} ms`,
        );
      } catch (error) {
        console.error("Voice gateway error:", error);

        ws.send(
          JSON.stringify({
            error: "Voice processing failed",
          }),
        );
      }
    });
  });
}
