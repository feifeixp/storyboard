import { saveAs } from 'file-saver';

/**
 * 跨域下载文件工具（强制走 Blob 下载，避免浏览器新页面打开）
 *
 * @param url 需要下载的资源绝对/相对链接
 * @param filename 下载保存的文件名
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`网络响应错误: ${response.statusText}`);
    }
    const blob = await response.blob();
    saveAs(blob, filename);
  } catch (err) {
    console.error(`下载文件失败 [${filename}]:`, err);
    throw err;
  }
}

/**
 * 直接下载 Blob 对象
 */
export function downloadBlob(blob: Blob, filename: string): void {
  saveAs(blob, filename);
}
