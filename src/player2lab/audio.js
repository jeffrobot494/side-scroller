// Player2 Lab — audio bytes. (tech/player2-lab.md)
//
// Every STT input is re-encoded to 16-bit PCM WAV before sending, whatever it
// came from (mic webm, an uploaded file, a TTS run's mp3/ogg/pcm). The encoder
// is pure; decoding goes through whatever AudioContext-like object is passed.

// Mono Float32 samples -> 16-bit PCM WAV bytes.
export function encodeWav(samples, sampleRate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const dv = new DataView(buf);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i)); };
  str(0, "RIFF");
  dv.setUint32(4, 36 + n * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * 2, true); // byte rate
  dv.setUint16(32, 2, true); // block align
  dv.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}

// Raw 16-bit little-endian mono PCM -> WAV bytes (TTS `pcm` carries no header).
export function pcmToWav(bytes, sampleRate) {
  const even = bytes.length - (bytes.length % 2);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, even);
  const samples = new Float32Array(even / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = dv.getInt16(i * 2, true) / 0x8000;
  return encodeWav(samples, sampleRate);
}

// Average the channels of a decoded buffer into one.
export function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length;
  return out;
}

// Decode any browser-decodable audio and re-encode it as mono WAV. `ctx` is an
// AudioContext/OfflineAudioContext; its sample rate is the rate sent.
export async function decodeToWav(bytes, ctx) {
  const copy = bytes.slice().buffer; // decodeAudioData detaches its input
  const decoded = await ctx.decodeAudioData(copy);
  const channels = [];
  for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c));
  return { wav: encodeWav(toMono(channels), decoded.sampleRate), sampleRate: decoded.sampleRate, seconds: decoded.duration };
}

// For a file the browser cannot decode: send it as-is, with the STT encoding
// guessed from its name or type. Null when there is no sensible guess.
export function guessEncoding(name = "", mime = "") {
  const ext = String(name).toLowerCase().split(".").pop();
  const byExt = { wav: "wav", mp3: "mp3", flac: "flac", opus: "opus", ogg: "opus", webm: "opus", m4a: "mp4", mp4: "mp4", pcm: "linear16", raw: "linear16" };
  if (byExt[ext]) return byExt[ext];
  const m = String(mime).toLowerCase();
  if (m.includes("wav")) return "wav";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("flac")) return "flac";
  if (m.includes("ogg") || m.includes("opus") || m.includes("webm")) return "opus";
  if (m.includes("mp4") || m.includes("aac")) return "mp4";
  return null;
}

// TTS audio_format -> the MIME type a browser plays it as.
export const FORMAT_MIME = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  opus: "audio/ogg",
  ogg: "audio/ogg",
  flac: "audio/flac",
  pcm: "audio/wav", // after pcmToWav
};

export function base64ToBytes(b64) {
  const bin = atob(String(b64).replace(/^data:[^,]*,/, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function concatBytes(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
