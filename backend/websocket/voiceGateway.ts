import { WebSocketServer } from "ws";
import { speechToText } from "../../services/speech_to_text/whisperService";
import { runAgent } from "../../agent/reasoning/agentExecutor";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";
import { detectLanguage } from "../../services/language_detection/detectLanguage";

export function startVoiceGateway(server: any) {
  const wss = new WebSocketServer({ server });

  console.log("WebSocket gateway ready");

  wss.on("connection", (ws: any) => {
    console.log("\n✓ Voice client connected");
    console.log("  Active connections:", wss.clients.size);

    ws.on("close", () => {
      console.log("✗ Voice client disconnected");
      console.log("  Active connections:", wss.clients.size);
    });

    ws.on("message", async (message: any) => {
      const startTime = Date.now();

      try {
        const data = JSON.parse(message.toString());

        const { audioBase64, sessionId } = data;

        // guard: missing audio
        if (!audioBase64) {
          console.warn("GATEWAY: message received with no audioBase64");
          ws.send(JSON.stringify({ error: "No audio received" }));
          return;
        }

        // guard: missing session
        if (!sessionId) {
          console.warn("GATEWAY: message received with no sessionId");
          ws.send(JSON.stringify({ error: "No sessionId provided" }));
          return;
        }

        console.log("\n==============================");
        console.log("SESSION:", sessionId);
        console.log("AUDIO: received", audioBase64.length, "base64 chars");

        const audioBuffer = Buffer.from(audioBase64, "base64");

        const sttStart = Date.now();
        const transcript = await speechToText(audioBuffer);
        const language = await detectLanguage(transcript);
        const sttLatency = Date.now() - sttStart;

        console.log("USER:", transcript);
        console.log("LANGUAGE:", language);

        if (!transcript || transcript.trim() === "") {
          ws.send(
            JSON.stringify({
              response: {
                message: "I couldn't hear that clearly. Could you repeat?",
              },
            }),
          );
          return;
        }

        const agentStart = Date.now();
        const agentResponse: any = await runAgent(
          transcript,
          sessionId,
          language,
        );
        const agentLatency = Date.now() - agentStart;

        console.log("AGENT RAW RESPONSE:", agentResponse);

        const responseLanguage = agentResponse.language ?? language;

        // build text response for TTS
        let textResponse = "Sorry, I couldn't process your request";

        if (agentResponse.message) {
          textResponse = agentResponse.message;
        } else if (agentResponse.availableSlots) {
          textResponse = `Available slots are ${agentResponse.availableSlots.join(", ")}. Which slot works for you?`;
        } else if (
          agentResponse.tool === "bookAppointment" &&
          agentResponse.result?.status === "confirmed"
        ) {
          textResponse = `Your appointment with ${agentResponse.result.doctorId} on ${agentResponse.result.date} at ${agentResponse.result.time} has been booked.`;
        } else if (
          agentResponse.tool === "bookAppointment" &&
          agentResponse.result?.message ===
            "Cannot book an appointment in the past"
        ) {
          const alts = agentResponse.result.alternatives?.length
            ? ` Available slots: ${agentResponse.result.alternatives.join(", ")}.`
            : "";
          textResponse = `Sorry, that time has already passed.${alts}`;
        } else if (
          agentResponse.tool === "bookAppointment" &&
          agentResponse.result?.status === "failed"
        ) {
          textResponse = `That slot is unavailable. Available slots are ${agentResponse.result.alternatives?.join(", ")}.`;
        } else if (
          agentResponse.tool === "rescheduleAppointment" &&
          agentResponse.result?.status === "confirmed"
        ) {
          textResponse = `Your appointment has been rescheduled to ${agentResponse.result.date} at ${agentResponse.result.time}.`;
        } else if (agentResponse.tool === "cancelAppointment") {
          textResponse = "Your appointment has been successfully cancelled.";
        }

        console.log("AGENT:", textResponse);

        const ttsStart = Date.now();
        const audioResponseBuffer = await textToSpeech(
          textResponse,
          responseLanguage,
        );
        const audioBase64Response = audioResponseBuffer.toString("base64");
        const ttsLatency = Date.now() - ttsStart;

        const totalLatency = Date.now() - startTime;

        console.log("\nLATENCY");
        console.log("  STT:   ", sttLatency, "ms");
        console.log("  AGENT: ", agentLatency, "ms");
        console.log("  TTS:   ", ttsLatency, "ms");
        console.log("  TOTAL: ", totalLatency, "ms");
        console.log("==============================\n");

        ws.send(
          JSON.stringify({
            transcript,
            language: responseLanguage,
            response: agentResponse,
            audioBase64: audioBase64Response,
          }),
        );
      } catch (error: any) {
        console.error("GATEWAY ERROR:", error?.message ?? error);
        ws.send(
          JSON.stringify({
            response: { message: "Something went wrong. Please try again." },
          }),
        );
      }
    });
  });
}
