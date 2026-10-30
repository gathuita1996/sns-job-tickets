// Profile pictures: whatever the phone camera produced is cropped to a square and shrunk before it is uploaded,
// so a 6 MB photo becomes a ~30 KB picture and the page stays fast.
export const AVATAR_MAX_INPUT = 8 * 1024 * 1024
export function validateAvatarFile(file) {
  if (!file) return 'Choose a picture.'
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return 'Use a JPG, PNG or WebP picture.'
  if (file.size > AVATAR_MAX_INPUT) return 'That picture is too large. Choose one under 8 MB.'
  return null
}
export async function processAvatar(file, size = 320) {
  const problem = validateAvatarFile(file)
  if (problem) throw new Error(problem)
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  if (bitmap.close) bitmap.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Could not prepare that picture. Try another one.')
  return blob
}
