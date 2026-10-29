"use client";

import { useEffect, useState, type RefObject } from "react";

export function useCamera(videoRef: RefObject<HTMLVideoElement | null>) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera access needs HTTPS (or localhost). Open this page over https://");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (e) {
        setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera permission was denied" : "Could not open the camera");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [videoRef]);

  return { ready, error };
}

const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;

/** Grab the current frame as JPEG. Unmirrored: the server's pose maths assumes the raw camera view. */
export function captureFrame(video: HTMLVideoElement, maxWidth = 960): Promise<Blob> {
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas!.width = Math.round(video.videoWidth * scale);
  canvas!.height = Math.round(video.videoHeight * scale);
  canvas!.getContext("2d")!.drawImage(video, 0, 0, canvas!.width, canvas!.height);
  return new Promise((resolve, reject) =>
    canvas!.toBlob((b) => (b ? resolve(b) : reject(new Error("capture failed"))), "image/jpeg", 0.9),
  );
}
