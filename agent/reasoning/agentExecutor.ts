import OpenAI from "openai";
import { tools } from "../tools/toolRegistry";
import {
  getSession,
  saveSession,
} from "../../memory/session_memory/sessionManager";
import {
  getPatientProfile,
  recordAppointment,
  updatePreferredLanguage,
} from "../../memory/persistent_memory/Persistentmemorymanager";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const patientId = "user123";

// ─────────────────────────────────────────
// CONVERSATION STAGES
// The agent always knows exactly what step
// it is on and what to ask next.
// ─────────────────────────────────────────
const STAGE = {
  IDLE: "idle",

  // booking
  BOOK_ASK_DOCTOR: "book_ask_doctor",
  BOOK_ASK_DATE: "book_ask_date",
  BOOK_ASK_SLOT: "book_ask_slot",

  // cancel
  CANCEL_CONFIRM: "cancel_confirm",

  // reschedule
  RESCHEDULE_ASK_DATE: "reschedule_ask_date",
  RESCHEDULE_ASK_SLOT: "reschedule_ask_slot",
};

const VALID_DOCTORS = ["cardiologist", "dermatologist", "neurologist"];

// ─────────────────────────────────────────
// INTENT DETECTION (single LLM call)
// Only called when stage is IDLE
// ─────────────────────────────────────────
async function detectIntent(userInput: string, language: string) {
  const systemPrompt = `You are a healthcare assistant intent classifier. Return JSON only, no markdown.
Return: { "intent": string }
Intents (pick exactly one):
- "greet"         — user is saying hi, hello, hey, good morning, etc.
- "book"          — user wants to book, schedule, or make a new appointment
- "cancel"        — user wants to cancel an appointment
- "reschedule"    — user wants to reschedule or change an appointment
- "list"          — user wants to see, check, or know their appointments
- "unknown"       — anything else`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 20,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userInput },
    ],
  });

  try {
    const parsed = JSON.parse(
      response.choices[0].message.content?.replace(/```json|```/g, "").trim() ||
        "{}",
    );
    return parsed.intent || "unknown";
  } catch {
    return "unknown";
  }
}

// ─────────────────────────────────────────
// ENTITY EXTRACTORS
// ─────────────────────────────────────────

function extractDoctor(lower: string): string | null {
  const match = lower.match(/cardiologist|dermatologist|neurologist/);
  return match ? match[0] : null;
}

function extractDate(lower: string): string | null {
  if (lower.includes("day after tomorrow"))
    return new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];
  if (lower.includes("tomorrow"))
    return new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (lower.includes("today")) return new Date().toISOString().split("T")[0];

  // "in 3 days" / "after 3 days"
  const rel = lower.match(
    /(?:in|after)\s+(\d+)\s+days?|(\d+)\s+days?\s+(?:from now|later)/,
  );
  if (rel) {
    const days = parseInt(rel[1] ?? rel[2]);
    return new Date(Date.now() + days * 86400000).toISOString().split("T")[0];
  }

  // "30th of March" / "March 30" / "30 March 2026"
  const months: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };

  for (const [name, num] of Object.entries(months)) {
    const pattern = new RegExp(
      `(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${name}(?:\\s+(\\d{4}))?|${name}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(\\d{4}))?`,
    );
    const m = lower.match(pattern);
    if (m) {
      const day = parseInt(m[1] ?? m[3]);
      const year = parseInt(
        m[2] ?? m[4] ?? new Date().getFullYear().toString(),
      );
      const date = new Date(year, num - 1, day);
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
    }
  }

  // weekday names
  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  for (const day of weekdays) {
    if (lower.includes(`next ${day}`) || lower.includes(day)) {
      const today = new Date();
      const target = weekdays.indexOf(day);
      let diff = target - today.getDay();
      if (diff <= 0) diff += 7;
      return new Date(Date.now() + diff * 86400000).toISOString().split("T")[0];
    }
  }

  return null;
}

function extractTime(lower: string): string | null {
  const match = lower.match(
    /\b(\d{1,2}):(\d{2})\b|\b(\d{1,2})\s*a\.?m\.?|\b(\d{1,2})\s*p\.?m\.?/,
  );
  if (!match) return null;

  const full = match[0];
  let hour = 0,
    minute = 0;

  const colon = full.match(/^(\d{1,2}):(\d{2})$/);
  if (colon) {
    hour = parseInt(colon[1]);
    minute = parseInt(colon[2]);
  } else {
    hour = parseInt(full);
    if (/p\.?m\.?/.test(full) && hour < 12) hour += 12;
    if (/a\.?m\.?/.test(full) && hour === 12) hour = 0;
  }

  return (
    hour.toString().padStart(2, "0") + ":" + minute.toString().padStart(2, "0")
  );
}

// plain number fallback — "10" means 10:00 when picking a slot
function extractSlotNumber(lower: string): string | null {
  const match = lower.match(/\b(\d{1,2})\b/);
  if (!match) return null;
  const hour = parseInt(match[1]);
  if (hour < 0 || hour > 23) return null;
  return hour.toString().padStart(2, "0") + ":00";
}

// ─────────────────────────────────────────
// APPOINTMENT HELPERS
// ─────────────────────────────────────────

async function getUpcomingAppointments() {
  const profile = await getPatientProfile(patientId);
  if (!profile?.pastAppointments?.length) return [];

  const today = new Date(new Date().toDateString());
  return profile.pastAppointments
    .filter((a: any) => a.status === "confirmed" && new Date(a.date) >= today)
    .sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
}

function formatAppointments(list: any[]): string {
  if (!list.length) return "You have no upcoming appointments.";
  return list
    .map((a, i) => `${i + 1}. ${a.doctorId} on ${a.date} at ${a.time}`)
    .join("\n");
}

// ─────────────────────────────────────────
// MAIN AGENT
// ─────────────────────────────────────────

export async function runAgent(
  userInput: string,
  sessionId: string,
  language = "en",
) {
  console.log("\n---------------- AGENT ----------------");
  console.log("USER:", userInput);

  const session = await getSession(sessionId);
  const state = session?.conversationState || {};
  const stage = state.stage || STAGE.IDLE;
  const lower = userInput.toLowerCase();

  console.log("STAGE:", stage);

  // sync language preference
  const profile = await getPatientProfile(patientId);
  const effectiveLanguage = language ?? profile?.preferredLanguage ?? "en";
  if (profile?.preferredLanguage !== effectiveLanguage)
    await updatePreferredLanguage(patientId, effectiveLanguage);

  const updatedHistory = [
    ...(session?.history || []),
    { role: "user", content: userInput },
  ];

  // helper to save state
  async function save(newState: any) {
    await saveSession(sessionId, {
      conversationState: newState,
      history: updatedHistory,
    });
  }

  function respond(message: string) {
    console.log("AGENT:", message);
    return { message, language: effectiveLanguage };
  }

  // ───────────────────────────────────────
  // STAGE: IDLE — detect intent first
  // ───────────────────────────────────────

  if (stage === STAGE.IDLE) {
    const intent = await detectIntent(userInput, effectiveLanguage);
    console.log("INTENT:", intent);

    if (intent === "greet") {
      await save({ stage: STAGE.IDLE });
      return respond(
        "Hello! 👋 How can I help you today? I can book, reschedule, or cancel appointments, or show your upcoming appointments.",
      );
    }

    if (intent === "list") {
      const upcoming = await getUpcomingAppointments();
      await save({ stage: STAGE.IDLE });
      return respond(
        upcoming.length
          ? `Here are your upcoming appointments:\n${formatAppointments(upcoming)}`
          : "You have no upcoming appointments.",
      );
    }

    if (intent === "book") {
      // check if doctor already mentioned in same message
      const doctor = extractDoctor(lower);
      const date = extractDate(lower);

      if (doctor && date) {
        // have both — go straight to slots
        const slots = await tools.checkAvailability({ doctorId: doctor, date });
        await save({ stage: STAGE.BOOK_ASK_SLOT, doctorId: doctor, date });
        return {
          availableSlots: slots.availableSlots,
          language: effectiveLanguage,
        };
      }

      if (doctor && !date) {
        await save({ stage: STAGE.BOOK_ASK_DATE, doctorId: doctor });
        return respond(`Which date would you like to see the ${doctor}?`);
      }

      // no doctor yet — ask for it
      await save({ stage: STAGE.BOOK_ASK_DOCTOR });
      return respond(
        `Which doctor would you like to see?\nWe have: ${VALID_DOCTORS.join(", ")}.`,
      );
    }

    if (intent === "cancel") {
      const upcoming = await getUpcomingAppointments();

      if (!upcoming.length) {
        await save({ stage: STAGE.IDLE });
        return respond("You have no upcoming appointments to cancel.");
      }

      await save({
        stage: STAGE.CANCEL_CONFIRM,
        appointmentToCancel: upcoming[0],
      });
      return respond(
        upcoming.length === 1
          ? `Your upcoming appointment is with ${upcoming[0].doctorId} on ${upcoming[0].date} at ${upcoming[0].time}. Should I cancel it? (yes / no)`
          : `Here are your upcoming appointments:\n${formatAppointments(upcoming)}\n\nWhich one would you like to cancel? (say the number)`,
      );
    }

    if (intent === "reschedule") {
      const upcoming = await getUpcomingAppointments();

      if (!upcoming.length) {
        await save({ stage: STAGE.IDLE });
        return respond("You have no upcoming appointments to reschedule.");
      }

      await save({
        stage: STAGE.RESCHEDULE_ASK_DATE,
        appointmentToReschedule: upcoming[0],
      });
      return respond(
        upcoming.length === 1
          ? `Your upcoming appointment is with ${upcoming[0].doctorId} on ${upcoming[0].date} at ${upcoming[0].time}. What new date would you like?`
          : `Here are your upcoming appointments:\n${formatAppointments(upcoming)}\n\nWhich one would you like to reschedule? (say the number)`,
      );
    }

    // unknown intent
    await save({ stage: STAGE.IDLE });
    return respond(
      "I can help you book, reschedule, or cancel appointments, or show your upcoming appointments. What would you like to do?",
    );
  }

  // ───────────────────────────────────────
  // STAGE: BOOK — ask for doctor
  // ───────────────────────────────────────

  if (stage === STAGE.BOOK_ASK_DOCTOR) {
    const doctor = extractDoctor(lower);

    if (!doctor) {
      await save(state);
      return respond(
        `I didn't catch that. Please say one of: ${VALID_DOCTORS.join(", ")}.`,
      );
    }

    const date = extractDate(lower);

    if (date) {
      // user gave doctor and date in same reply — skip to slots
      const slots = await tools.checkAvailability({ doctorId: doctor, date });
      await save({ stage: STAGE.BOOK_ASK_SLOT, doctorId: doctor, date });
      return {
        availableSlots: slots.availableSlots,
        language: effectiveLanguage,
      };
    }

    await save({ stage: STAGE.BOOK_ASK_DATE, doctorId: doctor });
    return respond(`Which date would you like to see the ${doctor}?`);
  }

  // ───────────────────────────────────────
  // STAGE: BOOK — ask for date
  // ───────────────────────────────────────

  if (stage === STAGE.BOOK_ASK_DATE) {
    const date = extractDate(lower);

    if (!date) {
      await save(state);
      return respond(
        "I didn't catch the date. You can say something like 'tomorrow', 'next Monday', or '30th March'.",
      );
    }

    const slots = await tools.checkAvailability({
      doctorId: state.doctorId,
      date,
    });
    await save({ stage: STAGE.BOOK_ASK_SLOT, doctorId: state.doctorId, date });
    return {
      availableSlots: slots.availableSlots,
      language: effectiveLanguage,
    };
  }

  // ───────────────────────────────────────
  // STAGE: BOOK — user picks a slot
  // ───────────────────────────────────────

  if (stage === STAGE.BOOK_ASK_SLOT) {
    const time = extractTime(lower) ?? extractSlotNumber(lower);

    if (!time) {
      await save(state);
      return respond("Please say a time slot, like '10am' or '14:00'.");
    }

    const result = await tools.bookAppointment({
      patientId,
      doctorId: state.doctorId,
      date: state.date,
      time,
    });

    if (result.status === "confirmed") {
      await saveSession(sessionId, {
        conversationState: { stage: STAGE.IDLE },
        lastAppointment: { doctorId: state.doctorId, date: state.date, time },
        history: updatedHistory,
      });
      await recordAppointment(patientId, {
        doctorId: state.doctorId,
        date: state.date,
        time,
        status: "confirmed",
      });
      return respond(
        `✓ Appointment booked with ${state.doctorId} on ${state.date} at ${time}.`,
      );
    }

    if (result.message === "Cannot book an appointment in the past") {
      const alts = result.alternatives?.length
        ? ` Available slots: ${result.alternatives.join(", ")}.`
        : "";
      await save(state);
      return respond(
        `That time has already passed.${alts} Which slot works for you?`,
      );
    }

    if (result.status === "failed") {
      const alts = result.alternatives?.join(", ") ?? "none";
      await save(state);
      return respond(
        `That slot is taken. Available slots: ${alts}. Which works for you?`,
      );
    }

    await save({ stage: STAGE.IDLE });
    return respond("Something went wrong with the booking. Please try again.");
  }

  // ───────────────────────────────────────
  // STAGE: CANCEL — confirm which appointment
  // ───────────────────────────────────────

  if (stage === STAGE.CANCEL_CONFIRM) {
    const appt = state.appointmentToCancel;

    // user said yes / confirm
    if (/yes|confirm|cancel it|go ahead|sure|ok/.test(lower)) {
      await tools.cancelAppointment({
        patientId,
        doctorId: appt.doctorId,
        date: appt.date,
        time: appt.time,
      });
      await saveSession(sessionId, {
        conversationState: { stage: STAGE.IDLE },
        lastAppointment: null,
        history: updatedHistory,
      });
      await recordAppointment(patientId, { ...appt, status: "cancelled" });
      return respond(
        `✓ Your appointment with ${appt.doctorId} on ${appt.date} at ${appt.time} has been cancelled.`,
      );
    }

    // user picked a number from the list
    const numMatch = lower.match(/\b([1-9])\b/);
    if (numMatch) {
      const upcoming = await getUpcomingAppointments();
      const idx = parseInt(numMatch[1]) - 1;
      if (upcoming[idx]) {
        const chosen = upcoming[idx];
        await save({
          stage: STAGE.CANCEL_CONFIRM,
          appointmentToCancel: chosen,
        });
        return respond(
          `Cancel appointment with ${chosen.doctorId} on ${chosen.date} at ${chosen.time}? (yes / no)`,
        );
      }
    }

    // user said no
    if (/no|don't|keep/.test(lower)) {
      await save({ stage: STAGE.IDLE });
      return respond("No problem, your appointment has been kept.");
    }

    await save(state);
    return respond("Should I cancel this appointment? Please say yes or no.");
  }

  // ───────────────────────────────────────
  // STAGE: RESCHEDULE — ask for new date
  // ───────────────────────────────────────

  if (stage === STAGE.RESCHEDULE_ASK_DATE) {
    const appt = state.appointmentToReschedule;

    // user may have picked from a list first
    const numMatch = lower.match(/\b([1-9])\b/);
    if (numMatch && !extractDate(lower)) {
      const upcoming = await getUpcomingAppointments();
      const idx = parseInt(numMatch[1]) - 1;
      if (upcoming[idx]) {
        await save({
          stage: STAGE.RESCHEDULE_ASK_DATE,
          appointmentToReschedule: upcoming[idx],
        });
        return respond(
          `What new date would you like for your ${upcoming[idx].doctorId} appointment?`,
        );
      }
    }

    const newDate = extractDate(lower);

    if (!newDate) {
      await save(state);
      return respond(
        "I didn't catch the date. You can say 'tomorrow', 'next Monday', or '30th March'.",
      );
    }

    const slots = await tools.checkAvailability({
      doctorId: appt.doctorId,
      date: newDate,
    });
    await save({
      stage: STAGE.RESCHEDULE_ASK_SLOT,
      appointmentToReschedule: appt,
      newDate,
    });
    return {
      availableSlots: slots.availableSlots,
      language: effectiveLanguage,
    };
  }

  // ───────────────────────────────────────
  // STAGE: RESCHEDULE — user picks new slot
  // ───────────────────────────────────────

  if (stage === STAGE.RESCHEDULE_ASK_SLOT) {
    const appt = state.appointmentToReschedule;
    const newDate = state.newDate;
    const time = extractTime(lower) ?? extractSlotNumber(lower);

    if (!time) {
      await save(state);
      return respond("Please say a time slot, like '10am' or '14:00'.");
    }

    const result = await tools.rescheduleAppointment({
      appointmentId: appt.appointmentId,
      patientId,
      doctorId: appt.doctorId,
      newDate,
      newTime: time,
    });

    await saveSession(sessionId, {
      conversationState: { stage: STAGE.IDLE },
      lastAppointment: { doctorId: appt.doctorId, date: newDate, time },
      history: updatedHistory,
    });
    await recordAppointment(patientId, {
      doctorId: appt.doctorId,
      date: newDate,
      time,
      status: "rescheduled",
    });
    return respond(
      `✓ Appointment rescheduled with ${appt.doctorId} to ${newDate} at ${time}.`,
    );
  }

  // ───────────────────────────────────────
  // FALLBACK — reset to idle
  // ───────────────────────────────────────

  await save({ stage: STAGE.IDLE });
  return respond(
    "I can help you book, reschedule, or cancel appointments, or show your upcoming appointments. What would you like to do?",
  );
}
