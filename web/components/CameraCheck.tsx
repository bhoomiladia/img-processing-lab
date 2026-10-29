"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCamera } from "@/lib/camera";
import { loadLandmarker, readPose } from "@/lib/facePose";

type Status = "pending" | "ok" | "fail";

/** Verifies the device is kiosk-ready: camera, face tracker, a face in frame, distance and lighting. */
export default function CameraCheck({ onResult }: { onResult?: (allOk: boolean) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useCamera(videoRef);
  const [tracker, setTracker] = useState<Status>("pending");
  const [face, setFace] = useState<Status>("pending");
  const [distance, setDistance] = useState<Status>("pending");
  const [light, setLight] = useState<{ s: Status; note: string }>({ s: "pending", note: "" });

  useEffect(() => {
    if (!camera.ready) return;
    let stopped = false;
    let timer = 0;
    const sample = document.createElement("canvas");
    sample.width = 64;
    sample.height = 36;
    const ctx = sample.getContext("2d", { willReadFrequently: true })!;
    loadLandmarker()
      .then((lm) => {
        setTracker("ok");
        const tick = () => {
          if (stopped) return;
          const video = videoRef.current!;
          const r = readPose(lm, video, performance.now());
          setFace(r.faces === 1 ? "ok" : "fail");
          setDistance(r.faces === 1 ? (r.size > 0.15 ? "ok" : "fail") : "pending");
          ctx.drawImage(video, 0, 0, sample.width, sample.height);
          const px = ctx.getImageData(0, 0, sample.width, sample.height).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
          const lum = sum / (px.length / 4);
          setLight(lum < 55 ? { s: "fail", note: "Too dark: add light in front of the face" } : lum > 205 ? { s: "fail", note: "Too bright: avoid a window behind the camera" } : { s: "ok", note: "" });
          timer = window.setTimeout(tick, 200);
        };
        tick();
      })
      .catch(() => setTracker("fail"));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [camera.ready]);

  const cameraStatus: Status = camera.error ? "fail" : camera.ready ? "ok" : "pending";
  const allOk = [cameraStatus, tracker, face, distance, light.s].every((s) => s === "ok");
  useEffect(() => onResult?.(allOk), [allOk, onResult]);

  const rows: [string, Status, string][] = [
    ["Camera access", cameraStatus, camera.error ?? ""],
    ["Face tracker loaded", tracker, tracker === "fail" ? "Check the internet connection" : ""],
    ["One face in view", face, face === "fail" ? "Sit in front of the camera, alone in frame" : ""],
    ["Good distance", distance, distance === "fail" ? "Move closer, about an arm's length" : ""],
    ["Lighting", light.s, light.note],
  ];

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="camera">
        <video ref={videoRef} playsInline muted />
        <div className={`frame ${face === "ok" && distance === "ok" ? "good" : ""}`}>
          <span className="oval" /><i /><i /><i /><i />
        </div>
        <span className="live">LIVE</span>
      </div>
      <div className="card" style={{ margin: 0 }}>
        <h2>Device check</h2>
        {rows.map(([label, s, note]) => (
          <div key={label} className="check-row">
            {s === "ok" ? <CheckCircle2 size={20} color="var(--teal)" />
              : s === "fail" ? <XCircle size={20} color="var(--bad)" />
              : cameraStatus === "ok" && label !== "Camera access" ? <Loader2 size={20} color="var(--muted)" className="spin" />
              : <Circle size={20} color="var(--border)" />}
            <span>{label}</span>
            {note && <span className="s" style={{ color: s === "fail" ? "var(--bad)" : "var(--muted)" }}>{note}</span>}
          </div>
        ))}
        {allOk && <div className="alert ok" style={{ margin: "1rem 0 0" }}>This device is ready to be the attendance kiosk.</div>}
      </div>
    </div>
  );
}
