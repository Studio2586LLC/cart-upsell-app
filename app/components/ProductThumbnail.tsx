import { useEffect, useState } from "react";
import styles from "../styles/design.module.css";

export function ProductThumbnail({
  src,
  alt = "",
  size = 40,
}: {
  src?: string | null;
  alt?: string;
  size?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [src]);

  return (
    <span className={styles.productThumbnail} style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <rect x="5" y="7" width="30" height="26" rx="2" stroke="currentColor" strokeWidth="2" />
        <circle cx="27" cy="15" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="m6 28 9-9 7 7 4-4 8 8" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {src && !imageFailed && (
        <img src={src} alt={alt} loading="lazy" onError={() => setImageFailed(true)} />
      )}
    </span>
  );
}
