"use client";

import { ChevronLeft, ChevronRight, Inbox, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { CrmService, CRM_STATUSES, CRM_STATUS_LABELS, crmErrorMessage, type CrmTaskStatus, type CrmTaskSummary, type GetMyTasksParams } from "@/services/crm";
import { useCrmRead } from "./useCrmRead";
import { crmSource } from "./crmListPolicy";
export { crmSource } from "./crmListPolicy";
import styles from "./CrmWorkspace.module.css";

export function crmDate(value?: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function CrmStage({ status }: { status: CrmTaskStatus }) {
  const tone = status === "won" ? "success" : status === "lost" ? "muted" : status === "new_lead" ? "neutral" : status === "decision_pending" ? "warning" : "info";
  return <span className={styles.stage} data-tone={tone}><span aria-hidden="true" />{CRM_STATUS_LABELS[status] || "Not recorded"}</span>;
}

type Selection = { ids: ReadonlySet<string>; disabled?: boolean; onToggle: (task: CrmTaskSummary) => void; onPage: (tasks: CrmTaskSummary[]) => void };
type Props = { ownerId: string; onOpenTask: (id: string) => void; refreshVersion?: number; selection?: Selection; initialStatus?: "all" };

export default function CrmTaskList({ ownerId, onOpenTask, refreshVersion = 0, selection, initialStatus }: Props) {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<GetMyTasksParams>({ page: 1, limit: 20, status: initialStatus });
  const [appliedSearch, setAppliedSearch] = useState("");
  const [pageRecovery, setPageRecovery] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search.trim());
      setFilters((current) => current.page === 1 ? current : { ...current, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = { ...filters, q: appliedSearch || undefined };
  const request = useCrmRead(`crm:tasks:${ownerId}:${refreshVersion}:${pageRecovery}:${JSON.stringify(query)}`, (signal) => CrmService.getMyTasks(query, { signal }));
  const data = request.data;
  useEffect(() => {
    if (!data) return;
    const lastPage = Math.max(1, Math.ceil(data.total / data.limit));
    if (data.page > lastPage) {
      setFilters((current) => ({ ...current, page: lastPage }));
      setPageRecovery((version) => version + 1);
    }
  }, [data]);
  const page = data?.page ?? filters.page ?? 1;
  const limit = data?.limit ?? filters.limit ?? 20;
  const total = data?.total ?? 0;
  const allPageSelected = Boolean(data?.items.length && data.items.every((task) => selection?.ids.has(task._id)));
  function filter(value: Partial<GetMyTasksParams>) { setFilters((current) => ({ ...current, ...value, page: 1 })); }
  return <section aria-label={selection ? "Tasks for Outlook export" : "CRM tasks"} className={styles.list}>
    <div className={styles.filters}>
      <label className={styles.search}><Search size={17} aria-hidden="true" /><span className="sr-only">Search CRM tasks</span><input type="search" value={search} maxLength={150} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, company, phone…" /></label>
      <label><span className="sr-only">Task stage</span><select className="app-field" value={filters.status || ""} onChange={(event) => filter({ status: event.target.value as GetMyTasksParams["status"] || undefined })}><option value="">Open tasks</option><option value="all">All tasks</option>{CRM_STATUSES.map((status) => <option key={status} value={status}>{CRM_STATUS_LABELS[status]}</option>)}</select></label>
      <label><span className="sr-only">Lead source</span><select className="app-field" value={filters.leadSource || ""} onChange={(event) => filter({ leadSource: event.target.value as GetMyTasksParams["leadSource"] || undefined })}><option value="">All sources</option><option value="generic">Imported</option><option value="organic">Organic</option></select></label>
      <label><span className="sr-only">Due date filter</span><select className="app-field" value={filters.due || ""} onChange={(event) => filter({ due: event.target.value as GetMyTasksParams["due"] || undefined })}><option value="">Any due date</option><option value="overdue">Overdue</option><option value="upcoming">Next 7 days</option></select></label>
      <button className="app-button app-button--secondary app-button--icon" aria-label="Refresh tasks" title="Refresh tasks" disabled={request.isValidating} onClick={() => void request.mutate().catch(() => {})}><RefreshCw size={17} className={request.isValidating ? styles.spin : undefined} /></button>
    </div>
    <div className={styles.resultLine}><span role="status">{data ? `${total.toLocaleString()} matching ${total === 1 ? "task" : "tasks"}` : request.error ? "Tasks unavailable" : "Loading tasks…"}</span><span>{request.receivedAt ? `Updated ${new Date(request.receivedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}{request.isValidating && data ? " · Refreshing…" : ""}</span></div>
    {request.error && <div role="alert" className={styles.error}>{crmErrorMessage(request.error, "Unable to load tasks.")} <button className={styles.textButton} onClick={() => void request.mutate().catch(() => {})}>Try again</button>{data && <span> Showing the last loaded page.</span>}</div>}
    {!data && !request.error && <div className={styles.loading} aria-busy="true">Loading your task list…</div>}
    {data?.items.length === 0 && <div className={styles.empty}><Inbox size={28} aria-hidden="true" /><h2>No matching tasks</h2><p>Try another search or filter, or add a new lead.</p></div>}
    {Boolean(data?.items.length) && <div className={styles.tableRegion}>
      <table className={styles.table}><caption className="sr-only">Tasks ordered by due date, start date and creation date</caption><thead><tr>{selection && <th className={styles.checkboxCell}><input type="checkbox" aria-label="Select this page for Outlook" checked={allPageSelected} disabled={selection.disabled} onChange={() => selection.onPage(data!.items)} /></th>}<th scope="col">Contact</th><th scope="col">Stage</th><th scope="col">Source</th><th scope="col">Due</th><th scope="col">Last update</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
      <tbody>{data?.items.map((task) => <tr key={task._id}>
        {selection && <td className={styles.checkboxCell}><input type="checkbox" aria-label={`Select ${task.clientName} for Outlook`} checked={selection.ids.has(task._id)} disabled={selection.disabled || (!selection.ids.has(task._id) && selection.ids.size >= 100)} onChange={() => selection.onToggle(task)} /></td>}
        <td className={styles.contact}><button className={styles.contactButton} onClick={() => onOpenTask(task._id)}>{task.clientName || task.title || "Unnamed contact"}</button><span>{task.companyName || task.email || task.phoneFormatted || task.phoneRaw || "Company not recorded"}</span></td>
        <td className={styles.stageCell}><CrmStage status={task.status} /></td><td className={styles.source}>{crmSource(task)}</td><td className={styles.due}><span className={styles.mobileLabel}>Due </span>{crmDate(task.dueDate)}</td><td className={styles.lastUpdate}><span>{task.latestComment || "No update recorded"}</span></td><td className={styles.openCell}><button className="app-button app-button--icon" aria-label={`Open task for ${task.clientName}`} onClick={() => onOpenTask(task._id)}><ChevronRight size={17} /></button></td>
      </tr>)}</tbody></table>
    </div>}
    <div className={styles.pager}><span>{data ? total ? `${Math.min((page - 1) * limit + 1, total).toLocaleString()}–${Math.min(page * limit, total).toLocaleString()} of ${total.toLocaleString()}` : "0 tasks" : "—"}</span><div><label>Rows <select aria-label="Tasks per page" value={filters.limit} onChange={(event) => filter({ limit: Number(event.target.value) })}><option value="20">20</option><option value="50">50</option></select></label><button className="app-button app-button--secondary" disabled={page <= 1 || !data || request.isValidating} onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, page - 1) }))}><ChevronLeft size={15} />Previous</button><button className="app-button app-button--secondary" disabled={!data || page * limit >= total || request.isValidating} onClick={() => setFilters((current) => ({ ...current, page: page + 1 }))}>Next<ChevronRight size={15} /></button></div></div>
  </section>;
}
