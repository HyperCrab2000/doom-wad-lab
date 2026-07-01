import type { FC } from 'react';

import {
  gzdoomProgressKicker,
  gzdoomProgressToSteps,
  type GzdoomLoadProgress,
  type GzdoomProgressVariant,
} from '@/features/level-viewer/gzdoomPlayLoadProgress';

export const GzdoomPlayLoadingOverlay: FC<{
  title: string;
  progress: GzdoomLoadProgress;
  elapsedSec: number;
  variant: GzdoomProgressVariant;
}> = ({ title, progress, elapsedSec, variant }) => {
  const steps = gzdoomProgressToSteps(progress, variant);
  const percent = Math.round(Math.max(0, Math.min(100, progress.percent)));
  const kicker = gzdoomProgressKicker(variant);

  return (
    <div className="gzdoom-play-loading" aria-live="polite" role="status">
      <div className="gzdoom-play-loading__panel">
        <span className="gzdoom-play-loading__kicker">{kicker}</span>
        <h3 className="gzdoom-play-loading__title">{title}</h3>
        <p className="gzdoom-play-loading__phase">{progress.label}</p>
        {progress.detail ? (
          <p className="gzdoom-play-loading__detail">{progress.detail}</p>
        ) : null}

        <div
          className="gzdoom-play-loading__bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`Loading ${title}`}
        >
          <span
            className="gzdoom-play-loading__bar-fill"
            style={{ width: `${percent}%` }}
          />
          <span className="gzdoom-play-loading__bar-label">{percent}%</span>
        </div>

        <div className="loader-segmented-bar gzdoom-play-loading__segments" aria-hidden="true">
          {steps.map((step) => {
            const fill = step.complete ? 100 : Math.round(step.progress * 100);
            return (
              <div
                key={step.label}
                className={`loader-segment ${step.complete ? 'complete' : ''} ${step.active ? 'active' : ''}`}
                title={step.message || step.label}
              >
                <span className="loader-segment__label">{step.label}</span>
                <span className="loader-segment__track">
                  <span className="loader-segment__fill" style={{ width: `${fill}%` }} />
                </span>
              </div>
            );
          })}
        </div>

        <p className="gzdoom-play-loading__elapsed">{elapsedSec}s</p>
      </div>
    </div>
  );
};
