import express from "express";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";

const router = express.Router();

// accepts text and optional language, returns base64 audio
router.post("/speak", async (req, res) => {
  const { text, language = "en" } = req.body;

  if (!text) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const audioBuffer = await textToSpeech(text, language);

  res.json({ audio: audioBuffer.toString("base64") });
});

export default router;
