import React from 'react';

interface SidebarProps {
  children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ children }) => {
  return (
    <div className="flex flex-col gap-6 p-5 h-full overflow-y-auto">
      {children}
    </div>
  );
};
