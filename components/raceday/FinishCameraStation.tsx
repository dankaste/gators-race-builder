"use client";

import { useEffect, useRef, useState } from "react";
import { StationShell } from "./StationShell";
import { useRaceDayToken } from "@/lib/raceday/useRaceDayToken";

function CameraBody({ projectId, token, eventId }: { projectId: string; token: string; eventId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [clips, setClips] = useState<{ id: string; label: string; sizeMb: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  function start() {
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    if (!stream) return;
    chunksRef.current = [];
    startedAtRef.current = new Date().toISOString();
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const form = new FormData();
      form.set("eventId", eventId);
      form.set("device", "finish-camera");
      form.set("startedAt", startedAtRef.current ?? new Date().toISOString());
      form.set("durationSeconds", String(seconds));
      form.set("file", blob, "clip.webm");
      const res = await fetch(`/api/raceday/${projectId}/videos`, {
        method: "POST",
        headers: { "x-raceday-token": token },
        body: form,
      });
      if (res.ok) {
        setClips((prev) => [
          { id: crypto.randomUUID(), label: `${seconds}s recorded`, sizeMb: Math.round(blob.size / 1e6) },
          ...prev,
        ]);
      }
      setSeconds(0);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
            recording ? "bg-danger text-background" : "bg-black/50 text-white"
          }`}
        >
          {recording ? `⏺ REC ${seconds}s` : "STANDBY"}
        </span>
      </div>
      {error && <p className="text-xs text-danger">Camera unavailable: {error}</p>}
      <button
        onClick={recording ? stop : start}
        className={`rounded-lg px-4 py-3 text-sm font-bold ${
          recording ? "border border-danger text-danger" : "bg-danger text-background"
        }`}
      >
        {recording ? "⏹ Stop recording" : "⏺ Start recording"}
      </button>
      <div className="text-xs font-bold uppercase tracking-wide text-muted">
        Saved clips — stored on the hub, not uploaded to the cloud
      </div>
      <div className="flex flex-col gap-1.5">
        {clips.map((c) => (
          <div key={c.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
            {c.label} · ~{c.sizeMb} MB
          </div>
        ))}
      </div>
    </div>
  );
}

export function FinishCameraStation({ projectId }: { projectId: string }) {
  const token = useRaceDayToken(projectId);

  return (
    <StationShell projectId={projectId} title="Finish — camera">
      {(snapshot) =>
        token && snapshot.event ? (
          <CameraBody projectId={projectId} token={token} eventId={snapshot.event.id} />
        ) : (
          <p className="text-sm text-muted">No event configured for this project.</p>
        )
      }
    </StationShell>
  );
}
