"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { currentData, useAppStore } from "@/lib/store";
import { useAuthStore } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import {
  Mail, AlertTriangle, Send, CloudLightning, RefreshCw, Download, Share2, FileText,
  FileSpreadsheet, Upload, Users, Loader2, Wind, Snowflake, Waves, CloudDownload, CloudUpload,
} from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { generateReportPDF, pdfFilename } from "@/lib/pdf";
import { buildExcelBase64, exportExcel, shareExcel, parseWorkbook, readWorkbookFile, ZD_FORMAT } from "@/lib/excel";
import { addSummaries, describeSummary, emptySummary, mergeDataSets } from "@/lib/merge";
import { captureHandoff, sendToPostman, type PostmanHandoff } from "@/lib/postman-handoff";
import { fetchTeamData, getServerBase, postJob } from "@/lib/sync";

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/zero-degree-logo-sm.jpg");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
}

export default function ReportPage() {
  const profile = useAppStore((s) => s.profile);
  const airUnits = useAppStore((s) => s.airUnits);
  const chillers = useAppStore((s) => s.chillers);
  const coolingTowers = useAppStore((s) => s.coolingTowers);
  const replaceData = useAppStore((s) => s.replaceData);
  const displayName = useAuthStore((s) => s.displayName);

  const syncQueue = useAppStore((s) => s.syncQueue || []);
  const addJobToQueue = useAppStore((s) => s.addJobToQueue);
  const updateJobStatus = useAppStore((s) => s.updateJobStatus);

  const [reporterName, setReporterName] = useState(displayName || "");
  const [recipients, setRecipients] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<PostmanHandoff | null>(null);
  const [handedOver, setHandedOver] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [isNative, setIsNative] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Did PostMan open us? Only then is there anywhere to send to. */
  useEffect(() => {
    setHandoff(captureHandoff());
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setIsNative(Capacitor.isNativePlatform());
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const acCount = airUnits.filter((u) => u.category === "AC").length;
  const ahuCount = airUnits.filter((u) => u.category === "AHU").length;
  const total = airUnits.length + chillers.length + coolingTowers.length;
  const recorders = new Set([...airUnits, ...chillers, ...coolingTowers].map((r) => r.recordedBy || "?")).size;
  const address = profile ? [profile.area, profile.district, profile.state, profile.pincode].filter(Boolean).join(", ") : "";
  const pendingJobs = syncQueue.filter((j) => j.status === "pending");
  const ready = !!profile?.companyName && total > 0;
  const engineer = reporterName || displayName || "Field Engineer";

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      const msg = (err as Error)?.message || "unknown error";
      if (!/cancel/i.test(msg)) toast.error(msg);
    } finally {
      setBusy(null);
    }
  }

  /** Builds the PDF and saves it (device Documents on Android, browser download on web). */
  async function savePdfLocally(): Promise<string | null> {
    const arrayBuffer = generateReportPDF(currentData(), engineer, await logoDataUrl());
    const filename = pdfFilename(profile?.companyName);
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const base64Data = arrayBufferToBase64(arrayBuffer);
      for (const dir of [Directory.Documents, Directory.Cache]) {
        try {
          const result = await Filesystem.writeFile({ path: filename, data: base64Data, directory: dir, recursive: true });
          return result.uri;
        } catch (err) {
          console.warn(`Write to ${dir} failed:`, err);
        }
      }
      return null;
    }
    const blob = new Blob([arrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
    return filename;
  }

  const handleDownloadPdf = () => run("pdf", async () => {
    const saved = await savePdfLocally();
    if (saved) toast.success(isNative ? "PDF saved to device Documents ✓" : "PDF report downloaded ✓");
    else toast.error("Could not write the PDF to device storage.");
  });

  const handleSharePdf = () => run("sharePdf", async () => {
    const uri = await savePdfLocally();
    if (!uri) throw new Error("Could not write the PDF to device storage.");
    const { Share } = await import("@capacitor/share");
    await Share.share({ title: `Zero Degree report — ${profile?.companyName}`, text: `HVAC & cooling assessment report for ${profile?.companyName}.`, url: uri, dialogTitle: "Share PDF report" });
  });

  const handleSendReport = () => run("email", async () => {
    if (!profile?.companyName) throw new Error("Please fill in the Company page before sending the report.");
    if (total === 0) throw new Error("No equipment has been recorded yet.");
    const recipientList = recipients.split(",").map((r) => r.trim()).filter((r) => r.includes("@"));
    try { await savePdfLocally(); } catch (err) { console.warn("Local PDF save failed:", err); }

    const jobId = crypto.randomUUID();
    const payload = currentData();
    addJobToQueue({ jobId, status: "pending", createdAt: Date.now(), reporterName: engineer, recipients: recipientList, payload });
    if (!isOnline) {
      toast.warning("You're offline — the report is in the sync queue and will go out when you're back online.");
      setRecipients("");
      return;
    }
    const r = await postJob(jobId, engineer, payload, recipientList);
    if (r.ok) {
      updateJobStatus(jobId, "synced");
      toast.success(r.emailed ? "Report emailed with the PDF and the PostMan workbook attached ✓" : `Saved to the team cloud, but the email did not go: ${r.error || "email not configured"}`);
      setRecipients("");
    } else {
      toast.error(`${r.error} — kept in the queue to retry.`);
    }
  });

  // ── Team data exchange (Excel) ────────────────────────────────────────────
  const handleExportExcel = () => run("xlsx", async () => {
    const result = await exportExcel(currentData(), engineer);
    if (result) toast.success(isNative ? "Excel saved to device Documents ✓ Share it with the team or drop it into PostMan." : "Excel data file downloaded ✓");
    else toast.error("Could not write the Excel file to device storage.");
  });

  const handleShareExcel = () => run("shareXlsx", async () => {
    const ok = await shareExcel(currentData(), engineer);
    if (!ok) toast.error("Sharing is only available in the Android app — use Export on the web.");
  });

  /* The same bytes the Excel export would write, handed straight to the
     PostMan window that opened us. PostMan reads them with its ordinary
     importer, so there is nothing here it does not already understand. */
  function handleSendToPostman() {
    const { base64 } = buildExcelBase64(currentData(), engineer);
    const r = sendToPostman(base64, profile?.companyName || "", ZD_FORMAT);
    if (r.ok) {
      setHandedOver(true);
      toast.success(`${total} unit(s) sent to PostMan ✓`);
    } else {
      toast.error(`${r.reason} Export the Excel file and drop it into PostMan instead.`);
    }
  }

  async function handleImportExcel(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    await run("import", async () => {
      let data = currentData();
      let summary = emptySummary();
      for (const file of files) {
        const merged = mergeDataSets(data, parseWorkbook(await readWorkbookFile(file)));
        data = merged.data;
        summary = addSummaries(summary, merged.summary);
      }
      replaceData(data);
      toast.success(`Merged ${files.length} file${files.length === 1 ? "" : "s"} ✓\n${describeSummary(summary)}`, { duration: 8000 });
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Team cloud ────────────────────────────────────────────────────────────
  const handlePullTeam = () => run("pull", async () => {
    if (!profile?.companyName) throw new Error("Fill in the Company page first — team data is matched by company name.");
    const subs = await fetchTeamData(profile.companyName);
    if (!subs.length) return void toast.info(`Nothing in the team cloud for "${profile.companyName}" yet.`);
    let data = currentData();
    let summary = emptySummary();
    // oldest first, so the newest copy of each tag is the one left standing
    for (const s of [...subs].reverse()) {
      const merged = mergeDataSets(data, s.payload);
      data = merged.data;
      summary = addSummaries(summary, merged.summary);
    }
    replaceData(data);
    const who = [...new Set(subs.map((s) => s.reporterName))].join(", ");
    toast.success(`Pulled ${subs.length} submission(s) from ${who} ✓\n${describeSummary(summary)}`, { duration: 9000 });
  });

  const handlePushTeam = () => run("push", async () => {
    if (!profile?.companyName) throw new Error("Fill in the Company page first — team data is matched by company name.");
    const r = await postJob(crypto.randomUUID(), engineer, currentData(), [], false);
    if (r.ok && r.stored) toast.success("Your readings are in the team cloud ✓ Teammates can now pull them.");
    else throw new Error(r.error || "The team cloud is not set up on this server.");
  });

  // ── Offline queue ─────────────────────────────────────────────────────────
  const handleSyncQueue = () => run("queue", async () => {
    let successCount = 0;
    for (const job of pendingJobs) {
      const r = await postJob(job.jobId, job.reporterName, job.payload, job.recipients);
      if (r.ok) {
        updateJobStatus(job.jobId, "synced");
        successCount++;
      }
    }
    if (successCount > 0) toast.success(`Sent ${successCount} queued report(s) ✓`);
    else toast.error("Failed to send queued reports. Check the internet connection.");
  });

  const spin = (k: string) => busy === k;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ── Audit summary ─────────────────────────────────────────────────── */}
      <Card className="bg-slate-950/40 border-white/10 backdrop-blur-md">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-sky-400" />
            <div>
              <CardTitle>Report &amp; Sharing</CardTitle>
              <CardDescription className="text-xs text-slate-400">The HVAC &amp; cooling assessment for this plant.</CardDescription>
            </div>
          </div>
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0", isOnline ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400")}>{isOnline ? "Online" : "Offline"}</span>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
            <div className="text-base font-semibold text-white break-words">{profile?.companyName || "Plant not set — fill in the Company page"}</div>
            <div className="text-xs text-slate-400 mt-0.5 break-words">{address || "Location not set"}</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
              {[
                { icon: Wind, n: acCount, label: "AC units", c: "text-sky-400" },
                { icon: Snowflake, n: chillers.length + ahuCount, label: "Chillers + AHUs", c: "text-indigo-300" },
                { icon: Waves, n: coolingTowers.length, label: "Cooling towers", c: "text-cyan-300" },
                { icon: Users, n: recorders, label: "Recorders", c: "text-amber-400" },
              ].map(({ icon: Icon, n, label, c }) => (
                <div key={label} className="rounded-lg bg-slate-950/60 border border-white/5 p-3 text-center">
                  <Icon className={cn("size-4 mx-auto mb-1", c)} />
                  <div className="text-xl font-bold text-white tabular-nums">{n}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
                </div>
              ))}
            </div>
            {!ready && (
              <div className="mt-3 text-[11px] text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="size-3.5 shrink-0" />
                {!profile?.companyName ? "Fill in the Company page before generating a report." : "Record at least one AC, chiller, AHU or cooling tower first."}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── PDF report ────────────────────────────────────────────────────── */}
      <Card className="bg-slate-950/40 border-white/10 backdrop-blur-md">
        <CardHeader className="flex flex-row items-center gap-2">
          <Mail className="size-5 text-sky-400" />
          <div>
            <CardTitle>PDF Report</CardTitle>
            <CardDescription className="text-xs text-slate-400">Summary, every unit&apos;s readings with the worked calculation, status, charts and who recorded what.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reporterName">Auditing engineer</Label>
              <Input id="reporterName" placeholder="Your name" value={reporterName} onChange={(e) => setReporterName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recipients">Extra recipient emails</Label>
              <Input id="recipients" placeholder="manager@plant.com, ... (comma separated)" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 -mt-2">The KISEM admin team is always copied. The email carries the PDF and the Excel workbook PostMan reads.</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="secondary" onClick={handleDownloadPdf} disabled={!ready || !!busy} className="gap-2 border-white/10 bg-slate-900/60 hover:bg-slate-800 text-white">
              {spin("pdf") ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              {isNative ? "Save PDF" : "Download PDF"}
            </Button>
            {isNative && (
              <Button variant="secondary" onClick={handleSharePdf} disabled={!ready || !!busy} className="gap-2 border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-100">
                {spin("sharePdf") ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
                Share PDF
              </Button>
            )}
            <Button onClick={handleSendReport} disabled={!!busy || !ready} className={cn("gap-2", !isNative && "sm:col-span-2")}>
              {spin("email") ? <Loader2 className="size-4 animate-spin" /> : isOnline ? <Send className="size-4" /> : <CloudLightning className="size-4" />}
              {isOnline ? "Email Report" : "Queue Offline Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Handed over from PostMan ──────────────────────── */}
      {handoff && (
        <Card className="bg-slate-950/40 border-emerald-500/25 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Send className="size-5 text-emerald-400" />Send to PostMan</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Opened from the report for <span className="text-slate-200">{handoff.company || "this plant"}</span>{handoff.fy ? ` (${handoff.fy})` : ""}. This sends the same Excel workbook the Export button writes — PostMan reads it exactly as if you had dropped the file in, and refuses it if the plant name does not match its own.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleSendToPostman} disabled={total === 0} className="w-full gap-2 font-semibold">
              <Send className="size-4" />
              {handedOver ? "Send again" : `Send ${total} unit(s) to PostMan`}
            </Button>
            {handedOver && <p className="text-[10px] text-emerald-400/90">Sent. Anything you change here can be sent again — PostMan merges by equipment tag, so nothing is duplicated.</p>}
          </CardContent>
        </Card>
      )}

      {/* ── Team data exchange (Excel) ─────────────────────────────────────── */}
      <Card className="bg-slate-950/40 border-white/10 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="size-5 text-sky-400" />Team Data Exchange (Excel)</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Each engineer exports their readings as Excel; one person imports every file to combine them. Equipment merges by tag — when both sides have the same tag, the copy saved most recently wins, so re-importing never creates duplicates. Each record keeps the name of the engineer who took it. The same file drops straight into <span className="text-slate-200">PostMan</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button onClick={handleExportExcel} disabled={!!busy || total === 0} variant="secondary" className="w-full border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 gap-2 font-semibold">
            {spin("xlsx") ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Export Data (Excel)
          </Button>
          {isNative && (
            <Button onClick={handleShareExcel} disabled={!!busy || total === 0} variant="secondary" className="w-full border border-sky-500/30 text-sky-200 hover:bg-sky-500/10 gap-2 font-semibold">
              {spin("shareXlsx") ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
              Share with Team
            </Button>
          )}
          <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx,.xls" multiple className="hidden" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={!!busy} variant="secondary" className={cn("w-full border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10 gap-2 font-semibold", !isNative && "sm:col-span-2")}>
            {spin("import") ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            Import Team Data (Excel)
          </Button>
          {total === 0 && <p className="text-[10px] text-slate-500 sm:col-span-3">Export becomes available once at least one unit is saved. Import works any time.</p>}
        </CardContent>
      </Card>

      {/* ── Team cloud ─────────────────────────────────────────────────────── */}
      <Card className="bg-slate-950/40 border-white/10 backdrop-blur-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CloudDownload className="size-5 text-indigo-300" />Team Cloud</CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Without passing files around: upload your readings, and pull everything your teammates have submitted for <span className="text-slate-200">{profile?.companyName || "this company"}</span>. The same merge rule applies — by tag, newest save wins. Needs a connection and the database on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button onClick={handlePushTeam} disabled={!!busy || !isOnline || total === 0 || !profile?.companyName} variant="secondary" className="w-full border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 gap-2 font-semibold">
            {spin("push") ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
            Upload My Data
          </Button>
          <Button onClick={handlePullTeam} disabled={!!busy || !isOnline || !profile?.companyName} variant="secondary" className="w-full border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/10 gap-2 font-semibold">
            {spin("pull") ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
            Pull Team Data
          </Button>
          <p className="text-[10px] text-slate-500 sm:col-span-2">Server: {typeof window !== "undefined" ? getServerBase() : ""}</p>
        </CardContent>
      </Card>

      {/* ── Sync queue ────────────────────────────────────────────────────── */}
      {pendingJobs.length > 0 && (
        <Card className="bg-slate-950/40 border-amber-500/20 backdrop-blur-md">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5 text-amber-400"><RefreshCw className="size-4" />Offline Sync Queue</CardTitle>
                <CardDescription className="text-xs text-slate-400">{pendingJobs.length} report(s) waiting to be sent.</CardDescription>
              </div>
              <Button variant="secondary" size="sm" onClick={handleSyncQueue} disabled={!!busy || !isOnline} className="text-xs border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-white">
                {spin("queue") ? "Syncing…" : "Sync Now"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingJobs.map((job) => (
              <div key={job.jobId} className="p-3 rounded-lg border border-white/5 bg-slate-950/60 flex justify-between items-center text-xs gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-200 block truncate">{job.payload.profile?.companyName}</span>
                  <span className="text-[10px] text-slate-500">
                    {job.payload.airUnits.length + job.payload.chillers.length + job.payload.coolingTowers.length} units • by {job.reporterName} • Queued {new Date(job.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-400 shrink-0">PENDING</span>
              </div>
            ))}
            {!isOnline && <p className="text-[10px] text-amber-300/80 text-center pt-2">Connect to the internet to send the queued reports.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
