import express from "express";
import { speechToText } from "../../services/speech_to_text/whisperService";

const router = express.Router();

router.post("/transcribe", async (req, res) => {
  const { audioPath } = req.body;

  const text = await speechToText(audioPath);

  res.json({
    transcript: text,
  });
});

export default router;
