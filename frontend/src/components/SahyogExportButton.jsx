import React from 'react';
import { Send } from 'lucide-react';

// Deliberately disabled - there is no public SAHYOG/NCRP API to integrate
// with in a hackathon timeframe. This button exists to show the PS's
// named integration requirement was understood and designed for, not to
// pretend a real connection exists. Honest positioning > a fake button.
export default function SahyogExportButton() {
  return (
    <button
      disabled
      title="Integration-ready — connects via case ID once SAHYOG/NCRP API access is granted to the platform"
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-gray-700/50 bg-background/50 text-gray-600 cursor-not-allowed shrink-0"
    >
      <Send className="w-3.5 h-3.5" /> Export to SAHYOG
    </button>
  );
}