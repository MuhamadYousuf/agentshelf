"use client";

import Image from "next/image";
import { useState } from "react";

export function ProductImage({
  imageId,
  title,
  category,
}: {
  imageId?: string;
  title: string;
  category: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(imageId) && !failed;
  return (
    <div
      aria-label={showImage ? `Image of ${title}` : `Image placeholder for ${title}`}
      className="product-art"
      data-category={category.toLowerCase()}
      role="img"
    >
      {showImage && imageId ? (
        <Image
          alt=""
          className="product-image"
          fill
          onError={() => setFailed(true)}
          sizes="(max-width: 640px) 100vw, (max-width: 980px) 50vw, 33vw"
          src={`/api/images/${imageId}`}
          unoptimized
        />
      ) : (
        <span className="product-art-mark">AS</span>
      )}
    </div>
  );
}
