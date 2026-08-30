import { useEffect, useState } from "react";
import { initials } from "../lib/format";

export default function Avatar({ src, name = "", size = 48, online = false, ring = false }) {
  // Track load failure in state: simply hiding a broken <img> would leave an
  // empty circle, so we fall through to the initials placeholder instead.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  const px = { width: size, height: size };
  const dot = Math.max(10, Math.round(size * 0.26));
  const showImage = src && !broken;

  return (
    <div className="relative shrink-0" style={px}>
      {showImage ? (
        <img
          src={src}
          alt={name}
          style={px}
          onError={() => setBroken(true)}
          className={`rounded-full object-cover ${ring ? "ring-2 ring-wa-green/40" : ""}`}
        />
      ) : (
        <div
          style={{ ...px, fontSize: size * 0.36 }}
          className="grid place-items-center rounded-full bg-wa-green/15 font-semibold text-wa-greenDark dark:bg-wa-green/25 dark:text-wa-bubble"
        >
          {initials(name) || "?"}
        </div>
      )}
      {online && (
        <span
          style={{ width: dot, height: dot }}
          className="absolute bottom-0 right-0 rounded-full border-2 border-white bg-wa-green dark:border-wa-panelDark"
        />
      )}
    </div>
  );
}
