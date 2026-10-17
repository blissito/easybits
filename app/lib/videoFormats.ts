// Presets de tamaño de un proyecto de video (create_video_project, POST /api/v2/video-projects
// con `format.preset`). Sin imports: el CLI los compara contra su copia en un test.
export const VIDEO_FORMAT_PRESETS: Record<string, [width: number, height: number]> = {
  portrait: [1080, 1920],
  story: [1080, 1920],
  reel: [1080, 1920],
  tiktok: [1080, 1920],
  square: [1080, 1080],
  landscape: [1920, 1080],
  "16-9": [1920, 1080],
  youtube: [1920, 1080],
};
