"use client";

import { useCallback, useRef, useState } from "react";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

type Props = {
  src: string;
  aspect: number; // 1 for avatar, 16/9 for banner
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

export function ImageCropModal({ src, aspect, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    const initial = centerCrop(makeAspectCrop({ unit: "%", width: 90 }, aspect, w, h), w, h);
    setCrop(initial);
    setCompletedCrop(initial);
  }

  const confirm = useCallback(async () => {
    const img = imgRef.current;
    if (!img || !completedCrop) return;

    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const canvas = document.createElement("canvas");
    const px = completedCrop.unit === "%" ? (completedCrop.x / 100) * img.width : completedCrop.x;
    const py = completedCrop.unit === "%" ? (completedCrop.y / 100) * img.height : completedCrop.y;
    const pw = completedCrop.unit === "%" ? (completedCrop.width / 100) * img.width : completedCrop.width;
    const ph = completedCrop.unit === "%" ? (completedCrop.height / 100) * img.height : completedCrop.height;

    canvas.width = Math.round(pw * scaleX);
    canvas.height = Math.round(ph * scaleY);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(img, px * scaleX, py * scaleY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], "crop.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  }, [completedCrop, onConfirm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-hidden rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-neutral-800">이미지 크롭</h2>

        <div className="overflow-auto">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
            className="max-w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={src} alt="" onLoad={onImageLoad} className="max-w-full" />
          </ReactCrop>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirm}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
