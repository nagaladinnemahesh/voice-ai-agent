import { WebSocketServer } from "ws";
import { speechToText } from "../../services/speech_to_text/whisperService";
import { runAgent } from "../../agent/reasoning/agentExecutor";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";
import { detectLanguage } from "../../services/language_detection/detectLanguage";

export function startVoiceGateway(server: any) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: any) => {
    console.log("\nVoice client connected");

    ws.on("message", async (message: any) => {
      const startTime = Date.now();

      try {
        const data = JSON.parse(message.toString());

        const { audioBase64, sessionId } = data;

        const audioBuffer = Buffer.from(audioBase64, "base64");

        const sttStart = Date.now();

        const transcript = await speechToText(audioBuffer);

        const language = detectLanguage(transcript);

        const sttLatency = Date.now() - sttStart;

        console.log("\n==============================");
        console.log("USER:", transcript);

        if (!transcript || transcript.trim() === "") {
          ws.send(
            JSON.stringify({
              message: "I couldn't hear that clearly. Could you repeat?",
            }),
          );

          return;
        }

        const agentStart = Date.now();

        const agentResponse: any = await runAgent(transcript, sessionId);

        const agentLatency = Date.now() - agentStart;

        console.log("AGENT RAW RESPONSE:", agentResponse);

        let textResponse = "Sorry, I couldn't process your request";

        // conversational response
        if (agentResponse.message) {
          textResponse = agentResponse.message;
        }

        // availability response
        else if (agentResponse.availableSlots) {
          textResponse = `Available slots are ${agentResponse.availableSlots.join(
            ", ",
          )}. Which slot works for you?`;
        }

        // booking success
        else if (
          agentResponse.tool === "bookAppointment" &&
          agentResponse.result?.status === "confirmed"
        ) {
          textResponse = "Your appointment has been successfully booked.";
        }

        // booking failure
        else if (
          agentResponse.tool === "bookAppointment" &&
          agentResponse.result?.status === "failed"
        ) {
          textResponse = `That slot is unavailable. Available slots are ${agentResponse.result.alternatives.join(
            ", ",
          )}`;
        }

        console.log("AGENT:", textResponse);

        const ttsStart = Date.now();

        const audioResponseBuffer = await textToSpeech(textResponse);

        const audioBase64Response = audioResponseBuffer.toString("base64");

        const ttsLatency = Date.now() - ttsStart;

        const totalLatency = Date.now() - startTime;

        console.log("\nLATENCY");
        console.log("STT:", sttLatency, "ms");
        console.log("AGENT:", agentLatency, "ms");
        console.log("TTS:", ttsLatency, "ms");
        console.log("TOTAL:", totalLatency, "ms");
        console.log("==============================\n");

        ws.send(
          JSON.stringify({
            transcript,
            language,
            response: agentResponse,
            audioBase64: audioBase64Response,
          }),
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
