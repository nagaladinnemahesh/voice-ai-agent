import express from "express";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";

const router = express.Router();

router.post("/speak", async (req, res) => {
  const { text } = req.body;

  const filePath = "./audioSamples/response.wav";

  const audioBuffer = await textToSpeech(text);

  res.json({
    audio: audioBuffer.toString("base64"),
  });
});

export default router;
