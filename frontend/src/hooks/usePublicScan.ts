import { useState, useRef, useCallback } from "react";
import type { ScanResult } from "@/types/scan";

type PublicScanStep = "upload" | "processing" | "review";

const CLIENT_UPLOAD_LONG_EDGE = 2000;
const CLIENT_UPLOAD_QUALITY = 0.8;

async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif") return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode image"));
      el.src = objectUrl;
    });

    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    if (!srcW || !srcH) return file;

    const longEdge = Math.max(srcW, srcH);
    const scale = longEdge > CLIENT_UPLOAD_LONG_EDGE ? CLIENT_UPLOAD_LONG_EDGE / longEdge : 1;
    const outW = Math.max(1, Math.round(srcW * scale));
    const outH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, outW, outH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CLIENT_UPLOAD_QUALITY)
    );
    if (!blob) return file;

    const base = file.name.replace(/\.[^.]+$/, "") || "upload";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function usePublicScan() {
  const [step, setStep] = useState<PublicScanStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [userContext, setUserContext] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prefetchedOcrText = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const activePrefetch = useRef<string | null>(null);

  // Synchronous — fires OCR in a nested fire-and-forget IIFE, matching useScan pattern
  const handleFile = useCallback((f: File) => {
    const fileId = `${f.name}-${f.size}-${Date.now()}`;
    activePrefetch.current = fileId;
    prefetchedOcrText.current = null;
    setError(null);

    void (async () => {
      const processed = await compressImageForUpload(f);
      if (activePrefetch.current !== fileId) return;

      // Revoke previous preview
      if (previewUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const url = URL.createObjectURL(processed);
      previewUrlRef.current = url;
      setFile(processed);
      setPreview(url);

      // Kick off OCR immediately in the background
      void (async () => {
        try {
          const form = new FormData();
          form.append("file", processed);
          const res = await fetch("/api/scan/ocr", {
            method: "POST",
            credentials: "include",
            body: form,
          });
          if (res.ok) {
            const { ocr_text } = await res.json() as { ocr_text: string };
            if (activePrefetch.current === fileId) {
              prefetchedOcrText.current = ocr_text;
            }
          }
        } catch {
          // Prefetch failed silently — extract will run OCR itself
        }
      })();
    })();
  }, []);

  const handleExtract = useCallback(async () => {
    if (!file) return;
    setError(null);
    setStep("processing");
    setExtracting(true);

    try {
      const form = new FormData();
      form.append("file", file);
      if (userContext.trim()) form.append("user_context", userContext.trim());
      if (prefetchedOcrText.current) form.append("ocr_text", prefetchedOcrText.current);

      const res = await fetch("/api/scan/extract", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { detail?: string }).detail ?? "Extraction failed. Please try again.");
      }
      const data: ScanResult = await res.json();
      setResult(data);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed. Please try again.");
      setStep("upload");
    } finally {
      setExtracting(false);
    }
  }, [file, userContext]);

  const reset = useCallback(() => {
    activePrefetch.current = null;
    prefetchedOcrText.current = null;
    if (previewUrlRef.current?.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = null;
    setStep("upload");
    setFile(null);
    setPreview(null);
    setUserContext("");
    setResult(null);
    setError(null);
    setExtracting(false);
  }, []);

  return {
    step,
    file,
    preview,
    userContext,
    setUserContext,
    extracting,
    result,
    error,
    handleFile,
    handleExtract,
    reset,
  };
}
