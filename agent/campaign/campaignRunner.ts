import {
  buildCampaignOpeningMessage,
  resolveCampaignLanguage,
} from "./campaignService";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";
import { saveSession } from "../../memory/session_memory/sessionManager";

export async function runCampaign(campaign: any, ws: any) {
  console.log(`\n--- OUTBOUND CAMPAIGN [${campaign.type.toUpperCase()}] ---`);
  console.log("Patient:", campaign.patientId);

  // get patient's preferred language from persistent memory
  const language = await resolveCampaignLanguage(campaign.patientId);

  // build opening message in the patient's language
  const openingText = await buildCampaignOpeningMessage({
    ...campaign,
    language,
  });

  console.log("CAMPAIGN MESSAGE:", openingText);

  const audioBuffer = await textToSpeech(openingText, language);
  const audioBase64 = audioBuffer.toString("base64");

  // pre-seed session so the agent has context when patient responds
  await saveSession(campaign.campaignId, {
    conversationState: {
      doctorId: campaign.doctorId ?? null,
      date: campaign.appointmentDate ?? null,
      awaitingSlotSelection: false,
      isRescheduling: false,
      campaignType: campaign.type,
    },
    lastAppointment: campaign.appointmentDate
      ? {
          doctorId: campaign.doctorId ?? null,
          date: campaign.appointmentDate,
          time: campaign.appointmentTime ?? null,
        }
      : null,
    history: [{ role: "assistant", content: openingText }],
  });

  // send opening message to patient
  ws.send(
    JSON.stringify({
      campaignId: campaign.campaignId,
      patientId: campaign.patientId,
      language,
      audioBase64,
      transcript: openingText,
      outbound: true,
    }),
  );

  console.log("CAMPAIGN: Opening message sent to", campaign.patientId);

  // patient responses after this are handled by the normal voiceGateway → runAgent flow
  // using campaign.campaignId as the sessionId
}

// replace setInterval with a proper job queue (BullMQ, cron) in production
export function scheduleCampaigns(wss: any) {
  setInterval(async () => {
    const mockCampaigns = [
      {
        campaignId: "campaign:reminder:user123",
        patientId: "user123",
        type: "reminder",
        appointmentDate: new Date(Date.now() + 86400000)
          .toISOString()
          .split("T")[0],
        appointmentTime: "10:00",
        doctorId: "dermatologist",
      },
    ];

    wss.clients.forEach((ws: any) => {
      if (ws.readyState === ws.OPEN) {
        mockCampaigns.forEach((campaign) => {
          runCampaign(campaign, ws).catch((err) =>
            console.error("Campaign error:", err),
          );
        });
      }
    });
  }, 10000); // replace with actual schedule in production
}
