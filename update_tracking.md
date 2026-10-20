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
