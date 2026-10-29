"use client";

import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from "@mediapipe/tasks-vision";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let loading: Promise<FaceLandmarker> | null = null;
let consoleFiltered = false;

/** MediaPipe's wasm prints routine "INFO: …" lines via console.error; the Next dev overlay reports those as errors. */
function filterMediapipeInfoLogs() {
  if (consoleFiltered) return;
  consoleFiltered = true;
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && args[0].startsWith("INFO: ")) return;
    original(...args);
  };
}

export function loadLandmarker(): Promise<FaceLandmarker> {
  filterMediapipeInfoLogs();
  loading ??=FilesetResolver.forVisionTasks(WASM_URL).then(async (fileset) => {
    const create = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numFaces: 2,
      });
    try {
      return await create("GPU");
    } catch {
      return create("CPU"); // no WebGL (some kiosks, VMs, locked-down browsers)
    }
  });
  loading.catch(() => (loading = null));
  return loading;
}

export interface PoseReading {
  faces: number;
  /** Degrees. Positive = subject turned to *their* left (same convention as the server). */
  yaw: number;
  /** Degrees. Positive = subject looking up. */
  pitch: number;
  /** Face width as a fraction of frame width. */
  size: number;
}

const deg = (r: number) => (r * 180) / Math.PI;

/**
 * Head pose from the 3D mesh, computed on the raw (unmirrored) video.
 * Yaw: depth difference across the outer eye corners (33 = subject's right, 263 = left).
 * Pitch: depth difference between forehead (10) and chin (152).
 * MediaPipe z shares x's scale, so both are converted to pixels before taking angles.
 */
function poseFrom(lm: NormalizedLandmark[], w: number, h: number) {
  const r = lm[33], l = lm[263], top = lm[10], chin = lm[152];
  const yaw = deg(Math.atan2((l.z - r.z) * w, (l.x - r.x) * w));
  const pitch = deg(Math.atan2(-(chin.z - top.z) * w, (chin.y - top.y) * h));
  let minX = 1, maxX = 0;
  for (const p of lm) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  return { yaw, pitch, size: maxX - minX };
}

export function readPose(landmarker: FaceLandmarker, video: HTMLVideoElement, now: number): PoseReading {
  const res = landmarker.detectForVideo(video, now);
  const faces = res.faceLandmarks.length;
  if (faces === 0) return { faces, yaw: 0, pitch: 0, size: 0 };
  return { faces, ...poseFrom(res.faceLandmarks[0], video.videoWidth, video.videoHeight) };
}
