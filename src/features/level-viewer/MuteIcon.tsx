import type { FC } from 'react';

interface MuteIconProps {
  muted: boolean;
}

/**
 * Speaker icon for the music mute toggle. Inline SVG (no icon-font dependency): a speaker that
 * shows sound waves when unmuted and a cross when muted.
 */
export const MuteIcon: FC<MuteIconProps> = ({ muted }) => (
  <svg
    className="mute-icon"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable="false"
  >
    <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
    {muted ? (
      <>
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    ) : (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 6a8 8 0 0 1 0 12" />
      </>
    )}
  </svg>
);
