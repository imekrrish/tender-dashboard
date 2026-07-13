import React, { useRef } from 'react';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';

interface ExcelUploadButtonProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadedFileName: string;
}

export const ExcelUploadButton: React.FC<ExcelUploadButtonProps> = ({
  onUpload,
  isUploading,
  uploadedFileName,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2.5">
      {/* Current file chip */}
      {uploadedFileName && (
        <div className="hidden lg:flex items-center gap-2 pl-2.5 pr-3 h-9 bg-emerald-50 text-emerald-700 rounded-lg ring-1 ring-emerald-200/70">
          <FileSpreadsheet className="w-4 h-4 shrink-0" />
          <span
            className="truncate max-w-[160px] text-2xs font-semibold"
            title={uploadedFileName}
          >
            {uploadedFileName}
          </span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx, .xls"
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={isUploading}
        className="flex items-center gap-2 px-3.5 h-9 text-sm font-semibold bg-brand-600 hover:bg-brand-700 text-white rounded-lg cursor-pointer transition disabled:opacity-60 disabled:cursor-not-allowed shadow-soft active:scale-[0.98]"
      >
        {isUploading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Uploading…</span>
          </>
        ) : (
          <>
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Upload Excel</span>
            <span className="sm:hidden">Upload</span>
          </>
        )}
      </button>
    </div>
  );
};
