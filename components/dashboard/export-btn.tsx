"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Download, AlertTriangle, CloudUpload, Loader2, CheckCircle2 } from "lucide-react";
import { currentData, useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { exportExcel } from "@/lib/excel";
import { postJob } from "@/lib/sync";
import { MailSendModal } from "@/components/dashboard/mail-send-modal";
import { toast } from "sonner";

export function DashboardExportBtn({ hasCompany }: { hasCompany: boolean }) {
  const router = useRouter();
  const [showWarning, setShowWarning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [mailModalStatus, setMailModalStatus] = useState<"sending" | "success" | "error" | "idle">("idle");
  const [mailErrorMessage, setMailErrorMessage] = useState<string | undefined>(undefined);
  const [syncJobCount, setSyncJobCount] = useState(0);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<"synced" | "queued" | "offline">("offline");

  const profile = useAppStore((s) => s.profile);
  const wipeData = useAppStore((s) => s.wipeData);
  const syncQueue = useAppStore((s) => s.syncQueue);
  const addJobToQueue = useAppStore((s) => s.addJobToQueue);
  const updateJobStatus = useAppStore((s) => s.updateJobStatus);
  const pruneQueue = useAppStore((s) => s.pruneQueue);
  const displayName = useAuthStore((s) => s.displayName);
  const authLogout = useAuthStore((s) => s.logout);

  const pendingJobs = syncQueue.filter((j) => j.status === "pending");

  useEffect(() => { pruneQueue(); }, [pruneQueue]);

  async function trySyncJob(jobId: string, reporter: string, payload: ReturnType<typeof currentData>, recipients?: string[]) {
    const r = await postJob(jobId, reporter, payload, recipients);
    if (r.ok) updateJobStatus(jobId, "synced");
    return r;
  }

  // ─── Main submit handler ─────────────────────────────────────────────────
  const handleExportAndComplete = async () => {
    if (!hasCompany) {
      setShowWarning(true);
      return;
    }
    setExporting(true);
    const jobId = crypto.randomUUID();
    const payload = currentData();
    const reporter = displayName || "Engineer";

    // 1. Always save the Excel file locally first
    let savedUri: string | null = null;
    try {
      savedUri = await exportExcel(payload, reporter);
    } catch (err) {
      console.error("[export] local save failed:", err);
    }
    if (!savedUri) {
      toast.error("Could not write the Excel file to device storage.");
      setExporting(false);
      return;
    }
    toast.success("Excel saved to device ✓");

    // 2. Queue the job (so it can be retried later if sending fails now)
    addJobToQueue({ jobId, status: "pending", createdAt: Date.now(), reporterName: reporter, payload });

    // 3. Always attempt the send immediately (don't rely on navigator.onLine)
    setMailModalStatus("sending");
    setSyncJobCount(1);
    const result = await trySyncJob(jobId, reporter, payload);
    if (result.ok) {
      setLastSyncResult("synced");
      setMailModalStatus("success");
      setMailErrorMessage(undefined);
      toast.success(result.emailed ? "Report emailed to admin team ✓" : "Report saved to the team cloud ✓");
    } else {
      setLastSyncResult("queued");
      setMailErrorMessage(result.error);
      setMailModalStatus("error");
    }
    setTimeout(() => setMailModalStatus("idle"), 4000);
    setExporting(false);
    setShowCompleteModal(true);
  };

  // ─── Retry all pending jobs ──────────────────────────────────────────────
  const handleSyncAll = async () => {
    if (pendingJobs.length === 0) return toast.info("No pending reports to send.");
    setSyncing(true);
    setMailModalStatus("sending");
    setSyncJobCount(pendingJobs.length);
    let ok = 0;
    let lastError: string | undefined;
    for (const job of pendingJobs) {
      const result = await trySyncJob(job.jobId, job.reporterName, job.payload, job.recipients);
      if (result.ok) ok++;
      else lastError = result.error;
    }
    if (ok > 0) {
      setMailModalStatus("success");
      if (ok === pendingJobs.length) toast.success(`All ${ok} report(s) sent ✓`);
      else toast.warning(`Sent ${ok} of ${pendingJobs.length}. The rest will retry later.`);
      setTimeout(() => { setMailModalStatus("idle"); setSyncing(false); }, 2000);
    } else {
      setMailErrorMessage(lastError);
      setMailModalStatus("error");
      toast.error("Sending failed. Check the internet connection or contact admin.");
      setSyncing(false);
    }
  };

  const handleLogoutAction = () => {
    // Do NOT wipe data on logout — preserve in-progress reports
    authLogout();
    router.push("/login");
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
      <MailSendModal
        isOpen={mailModalStatus !== "idle"}
        status={mailModalStatus}
        companyName={profile?.companyName || "Your Company"}
        jobCount={syncJobCount || 1}
        errorMessage={mailErrorMessage}
        onClose={() => setMailModalStatus("idle")}
      />

      {pendingJobs.length > 0 ? (
        <Button onClick={handleSyncAll} disabled={syncing} variant="secondary" className="relative border border-red-500/50 text-red-50 hover:bg-red-500/10 gap-2 pr-10 w-full sm:w-auto animate-pulse">
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          {syncing ? "Sending…" : "Resend"}
          <span className="absolute top-1/2 -translate-y-1/2 right-2 px-1.5 min-w-[20px] h-5 flex items-center justify-center bg-red-600 text-white text-[10px] font-bold rounded-full">{pendingJobs.length}</span>
        </Button>
      ) : (
        <Button onClick={handleSyncAll} disabled={syncing} variant="secondary" className="border border-slate-500/30 text-slate-400 hover:bg-slate-500/10 gap-2 w-full sm:w-auto opacity-50">
          <CloudUpload className="size-4" />
          All Sent
        </Button>
      )}

      <Button onClick={handleExportAndComplete} disabled={exporting} className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-semibold shadow-lg shadow-emerald-900/20 w-full sm:w-auto">
        {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {exporting ? "Generating…" : "Submit Report"}
      </Button>

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4 text-amber-400">
              <AlertTriangle className="size-6" />
              <h3 className="text-lg font-semibold">Missing Company Details</h3>
            </div>
            <p className="text-slate-300 text-sm mb-6">No company details found. Add them so the report and the PostMan workbook carry the right plant name.</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => { setShowWarning(false); router.push("/company"); }} className="w-full bg-sky-600 hover:bg-sky-500 text-white">Add Company Details</Button>
              <Button onClick={() => setShowWarning(false)} variant="ghost" className="w-full text-slate-400 hover:text-white">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {showCompleteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md px-4">
          <div className="bg-slate-900 border border-white/10 p-6 rounded-xl shadow-2xl max-w-sm w-full text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-emerald-500/20 p-3">
                <CheckCircle2 className="size-10 text-emerald-400" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Report Generated</h3>
            <p className="text-sm text-slate-300 mb-6">
              Excel file saved to the device.
              {lastSyncResult === "synced" && " ✓ Sent to the admin team."}
              {lastSyncResult === "queued" && " Report queued — it will go out when you're online. Use 'Resend' to retry now."}
            </p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => { setShowCompleteModal(false); router.push("/report"); }} className="w-full gap-2">Open Report &amp; PDF</Button>
              <Button onClick={handleLogoutAction} className="w-full bg-slate-700 hover:bg-slate-600 text-white">Logout</Button>
              <Button onClick={() => { if (confirm("Clear all data on this device and start a new report?")) { wipeData(); setShowCompleteModal(false); router.push("/company"); } }} variant="secondary" className="w-full border border-white/20 text-white bg-white/5 hover:bg-white/10">New Report</Button>
              <Button onClick={() => setShowCompleteModal(false)} variant="ghost" className="w-full text-slate-400 hover:text-white">Continue Editing</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
