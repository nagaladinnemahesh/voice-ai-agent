const ws = new WebSocket("ws://localhost:5000");

let mediaRecorder;
let audioChunks = [];

const status = document.getElementById("status");
const transcriptUI = document.getElementById("transcript");
const assistantUI = document.getElementById("assistant");

ws.onopen = () => {
  console.log("Connected to voice gateway");
};

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  console.log("SERVER RESPONSE:", data);

  // show transcript
  transcriptUI.innerText = data.transcript || "";

  // convert backend response to readable text
  let assistantText = "";

  const res = data.response;

  if (res?.message) {
    assistantText = res.message;
  } else if (res?.availableSlots) {
    assistantText = `Available slots are ${res.availableSlots.join(", ")}`;
  } else if (res?.result?.status === "confirmed") {
    assistantText = "Your appointment has been successfully booked.";
  } else if (res?.result?.status === "failed") {
    assistantText = `That slot is unavailable. Available slots are ${res.result.alternatives.join(", ")}`;
  } else {
    assistantText = "Sorry, I couldn't process your request.";
  }

  assistantUI.innerText = assistantText;

  status.innerText = "Status: Playing response";

  // play audio response
  if (data.audioBase64) {
    const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);

    audio.play();

    audio.onended = () => {
      status.innerText = "Status: Idle";
    };
  }
};

document.getElementById("startBtn").onclick = async () => {
  status.innerText = "Status: Recording...";

  transcriptUI.innerText = "";
  assistantUI.innerText = "";

  audioChunks = [];

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    status.innerText = "Status: Processing...";

    const blob = new Blob(audioChunks, { type: "audio/webm" });

    const arrayBuffer = await blob.arrayBuffer();

    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(arrayBuffer)),
    );

    ws.send(
      JSON.stringify({
        audioBase64: base64Audio,
        sessionId: "user123",
      }),
    );
  };

  mediaRecorder.start();
};

document.getElementById("stopBtn").onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
};
