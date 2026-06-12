import React from 'react';

const GRID_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;

export const ViewportLabelGrid: React.FC<{ active: boolean }> = ({ active }) => {
  if (!active) return null;

  return (
    <div className="viewport-label-grid" aria-hidden="true">
      {GRID_LABELS.map((label) => (
        <div key={label} className="viewport-label-grid__cell">
          <span className="viewport-label-grid__label">{label}</span>
        </div>
      ))}
    </div>
  );
};
