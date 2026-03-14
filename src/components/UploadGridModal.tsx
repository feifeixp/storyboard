import React from 'react';

export interface UploadGridModalProps {
  uploadDialogOpen: boolean;
  setUploadDialogOpen: (open: boolean) => void;
  uploadGridIndex: number | null;
  setUploadGridIndex: (index: number | null) => void;
  uploadUrl: string;
  setUploadUrl: (url: string) => void;
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  handleUploadGrid: () => void;
}

export const UploadGridModal: React.FC<UploadGridModalProps> = ({
  uploadDialogOpen,
  setUploadDialogOpen,
  uploadGridIndex,
  setUploadGridIndex,
  uploadUrl,
  setUploadUrl,
  uploadFile,
  setUploadFile,
  handleUploadGrid
}) => {
  if (!uploadDialogOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]">
      <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-md w-full mx-4 shadow-2xl">
        <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-4">
          📤 上传第 {uploadGridIndex !== null ? uploadGridIndex + 1 : ''} 张九宫格
        </h3>

        <div className="space-y-4">
          {/* URL输入 */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              图片URL
            </label>
            <input
              type="text"
              value={uploadUrl}
              onChange={(e) => setUploadUrl(e.target.value)}
              placeholder="https://example.com/image.png"
              className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* 分隔线 */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[var(--color-border)]"></div>
            <span className="text-xs text-[var(--color-text-tertiary)]">或</span>
            <div className="flex-1 h-px bg-[var(--color-border)]"></div>
          </div>

          {/* 文件上传 */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
              上传本地图片
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
            />
            {uploadFile && (
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                已选择: {uploadFile.name}
              </p>
            )}
          </div>
        </div>

        {/* 按钮 */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => {
              setUploadDialogOpen(false);
              setUploadGridIndex(null);
              setUploadUrl('');
              setUploadFile(null);
            }}
            className="flex-1 px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] rounded-lg font-medium hover:bg-[var(--color-surface-hover)] transition-all"
          >
            取消
          </button>
          <button
            onClick={handleUploadGrid}
            disabled={!uploadUrl.trim() && !uploadFile}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            确认上传
          </button>
        </div>
      </div>
    </div>
  );
};
