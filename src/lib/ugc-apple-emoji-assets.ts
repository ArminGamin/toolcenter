export const APPLE_EMOJI_ASSETS: Record<string, string> = {
  '😵‍💫': '/ugc/apple-emojis/dizzy-face.png',
  '😩': '/ugc/apple-emojis/weary-face.png',
  '🥲': '/ugc/apple-emojis/smiling-tear.png',
  '🤯': '/ugc/apple-emojis/mind-blown.png',
  '😳': '/ugc/apple-emojis/flushed-face.png',
  '👀': '/ugc/apple-emojis/eyes.png',
  '🤔': '/ugc/apple-emojis/thinking-face.png',
  '❤️': '/ugc/apple-emojis/red-heart.png',
  '🤍': '/ugc/apple-emojis/white-heart.png',
  '🥰': '/ugc/apple-emojis/smiling-hearts.png',
  '🎁': '/ugc/apple-emojis/wrapped-gift.png',
  '🎄': '/ugc/apple-emojis/christmas-tree.png',
  '✨': '/ugc/apple-emojis/sparkles.png',
  '☕️': '/ugc/apple-emojis/hot-beverage.png',
  '😍': '/ugc/apple-emojis/heart-eyes.png',
  '👌': '/ugc/apple-emojis/ok-hand.png',
}

export function appleEmojiAsset(emoji: string): string | null {
  return APPLE_EMOJI_ASSETS[emoji] || null
}
