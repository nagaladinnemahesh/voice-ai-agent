import { WebSocketServer } from "ws";
import { speechToText } from "../../services/speech_to_text/whisperService";
import { runAgent } from "../../agent/reasoning/agentExecutor";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";
import { v4 as uuidv4 } from "uuid";
import { detectLanguage } from "../../services/language_detection/detectLanguage";

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

        const { audioBase64, sessionId } = data;

        const audioBuffer = Buffer.from(audioBase64, "base64");

        console.log("Received audio buffer");

        // speech to text
        const sttStart = Date.now();

        const transcript = await speechToText(audioBuffer);

        const language = detectLanguage(transcript);

        const sttLatency = Date.now() - sttStart;

        console.log(`[${requestId}] Detected language: ${language}`);
        console.log(`[${requestId}] STT latency: ${sttLatency} ms`);
        console.log("Transcript:", transcript);

        // agent reasoning
        const agentStart = Date.now();

        const agentResponse: any = await runAgent(transcript, sessionId);

        const agentLatency = Date.now() - agentStart;

        console.log(
          `[${requestId}] Agent reasoning latency: ${agentLatency} ms`,
        );

        let textResponse = "Sorry, I couldn't process your request";

        const response: any = agentResponse;

        // conversational response
        if (response.message) {
          textResponse = response.message;
        }

        // availability response
        else if (response.availableSlots) {
          textResponse = `Available slots are ${response.availableSlots.join(", ")}`;
        }

        // booking success
        else if (response.result?.status === "confirmed") {
          textResponse = "Your appointment has been successfully booked.";
        }

        // booking conflict
        else if (response.result?.status === "failed") {
          textResponse = `That slot is unavailable. Available slots are ${response.result.alternatives.join(", ")}`;
        }

        // text to speech
        const ttsStart = Date.now();

        const audioResponseBuffer = await textToSpeech(textResponse);

        const audioBase64Response = audioResponseBuffer.toString("base64");

        const ttsLatency = Date.now() - ttsStart;

        console.log(`[${requestId}] TTS latency: ${ttsLatency} ms`);

        ws.send(
          JSON.stringify({
            requestId,
            transcript,
            language,
            response: agentResponse,
            audioBase64: audioBase64Response,
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
