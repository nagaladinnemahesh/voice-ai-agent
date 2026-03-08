/* ═══════════════════════════════════════════
   2CARE.AI — Voice Client
   voiceClient.js

   IMPORTANT: Open via http://localhost:5000
   NOT as a local file (file://) — WebSocket
   and microphone both require http context.
═══════════════════════════════════════════ */

// ── WebSocket ──
// connects back to the same host that served this page
const wsUrl = `ws://${window.location.hostname}:${window.location.port || 5000}`;
const ws = new WebSocket(wsUrl);

let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let isProcessing = false;
let msgCount = 0;

// ── DOM refs ──
const stage = document.getElementById("stage");
const micBtn = document.getElementById("micBtn");
const wave = document.getElementById("wave");
const pill = document.getElementById("pill");
const statusTxt = document.getElementById("statusText");
const hintTxt = document.getElementById("hintText");
const chatBody = document.getElementById("chatBody");
const typing = document.getElementById("typing");
const emptyState = document.getElementById("emptyState");
const msgCountEl = document.getElementById("msgCount");
const connStatus = document.getElementById("connStatus");

// ══════════════════════════════════════════
// BASE64 HELPER
// btoa(String.fromCharCode(...array)) crashes
// on large audio buffers due to call stack limit.
// This chunks it safely.
// ══════════════════════════════════════════

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ══════════════════════════════════════════
// STATE TRANSITIONS
// ══════════════════════════════════════════

function setState(s) {
  stage.className = "mic-stage";
  pill.className = "status-pill";
  wave.style.opacity = "0";

  if (s === "idle") {
    stage.classList.add("idle-anim");
    pill.classList.add("idle");
    statusTxt.textContent = "Ready";
    hintTxt.textContent = "Tap microphone to speak";
    typing.classList.remove("show");
    isRecording = false;
    isProcessing = false;
  } else if (s === "recording") {
    stage.classList.add("rec-anim");
    pill.classList.add("recording");
    wave.style.opacity = "1";
    statusTxt.textContent = "Listening...";
    hintTxt.textContent = "Tap again to send";
    isRecording = true;
  } else if (s === "processing") {
    stage.classList.add("proc-anim");
    pill.classList.add("processing");
    statusTxt.textContent = "Processing...";
    hintTxt.textContent = "Generating response";
    typing.classList.add("show");
    chatBody.scrollTop = chatBody.scrollHeight;
    isProcessing = true;
  } else if (s === "speaking") {
    stage.classList.add("idle-anim");
    pill.classList.add("speaking");
    statusTxt.textContent = "Speaking...";
    hintTxt.textContent = "Playing audio response";
    typing.classList.remove("show");
  }
}

// ══════════════════════════════════════════
// CHAT HELPERS
// ══════════════════════════════════════════

function addMsg(role, text) {
  emptyState.style.display = "none";
  msgCount++;
  msgCountEl.textContent =
    msgCount + (msgCount === 1 ? " message" : " messages");

  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const wrap = document.createElement("div");
  wrap.className = "msg " + role;

  wrap.innerHTML = `
    <div class="msg-meta">
      <div class="meta-dot"></div>
      ${role === "user" ? "You" : "Assistant"}
      <span style="margin-left:auto;font-size:9px">${time}</span>
    </div>
    <div class="bubble">${text}</div>
  `;

  chatBody.appendChild(wrap);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// converts agent response object → human-readable string for display
function parseResponse(res) {
  if (!res) return "Sorry, I couldn't process that.";

  if (res.message) return res.message;

  if (res.availableSlots)
    return `Available slots: ${res.availableSlots.join(", ")}. Which one works for you?`;

  if (res.tool === "bookAppointment") {
    if (res.result?.status === "confirmed")
      return `✓ Booked — ${res.result.doctorId} on ${res.result.date} at ${res.result.time}.`;
    if (res.result?.message === "Cannot book an appointment in the past") {
      const alts = res.result.alternatives?.length
        ? ` Try: ${res.result.alternatives.join(", ")}.`
        : "";
      return `That time has already passed.${alts}`;
    }
    if (res.result?.status === "failed")
      return `Slot unavailable. Available: ${res.result.alternatives?.join(", ") ?? "none"}.`;
  }

  if (res.tool === "cancelAppointment")
    return "✓ Your appointment has been cancelled.";

  if (
    res.tool === "rescheduleAppointment" &&
    res.result?.status === "confirmed"
  )
    return `✓ Rescheduled to ${res.result.date} at ${res.result.time}.`;

  return "Sorry, I couldn't process your request.";
}

// ══════════════════════════════════════════
// WEBSOCKET
// ══════════════════════════════════════════

ws.onopen = () => {
  console.log("✓ WebSocket connected to", wsUrl);
  connStatus.textContent = "Connected · Real-time voice processing";
  setState("idle");
};

ws.onclose = (e) => {
  console.warn("✗ WebSocket closed", e.code, e.reason);
  connStatus.textContent = "Disconnected — please refresh";
  setState("idle");
};

ws.onerror = (e) => {
  console.error("✗ WebSocket error:", e);
  connStatus.textContent = "Connection error — is the server running?";
  addMsg(
    "agent",
    "Cannot connect to server. Make sure it is running on port 5000.",
  );
  setState("idle");
};

ws.onmessage = async (e) => {
  const data = JSON.parse(e.data);
  console.log("← SERVER:", data);

  if (data.error) {
    addMsg("agent", `Error: ${data.error}`);
    setState("idle");
    return;
  }

  if (data.transcript) addMsg("user", data.transcript);

  const text = parseResponse(data.response);
  addMsg("agent", text);

  if (data.audioBase64) {
    setState("speaking");
    const audio = new Audio(`data:audio/mp3;base64,${data.audioBase64}`);
    audio.play().catch((err) => {
      console.warn("Audio play failed:", err);
    });
    audio.onended = () => setState("idle");
  } else {
    setState("idle");
  }
};

// ══════════════════════════════════════════
// RECORDING
// ══════════════════════════════════════════

async function startRecording() {
  if (isProcessing) return;
  audioChunks = [];

  // check mic permissions explicitly so error is visible
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.error("Microphone access denied:", err);
    addMsg(
      "agent",
      "Microphone access denied. Click the padlock in the address bar and allow microphone.",
    );
    setState("idle");
    return;
  }

  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    setState("processing");

    const blob = new Blob(audioChunks, { type: "audio/webm" });
    console.log("→ Sending audio:", blob.size, "bytes");

    const ab = await blob.arrayBuffer();
    // FIX: chunked base64 encoding — avoids call stack crash on large buffers
    const b64 = arrayBufferToBase64(ab);

    ws.send(JSON.stringify({ audioBase64: b64, sessionId: "user123" }));
    stream.getTracks().forEach((t) => t.stop());
  };

  mediaRecorder.start();
  setState("recording");
  console.log("● Recording started");
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    console.log("■ Recording stopped");
  }
}

// tap to toggle record / stop
micBtn.addEventListener("click", () => {
  if (isProcessing) return;
  isRecording ? stopRecording() : startRecording();
});
