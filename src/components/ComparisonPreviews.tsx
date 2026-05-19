"use client";

import { useState } from "react";
import type { Discrepancy } from "@/lib/types";
import { HighlightLayer } from "./HighlightLayer";
import styles from "./ComparisonPreviews.module.css";

type Props = {
  figmaPath: string;
  sitePath: string;
  width: number;
  figmaSource: string;
  discrepancies: Discrepancy[];
};

export function ComparisonPreviews({
  figmaPath,
  sitePath,
  width,
  figmaSource,
  discrepancies,
}: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const annotated = discrepancies.filter((d) => d.anchor);

  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>
        Markers are matched by position, size, and labels — click one on the site to
        highlight the paired region in Figma.
      </p>
      <div className={styles.row}>
        <figure className={styles.figure}>
          <figcaption>Figma ({figmaSource})</figcaption>
          <div className={styles.stage} onClick={() => setActiveId(null)}>
            <img src={figmaPath} alt="Figma reference" className={styles.shot} draggable={false} />
            <HighlightLayer
              discrepancies={discrepancies}
              anchorKey="figmaAnchor"
              activeId={activeId}
              onSelect={setActiveId}
              showPins={false}
            />
          </div>
        </figure>

        <figure className={styles.figure}>
          <figcaption>Live site @ {width}px</figcaption>
          <div className={styles.stage} onClick={() => setActiveId(null)}>
            <img src={sitePath} alt="Website capture" className={styles.shot} draggable={false} />
            <HighlightLayer
              discrepancies={discrepancies}
              anchorKey="anchor"
              activeId={activeId}
              onSelect={setActiveId}
              showPins
            />
          </div>
          <p className={styles.legend}>{annotated.length} markers — hover or click</p>
        </figure>
      </div>
    </div>
  );
}
