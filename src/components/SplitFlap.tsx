"use client";

import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const FLIP_DURATION_MS = 360;

function FlapCell({ char, reducedMotion }: { char: string; reducedMotion: boolean }) {
  const [prevChar, setPrevChar] = useState(char);
  const [displayChar, setDisplayChar] = useState(char);
  const [frontChar, setFrontChar] = useState(char);
  const [animating, setAnimating] = useState(false);

  // Derive the flip state during render when the target character changes,
  // rather than in an effect — this is React's documented pattern for
  // "adjust state when a prop changes" and avoids an extra commit.
  if (char !== prevChar) {
    setPrevChar(char);
    if (reducedMotion) {
      setDisplayChar(char);
    } else {
      setFrontChar(displayChar);
      setDisplayChar(char);
      setAnimating(true);
    }
  }

  useEffect(() => {
    if (!animating) return;
    const timeout = setTimeout(() => setAnimating(false), FLIP_DURATION_MS);
    return () => clearTimeout(timeout);
  }, [animating]);

  return (
    <span className="flap-cell">
      <span className="flap-half flap-half-top">
        <span className="flap-glyph flap-glyph--top">{displayChar}</span>
      </span>
      <span className="flap-half flap-half-bottom">
        <span className="flap-glyph flap-glyph--bottom">{displayChar}</span>
      </span>
      {animating && (
        <span className="flap-flipper">
          <span className="flap-flipper-face flap-flipper-front">
            <span className="flap-glyph flap-glyph--bottom">{frontChar}</span>
          </span>
          <span className="flap-flipper-face flap-flipper-back">
            <span className="flap-glyph flap-glyph--bottom">{displayChar}</span>
          </span>
        </span>
      )}
      <span className="flap-seam" aria-hidden />
    </span>
  );
}

export function SplitFlap({
  value,
  width,
  align = "left",
  className = "",
}: {
  value: string;
  width: number;
  align?: "left" | "right";
  className?: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const padded = align === "right" ? value.padStart(width) : value.padEnd(width);
  const chars = padded.slice(0, width).split("");

  return (
    <span className={`flap-row ${className}`} role="text" aria-label={value}>
      {chars.map((char, index) => (
        <FlapCell key={index} char={char} reducedMotion={reducedMotion} />
      ))}
    </span>
  );
}
