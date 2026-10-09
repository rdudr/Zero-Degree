"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MailSendModalProps {
  isOpen: boolean;
  status: "sending" | "success" | "error" | "idle";
  companyName?: string;
  jobCount?: number;
  errorMessage?: string;
  onClose?: () => void;
}

export function MailSendModal({
  isOpen,
  status,
  companyName = "Your Company",
  jobCount = 1,
  errorMessage,
  onClose,
}: MailSendModalProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center px-4 transition-all duration-300",
        isOpen ? "bg-black/60 backdrop-blur-sm" : "bg-black/0 pointer-events-none"
      )}
    >
      <div
        className={cn(
          "relative bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-8 transition-all duration-300 transform",
          isOpen
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        )}
        {/* ── Sending State ── */}
        {status === "sending" && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Mail className="w-8 h-8 text-cyan-400 animate-bounce" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-50 mb-1">
                Submitting Report
              </h3>
              <p className="text-sm text-slate-400">
                {jobCount === 1
                  ? `Sending ${companyName} data...`
                  : `Processing ${jobCount} report${jobCount > 1 ? "s" : ""}...`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-xs text-slate-400">Please wait...</span>
            </div>
          </div>
        )}

        {/* ── Success State ── */}
        {status === "success" && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 bg-emerald-500/20 rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-50 mb-1">
                Report Submitted Successfully
              </h3>
              <p className="text-sm text-slate-400">
                {jobCount === 1
                  ? `${companyName} data sent to admin team`
                  : `${jobCount} report${jobCount > 1 ? "s" : ""} submitted`}
              </p>
              <p className="text-xs text-emerald-400/80 mt-2">
                ✓ Email notification sent
              </p>
            </div>
          </div>
        )}

        {/* ── Error State ── */}
        {status === "error" && (
          <div className="flex flex-col items-center gap-4 animate-in fade-in zoom-in duration-300">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 bg-red-500/20 rounded-full" />
              <div className="absolute inset-0 flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-400" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-50 mb-1">
                Submission Failed
              </h3>
              <p className="text-sm text-slate-400 mb-3">
                {errorMessage || "Unable to submit report. Check your internet connection."}
              </p>
              <p className="text-xs text-amber-300">
                ⚠ Report queued locally. Use 'Resend Queued' when online to retry.
              </p>
            </div>
          </div>
        )}

        {/* ── Idle State (hidden but keeping structure) ── */}
        {status === "idle" && null}
      </div>
    </div>
  );
}
