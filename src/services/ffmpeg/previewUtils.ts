import { toLocalMediaUrl } from './coordinateUtils'

export function loadImageSize(imagePath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => reject(new Error(`无法加载图片: ${imagePath}`))
    img.src = toLocalMediaUrl(imagePath)
  })
}

export async function readPreviewAsDataUrl(filePath: string): Promise<string | null> {
  if (!window.electronAPI?.ffmpeg?.readPreviewAsDataUrl) return null
  const result = await window.electronAPI.ffmpeg.readPreviewAsDataUrl({ filePath })
  return result.success && result.dataUrl ? result.dataUrl : null
}
