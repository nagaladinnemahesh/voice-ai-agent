import express from "express";
import { textToSpeech } from "../../services/text_to_speech/openaiTTS";

const router = express.Router();

router.post("/speak", async (req, res) => {
  const { text } = req.body;

  const filePath = "./audioSamples/response.wav";

  const audioPath = await textToSpeech(text, filePath);

  res.json({
    audio: audioPath,
  });
});

export default router;
