import OpenAI from "openai";
import { tools } from "../tools/toolRegistry";
import {
  getSession,
  saveSession,
} from "../../memory/session_memory/sessionManager";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function runAgent(userInput: string, sessionId: string) {
  console.log("\n---------------- CHAT ----------------");
  console.log("USER:", userInput);

  const session = await getSession(sessionId);
  const state = session?.conversationState || {};
  const history = session?.history || [];

  const lower = userInput.toLowerCase();

  console.log("\nSESSION STATE");
  console.log("intent:", state.intent || "null");
  console.log("doctor:", state.doctorId || "null");
  console.log("date:", state.date || "null");

  // -----------------------------
  // ENTITY EXTRACTION
  // -----------------------------

  const doctorMatch = lower.match(/cardiologist|dermatologist|neurologist/);
  const extractedDoctor = doctorMatch ? doctorMatch[0] : null;

  let extractedDate = null;

  if (lower.includes("tomorrow")) {
    extractedDate = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  }

  if (lower.includes("today")) {
    extractedDate = new Date().toISOString().split("T")[0];
  }

  const timeMatch = lower.match(/\b(\d{1,2})(:?(\d{2}))?\s?(am|pm)?\b/);

  let extractedTime = null;

  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    let minute = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
    const period = timeMatch[4];

    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;

    extractedTime =
      hour.toString().padStart(2, "0") +
      ":" +
      minute.toString().padStart(2, "0");
  }

  // -----------------------------
  // MERGE STATE
  // -----------------------------

  const updatedState = {
    ...state,
    doctorId: extractedDoctor ?? state.doctorId ?? null,
    date: extractedDate ?? state.date ?? null,
  };

  console.log("\nMERGED STATE");
  console.log(updatedState);

  // ✅ FIX: persist merged state
  await saveSession(sessionId, {
    conversationState: {},
    lastAppointment: {
      doctorId: updatedState.doctorId,
      date: updatedState.date,
      time: extractedTime,
    },
  });

  // -----------------------------
  // DIRECT BOOKING
  // -----------------------------

  if (updatedState.doctorId && updatedState.date && extractedTime) {
    console.log("AGENT: Booking appointment");

    const result = await tools.bookAppointment({
      patientId: "user123",
      doctorId: updatedState.doctorId,
      date: updatedState.date,
      time: extractedTime,
    });

    await saveSession(sessionId, { conversationState: {} });

    return {
      tool: "bookAppointment",
      result,
    };
  }

  // -----------------------------
  // SHOW AVAILABLE SLOTS
  // -----------------------------

  if (
    updatedState.doctorId &&
    updatedState.date &&
    !updatedState.awaitingSlotSelection
  ) {
    const slots = await tools.checkAvailability({
      doctorId: updatedState.doctorId,
      date: updatedState.date,
    });

    await saveSession(sessionId, {
      conversationState: {
        ...updatedState,
        awaitingSlotSelection: true,
      },
    });

    console.log("AGENT: Showing available slots");

    return {
      availableSlots: slots.availableSlots,
    };
  }

  // -----------------------------
  // SLOT SELECTION FLOW
  // -----------------------------

  if (updatedState.awaitingSlotSelection && extractedTime) {
    console.log("AGENT: Booking appointment");

    const result = await tools.bookAppointment({
      patientId: "user123",
      doctorId: updatedState.doctorId,
      date: updatedState.date,
      time: extractedTime,
    });

    await saveSession(sessionId, { conversationState: {} });

    return {
      tool: "bookAppointment",
      result,
    };
  }

  // -----------------------------
  // ASK FOR MISSING INFORMATION
  // -----------------------------

  if (updatedState.doctorId && !updatedState.date) {
    return {
      message: "Which date would you like?",
    };
  }

  if (!updatedState.doctorId && updatedState.date) {
    return {
      message: "Which doctor would you like to see?",
    };
  }

  // handling cancel intent and reschedule

  if (lower.includes("cancel")) {
    const lastAppointment = session?.lastAppointment;

    if (!lastAppointment) {
      return {
        message: "I couldn't find any appointment to cancel.",
      };
    }

    console.log("AGENT: Cancelling appointment");

    const result = await tools.cancelAppointment({
      patientId: "user123",
      doctorId: lastAppointment.doctorId,
      date: lastAppointment.date,
      time: lastAppointment.time,
    });

    await saveSession(sessionId, { lastAppointment: null });

    return {
      tool: "cancelAppointment",
      result,
    };
  }

  if (lower.includes("reschedule")) {
    const lastAppointment = session?.lastAppointment;

    if (!lastAppointment) {
      return {
        message: "Please tell me which appointment you want to reschedule.",
      };
    }

    return {
      message: "What new date and time would you like?",
    };
  }
  // -----------------------------
  // LLM FALLBACK
  // -----------------------------

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
You are a healthcare appointment booking assistant.

Return JSON only.

Extract:
doctorId
date
time
`,
      },
      ...history,
      {
        role: "user",
        content: userInput,
      },
    ],
  });

  const text = response.choices[0].message.content || "";
  const cleaned = text.replace(/```json|```/g, "").trim();

  console.log("AGENT RAW:", cleaned);

  try {
    const parsed = JSON.parse(cleaned);

    if (parsed.message) {
      console.log("AGENT:", parsed.message);
      return { message: parsed.message };
    }

    if (!parsed.intent) {
      return { message: "Could you clarify your request?" };
    }

    const tool = tools[parsed.intent as keyof typeof tools];

    const result = await tool({
      patientId: "user123",
      doctorId: parsed.doctorId,
      date: parsed.date,
      time: parsed.time,
    });

    return result;
  } catch {
    return {
      message: "Sorry, I couldn't understand that.",
    };
  }
}
