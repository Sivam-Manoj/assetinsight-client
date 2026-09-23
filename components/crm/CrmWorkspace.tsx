"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { MapPin, Plus, WifiOff } from "lucide-react";
import { useCallback, useState } from "react";
import { useAuthContext } from "@/context/AuthContext";
import type { AuthUser } from "@/services/auth";
import { isCrmId } from "@/services/crm";
import CrmTaskList from "./CrmTaskList";
import { useCrmOnline } from "./useCrmRead";
import styles from "./CrmWorkspace.module.css";

const panelLoading = () => <div className={styles.loading} role="status">Opening CRM tools…</div>;
const CrmTaskDetail = dynamic(() => import("./CrmTaskDetail"), { loading: panelLoading });
const CrmLeadForm = dynamic(() => import("./CrmLeadForm"), { loading: panelLoading });
const CrmCoverageForm = dynamic(() => import("./CrmCoverageForm"), { loading: panelLoading });
const CrmTransfers = dynamic(() => import("./CrmTransfers"), { loading: panelLoading });
const CrmOutlook = dynamic(() => import("./CrmOutlook"), { loading: panelLoading });

export default function CrmWorkspace() {
  const { user, loading, loggingOut, deviceAccess } = useAuthContext();
  if (loading || loggingOut) return <div className="app-page" role="status">Loading your CRM access…</div>;
  if (user?.isCrmAgent !== true || deviceAccess) return <div className="app-page"><section className={`app-surface ${styles.empty}`}><h1 className="app-title">CRM access required</h1><p>This workspace is available to enabled CRM agents. Contact your administrator to request access.</p></section></div>;
  return <AuthorizedCrmWorkspace key={user._id} user={user} />;
}

function AuthorizedCrmWorkspace({ user }: { user: AuthUser }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState(user);
  const [leadOpen, setLeadOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const online = useCrmOnline();
  const tab = searchParams.get("view") === "transfers" ? "transfers" : searchParams.get("view") === "outlook" ? "outlook" : "tasks";
  const rawTask = searchParams.get("task");
  const taskId = isCrmId(rawTask) ? rawTask : null;
  const navigate = useCallback((view: string, task?: string) => {
    const params = new URLSearchParams();
    if (view !== "tasks") params.set("view", view);
    if (task) params.set("task", task);
    router.replace(`/crm${params.size ? `?${params}` : ""}`, { scroll: false });
  }, [router]);
  const openTask = useCallback((id: string) => navigate(tab, id), [navigate, tab]);
  const changed = useCallback(() => setRefreshVersion((value) => value + 1), []);
  const closeTask = useCallback(() => navigate(tab), [navigate, tab]);
  const coverageMissing = !(profile.crmAddress?.trim() && profile.crmQuadrant?.trim() && profile.crmSpecializations?.length);
  return <div className={`app-page ${styles.page}`}>
    <header className={styles.heading}><div><h1 className="app-title">CRM</h1><p>Leads, follow-ups and appointments.</p></div><div className={styles.actions}><button className="app-button app-button--secondary" onClick={() => setCoverageOpen(true)}><MapPin size={17} />Coverage</button>{(!user.role || user.role === "user") && <button className="app-button app-button--primary" disabled={!online} onClick={() => setLeadOpen(true)}><Plus size={17} />Add lead</button>}</div></header>
    {!online && <div className={styles.notice} role="status"><WifiOff size={18} />You’re offline. Previously loaded tasks may be visible; reconnect before making changes.</div>}
    {coverageMissing && <div className={styles.notice}><span>Complete your coverage area and specializations for CRM assignments.</span><button className={styles.textButton} onClick={() => setCoverageOpen(true)}>Set up coverage</button></div>}
    {rawTask && !taskId && <div className={styles.error} role="alert">This task link is invalid. Select a task below to continue.</div>}
    <div className={`app-surface ${styles.workspace}`}><nav className={styles.tabs} aria-label="CRM views">{([['tasks', 'Tasks'], ['transfers', 'Transfers'], ['outlook', 'Outlook']] as const).map(([value, label]) => <button key={value} aria-current={tab === value ? "page" : undefined} onClick={() => navigate(value)}>{label}</button>)}</nav>
      {tab === "tasks" && <CrmTaskList ownerId={user._id} onOpenTask={openTask} refreshVersion={refreshVersion} />}
      {tab === "transfers" && <CrmTransfers ownerId={user._id} onChanged={changed} onOpenTask={openTask} />}
      {tab === "outlook" && <CrmOutlook ownerId={user._id} onOpenTask={openTask} refreshVersion={refreshVersion} />}
    </div>
    {taskId && <CrmTaskDetail key={`${user._id}:${taskId}`} taskId={taskId} ownerId={user._id} user={{ id: user._id, name: user.username, company: user.companyName, email: user.email, phone: user.contactPhone }} onClose={closeTask} onChanged={changed} />}
    {leadOpen && <CrmLeadForm ownerId={user._id} onClose={() => setLeadOpen(false)} onCreated={(id) => { setLeadOpen(false); changed(); navigate("tasks", id); }} />}
    {coverageOpen && <CrmCoverageForm ownerId={user._id} user={profile} onClose={() => setCoverageOpen(false)} onSaved={(saved) => { setProfile(saved); setCoverageOpen(false); }} />}
  </div>;
}
