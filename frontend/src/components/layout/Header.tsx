import React from 'react';
import { ExcelUploadButton } from '../upload/ExcelUploadButton';
import { RefreshCw, Sun } from 'lucide-react';

interface HeaderProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  uploadedFileName: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onUpload,
  isUploading,
  uploadedFileName,
  onRefresh,
  isRefreshing = false,
}) => {
  return (
    <header className="bg-surface/85 backdrop-blur-md border-b border-line px-5 sm:px-8 h-[73px] flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Brand + title */}
      <div className="flex items-center gap-3.5">
        <div className="grid place-items-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-soft">
          <Sun className="w-5 h-5" strokeWidth={2.25} />
        </div>
        <div className="leading-tight">
          <h1 className="font-display text-[17px] font-semibold text-slate-900 tracking-tight">
            Market Navigator
          </h1>
          <p className="hidden sm:block text-2xs text-slate-500 font-medium mt-0.5">
            Solar tender &amp; auction intelligence
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2.5">
        <ExcelUploadButton
          onUpload={onUpload}
          isUploading={isUploading}
          uploadedFileName={uploadedFileName}
        />

        <button
          onClick={onRefresh}
          disabled={isRefreshing || isUploading}
          className="grid place-items-center w-9 h-9 rounded-lg bg-white ring-1 ring-line-strong hover:bg-slate-50 text-slate-500 hover:text-slate-800 disabled:opacity-50 cursor-pointer transition"
          title="Refresh data source"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </header>
  );
};
