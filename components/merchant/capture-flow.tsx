"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, Check, ImagePlus, LoaderCircle, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Photo = { file: File; url: string };
const steps = ["Uploading", "Reading your photos", "Writing the listing", "Policy check"];

async function downscaleImage(file: File, index: number): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser could not prepare this photo. Try another image.");
  }
  context.fillStyle = "#faf8f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error("Your browser could not prepare this photo. Try another image."));
    }, "image/jpeg", 0.85);
  });
  return new File([blob], `product-${index + 1}.jpg`, { type: "image/jpeg" });
}

export function CaptureFlow() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [hint, setHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    const next = Array.from(fileList);
    if (photos.length + next.length > 6) {
      setError("Use up to six photos of the same item.");
      return;
    }
    const created = next.map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...created]);
  }

  function removePhoto(index: number) {
    const photo = photos[index];
    if (photo) URL.revokeObjectURL(photo.url);
    setPhotos((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setError(null);
  }

  async function submit() {
    if (photos.length < 1 || drafting) return;
    setError(null);
    setDrafting(true);
    setActiveStep(0);
    const progressTimer = window.setInterval(() => {
      setActiveStep((step) => Math.min(step + 1, steps.length - 1));
    }, 1_300);

    try {
      const formData = new FormData();
      let total = 0;
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        if (!photo) continue;
        const downscaled = await downscaleImage(photo.file, index);
        total += downscaled.size;
        if (downscaled.size > 2 * 1024 * 1024) {
          throw new Error("One photo is still too large. Choose a smaller image.");
        }
        if (total > 4 * 1024 * 1024) {
          throw new Error("These photos add up to more than 4 MB. Remove a photo or choose smaller images.");
        }
        formData.append("images", downscaled);
      }
      formData.append("hint", hint.trim());

      const response = await fetch("/api/listings/draft", { method: "POST", body: formData });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
            ? result.message
            : "We couldn't draft this listing. Please try again.";
        throw new Error(message);
      }
      if (
        typeof result !== "object" ||
        result === null ||
        !("productId" in result) ||
        typeof result.productId !== "string"
      ) {
        throw new Error("The listing was saved, but we couldn't open it. Find it in your drafts.");
      }
      router.push(`/merchant/products/${result.productId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn't draft this listing. Please try again.");
      setDrafting(false);
    } finally {
      window.clearInterval(progressTimer);
    }
  }

  if (drafting) {
    return (
      <section aria-live="polite" className="capture-progress-panel">
        <div className="capture-progress-icon"><LoaderCircle aria-hidden="true" className="capture-spinner" /></div>
        <h2 className="capture-progress-title">Putting your listing together</h2>
        <p className="capture-progress-copy">We&apos;ll bring you to the review screen before anything is published.</p>
        <div aria-label={`Step ${activeStep + 1} of ${steps.length}`} className="capture-progress-track" role="progressbar" aria-valuemax={steps.length} aria-valuemin={1} aria-valuenow={activeStep + 1}>
          <motion.span animate={{ scaleX: (activeStep + 1) / steps.length }} initial={{ scaleX: 0 }} transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }} />
        </div>
        <ol className="capture-steps">
          {steps.map((step, index) => {
            const complete = index < activeStep;
            const current = index === activeStep;
            return (
              <motion.li
                animate={{ opacity: current || complete ? 1 : 0.58 }}
                aria-current={current ? "step" : undefined}
                className={current ? "is-active" : complete ? "is-complete" : ""}
                initial={{ opacity: 0.4, x: 5 }}
                key={step}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="capture-step-marker">{complete ? <Check aria-hidden="true" size={14} /> : index + 1}</span>
                <span>{step}</span>
              </motion.li>
            );
          })}
        </ol>
      </section>
    );
  }

  return (
    <div className="capture-layout">
      <section className="capture-workspace">
        <input
          ref={inputRef}
          accept="image/*"
          capture="environment"
          className="sr-only"
          multiple
          onChange={(event) => {
            addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
          type="file"
        />
        <button
          className="capture-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            addFiles(event.dataTransfer.files);
          }}
          type="button"
        >
          <span className="capture-drop-icon"><ImagePlus aria-hidden="true" size={25} strokeWidth={1.7} /></span>
          <span className="capture-drop-title">Add photos of one item</span>
          <span className="capture-drop-copy">Take a photo or choose up to 6 images</span>
          <span className="capture-drop-action"><ArrowUp aria-hidden="true" size={15} /> Choose photos</span>
        </button>

        <AnimatePresence initial={false}>
          {photos.length > 0 && (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="capture-photo-strip"
              exit={{ opacity: 0, y: -8 }}
              initial={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {photos.map((photo, index) => (
                <div className="capture-photo" key={photo.url}>
                  <Image alt={`Selected product photo ${index + 1}`} height={274} src={photo.url} unoptimized width={320} />
                  <button aria-label={`Remove photo ${index + 1}`} className="capture-photo-remove" onClick={() => removePhoto(index)} type="button">
                    <X aria-hidden="true" size={15} />
                  </button>
                  <span className="capture-photo-index">{String(index + 1).padStart(2, "0")}</span>
                </div>
              ))}
              {photos.length < 6 && (
                <button aria-label="Add another photo" className="capture-add-photo" onClick={() => inputRef.current?.click()} type="button">
                  <ImagePlus aria-hidden="true" size={19} /><span>Add</span>
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="capture-hint-field">
          <label htmlFor="capture-hint">Anything the photos don&apos;t show?</label>
          <Input
            id="capture-hint"
            maxLength={500}
            onChange={(event) => setHint(event.currentTarget.value)}
            placeholder="12 oz, dishwasher safe, made from reclaimed clay…"
            value={hint}
          />
          <span>Optional details help the draft stay accurate.</span>
        </div>

        {error && <p className="capture-error" role="alert">{error}</p>}

        <div className="capture-submit-row">
          <span className="capture-private-note">Nothing goes live until you publish it.</span>
          <Button className="capture-submit" disabled={photos.length === 0} onClick={submit} size="lg" type="button">
            Draft my listing <ArrowUp aria-hidden="true" size={16} />
          </Button>
        </div>
      </section>

      <aside className="capture-side-note">
        <span className="capture-side-number">01—06</span>
        <h2>One item, a few clear angles.</h2>
        <p>Front, side, and detail shots give the draft a better sense of shape, color, and finish.</p>
        <div className="capture-side-rule" />
        <p className="capture-side-small">Your photos are resized and cleaned before they&apos;re saved.</p>
      </aside>
    </div>
  );
}
