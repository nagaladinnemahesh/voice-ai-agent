import { getPatientProfile } from "../../memory/persistent_memory/Persistentmemorymanager";

// opening messages per campaign type and language
const openingMessages: Record<string, Record<string, Function>> = {
  reminder: {
    en: (date: string, time: string, doctor: string) =>
      `Hello, this is a reminder about your appointment with ${doctor} on ${date} at ${time}. Would you like to confirm, reschedule, or cancel?`,
    hi: (date: string, time: string, doctor: string) =>
      `नमस्ते, यह ${doctor} के साथ आपकी ${date} को ${time} बजे अपॉइंटमेंट की याद दिलाने के लिए है। क्या आप इसे कन्फर्म, बदलना या रद्द करना चाहते हैं?`,
    ta: (date: string, time: string, doctor: string) =>
      `வணக்கம், உங்கள் ${doctor} உடனான ${date} தேதி ${time} மணிக்கு சந்திப்பு நினைவூட்டல். உறுதிப்படுத்த, மாற்ற அல்லது ரத்து செய்ய விரும்புகிறீர்களா?`,
  },
  followup: {
    en: () =>
      `Hello, we are checking in after your recent appointment. How are you feeling? Would you like to book a follow-up?`,
    hi: () =>
      `नमस्ते, हम आपकी हाल की अपॉइंटमेंट के बाद जांच कर रहे हैं। आप कैसा महसूस कर रहे हैं? क्या आप फॉलो-अप बुक करना चाहते हैं?`,
    ta: () =>
      `வணக்கம், உங்கள் சமீபத்திய சந்திப்புக்குப் பிறகு நலம் விசாரிக்கிறோம். ஒரு தொடர் சந்திப்பை பதிவு செய்ய விரும்புகிறீர்களா?`,
  },
  vaccination: {
    en: () =>
      `Hello, this is a reminder that your vaccination is due. Would you like to book an appointment?`,
    hi: () =>
      `नमस्ते, आपका टीकाकरण बाकी है। क्या आप अपॉइंटमेंट बुक करना चाहेंगे?`,
    ta: () =>
      `வணக்கம், உங்கள் தடுப்பூசி தேதி வந்துவிட்டது. சந்திப்பு பதிவு செய்ய விரும்புகிறீர்களா?`,
  },
};

export async function buildCampaignOpeningMessage(campaign: any) {
  const { type, language, appointmentDate, appointmentTime, doctorId } =
    campaign;
  const template =
    openingMessages[type]?.[language] ?? openingMessages[type]?.["en"];
  return template(
    appointmentDate ?? "",
    appointmentTime ?? "",
    doctorId ?? "the doctor",
  );
}

export async function resolveCampaignLanguage(patientId: string) {
  const profile = await getPatientProfile(patientId);
  return profile?.preferredLanguage ?? "en";
}
