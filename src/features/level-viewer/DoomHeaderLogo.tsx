import React from 'react';

const DOOM_LOGO_SRC = '/images/doom-logo.png';

/** Classic DOOM box-art wordmark (letters only, no marine). */
export const DoomHeaderLogo: React.FC = () => (
  <h1 className="doom-wordmark" aria-label="DOOM">
    <img
      src={DOOM_LOGO_SRC}
      className="doom-wordmark-logo"
      alt=""
      width={160}
      height={58}
      decoding="async"
    />
    <span className="doom-wordmark-sub">JS</span>
  </h1>
);
