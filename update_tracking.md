# Update Tracking

- Fixed HTML5 video player subtitle rendering to support and properly format multi-line captions by applying unscoped `white-space: pre-line !important` and `line-height: 1.4 !important` styles, enforcing single active track display, and preserving newline breaks across WebVTT translation engines.
- Implemented Dark, Light, and System theme modes with comprehensive CSS design tokens and reactive theme synchronization across all application cards, dialogs, navbars, and category views.
- Added a Continue Watching row displaying in-progress videos with persistent playback timestamps, progress indicators, and one-click resume.
- Added a Favorites / Watchlist feature allowing users to bookmark videos across hero banners and bento cards, with dedicated category filtering and local persistence.
- Added comprehensive player keyboard shortcuts reference in the help modal and synchronized customizable subtitle styles into the Chromecast URL generator.
- Fixed native WebVTT subtitle track resolution to support blob URLs alongside `.vtt` endpoints and dynamically sanitize cue vertical bounds so multi-line captions display reliably in the player.
- Updated player Escape key handler to reliably close child modals, exit theatre mode, or dismiss the video player dialog.
- Updated the Bible category icon from `mdi-book-cross` to a simple book icon `mdi-book`.
- Updated the player Chromecast URL generator to forward the original remote WebVTT subtitle link instead of local blob URLs, matching QuickCast behavior.
- Implemented full Progressive Web App (PWA) support with offline asset caching and manifest configuration, deactivated AI subtitle generation in PWA standalone mode with multilingual notices, and integrated in-flight request deduplication and in-memory TTL caching in the mediator service to eliminate redundant network bottlenecks and boost app responsiveness.
- Upgraded Dockerfile and backend Dockerfile base images to Node 22 LTS (`node:22-alpine`) to provide native global Web Crypto API support and resolve the `ReferenceError: crypto is not defined` build failure in Vite PWA terser bundling.
- Optimized app responsiveness and network delivery by enabling Gzip/Brotli compression and 1-year asset caching in Express, implementing IntersectionObserver viewport lazy loading on video categories, de-blocking initial language boot, preferring compact card thumbnails, and sharing category media cache across query limits.
- Redesigned the PIN authentication screen with a symmetrical 3x4 dialpad layout, physical keyboard and numpad entry support, high-contrast reactive dots, verification status feedback, and card-shake animations on error.
