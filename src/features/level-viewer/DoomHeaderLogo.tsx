import React from 'react';

const DOOM_LOGO_SRC = '/images/doom-logo.png';

/** Classic DOOM box-art wordmark (letters only, no marine). */
export const DoomHeaderLogo: React.FC = () => (
  <div className="doom-wordmark" aria-label="DOOM JS">
    <img
      src={DOOM_LOGO_SRC}
      className="doom-wordmark-logo"
      alt=""
      width={90}
      height={60}
      decoding="async"
    />
    <span className="doom-wordmark-sub">JS</span>
  </div>
);
