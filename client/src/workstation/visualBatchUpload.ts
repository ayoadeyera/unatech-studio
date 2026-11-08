export interface BatchUploadFailure { name: string; message: string; }

export async function uploadVisualBatch<T>(
  files: readonly File[],
  upload: (file: File) => Promise<T>,
  onProgress?: (index: number, file: File) => void,
): Promise<{ uploaded: Array<{ file: File; result: T }>; failed: BatchUploadFailure[] }> {
  const uploaded: Array<{ file: File; result: T }> = [];
  const failed: BatchUploadFailure[] = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    onProgress?.(index, file);
    try { uploaded.push({ file, result: await upload(file) }); }
    catch (error) { failed.push({ name: file.name, message: error instanceof Error ? error.message : "Upload failed." }); }
  }
  return { uploaded, failed };
}
