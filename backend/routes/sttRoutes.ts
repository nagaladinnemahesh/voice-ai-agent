import express from "express";
import { speechToText } from "../../services/speech_to_text/whisperService";

const router = express.Router();

// accepts base64 audio and returns transcript
router.post("/transcribe", async (req, res) => {
  const { audioBase64 } = req.body;

  if (!audioBase64) {
    res.status(400).json({ error: "audioBase64 is required" });
    return;
  }

  const audioBuffer = Buffer.from(audioBase64, "base64");
  const text = await speechToText(audioBuffer);

  res.json({ transcript: text });
});

export default router;
