import type { Discrepancy, DiscrepancyAnchor } from "@/lib/types";
import styles from "./HighlightLayer.module.css";

const CATEGORY_LABEL: Record<Discrepancy["category"], string> = {
  typography: "Typography",
  spacing: "Spacing",
  image: "Image",
};

type Props = {
  discrepancies: Discrepancy[];
  anchorKey: "anchor" | "figmaAnchor";
  activeId: string | null;
  onSelect: (id: string | null) => void;
  showPins?: boolean;
};

export function HighlightLayer({
  discrepancies,
  anchorKey,
  activeId,
  onSelect,
  showPins = false,
}: Props) {
  const items = discrepancies.filter((d) => d[anchorKey]);

  return (
    <div className={styles.overlay}>
      {items.map((d) => {
        const a = d[anchorKey] as DiscrepancyAnchor;
        const isActive = activeId === d.id;
        const categoryClass =
          d.category === "typography"
            ? styles.type
            : d.category === "spacing"
              ? styles.space
              : styles.image;

        return (
          <div
            key={d.id}
            className={`${styles.region} ${categoryClass} ${isActive ? styles.active : ""} ${showPins ? styles.withPin : ""}`}
            style={{
              left: `${a.x}%`,
              top: `${a.y}%`,
              width: `${Math.max(a.width, 1.5)}%`,
              height: `${Math.max(a.height, 1.5)}%`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isActive ? null : d.id);
            }}
          >
            {showPins && <span className={styles.pin} aria-hidden />}
            {showPins && (
              <div className={`${styles.tooltip} ${isActive ? styles.tooltipVisible : ""}`}>
                <span className={styles.tooltipCategory}>{CATEGORY_LABEL[d.category]}</span>
                <strong>{d.property}</strong>
                {d.name && <span className={styles.tooltipName}>{d.name}</span>}
                <div className={styles.tooltipRow}>
                  <span>Figma</span>
                  <code>{d.figma}</code>
                </div>
                <div className={styles.tooltipRow}>
                  <span>Site</span>
                  <code>{d.site}</code>
                </div>
                {d.delta && <span className={styles.tooltipDelta}>{d.delta}</span>}
              </div>
            )}
            {!showPins && isActive && (
              <span className={styles.figmaLabel}>{d.property}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
