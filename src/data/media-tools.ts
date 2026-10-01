import type { Tool } from '../types.js'

const RIPPER = String.raw`C:\Users\kajus\Desktop\ripper`
const PROMO_VIDEOS = String.raw`D:\jaukumas\promo-vids`
const PICTURE_STRIPPER = String.raw`D:\picture stripper metadata`

type MediaTool = Tool & {
  openInWindow?: boolean
  outputPath?: string
}

export const LEGACY_DOWNLOADER_IDS = [
  'medal_downloader', 'instagram_downloader', 'youtube_downloader',
  'tiktok_downloader', 'twitter_downloader', 'soundcloud_downloader',
]

const DOWNLOADER_OPTIONS = [
  { id: 'medal', label: 'Medal', launch: 'medal.bat', outputPath: String.raw`D:\medal` },
  { id: 'instagram', label: 'Instagram', launch: 'instagram.bat' },
  { id: 'youtube', label: 'YouTube', launch: 'youtube.bat' },
  { id: 'tiktok', label: 'TikTok', launch: 'tiktok.bat' },
  { id: 'twitter', label: 'Twitter / X', launch: 'twitter.bat' },
  { id: 'soundcloud', label: 'SoundCloud', launch: 'soundcloud.bat' },
].map((option) => ({
  ...option,
  processMatch: `${RIPPER}\\${option.launch}`,
  outputPath: option.outputPath || RIPPER,
}))

/** Shared by Tool Center and the launch bridge. */
export const MEDIA_TOOL_CATALOG: MediaTool[] = [
  {
    id: 'video_metadata_stripper',
    name: 'Video Metadata Stripper',
    icon: 'video',
    accent: '#5ec4b4',
    status: 'active',
    removed: false,
    path: PROMO_VIDEOS,
    launch: 'python metadata-stripper/stripper.py',
    processMatch: 'metadata-stripper\\stripper.py',
    blurb: 'Strip promo video metadata and verify cleaned MP4s in the browser',
    category: 'Content',
    outputPath: String.raw`D:\jaukumas\promo-vids\STRIPPED`,
  },
  {
    id: 'downloader',
    name: 'Downloader',
    icon: 'video',
    accent: '#38bdf8',
    status: 'active',
    removed: false,
    path: RIPPER,
    launch: DOWNLOADER_OPTIONS[0].launch,
    launchOptions: DOWNLOADER_OPTIONS,
    processMatch: DOWNLOADER_OPTIONS[0].processMatch,
    blurb: 'Download from Medal, Instagram, YouTube, TikTok, Twitter / X, and SoundCloud',
    category: 'Downloads',
    openInWindow: true,
    outputPath: DOWNLOADER_OPTIONS[0].outputPath,
  },
  {
    id: 'discord_uploader',
    name: 'Metadata Stripper → Discord',
    icon: 'discord',
    accent: '#7b8cff',
    status: 'active',
    removed: false,
    path: String.raw`C:\Users\kajus\Desktop\ripper\discord-uploader`,
    launch: 'run.bat',
    processMatch: 'ripper\\discord-uploader\\run.bat',
    blurb: 'Clean video metadata and upload videos to Discord with the existing uploader',
    category: 'Content',
    outputPath: String.raw`C:\Users\kajus\Desktop\ripper\discord-uploader\_scrubbed`,
  },
  {
    id: 'picture_metadata_stripper',
    name: 'Picture Metadata Stripper',
    icon: 'carousel',
    accent: '#f472b6',
    status: 'active',
    removed: false,
    path: PICTURE_STRIPPER,
    launch: 'run.bat',
    processMatch: 'picture stripper metadata\\run.bat',
    blurb: 'Remove picture metadata in batches using the local browser app',
    category: 'Content',
    outputPath: String.raw`D:\picture stripper metadata\stripped`,
  },
]
