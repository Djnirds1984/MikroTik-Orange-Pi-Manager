
import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 mt-auto">
      <div className="container mx-auto px-4 py-4 text-center text-sm text-slate-500">
        <p>&copy; {new Date().getFullYear()} MikroTik AI Script Assistant. Not affiliated with MikroTik or Orange Pi.</p>
        <p>AI-generated scripts may be inaccurate. Always review before use in a production environment.</p>
      </div>
    </footer>
  );
};
