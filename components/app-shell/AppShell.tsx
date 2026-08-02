"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useColorMode } from "@/components/providers/ColorModeProvider";
import { useAuthContext } from "@/context/AuthContext";
import { AuctioneerService } from "@/services/auctioneer";
import {
  isNavItemActive,
  PAGE_TITLES,
  PRIMARY_NAVIGATION,
  SECONDARY_NAVIGATION,
  type NavItem,
} from "./navigation";
import styles from "./AppShell.module.css";

const InputsHistoryModal = dynamic(
  () => import("@/components/modals/InputsHistoryModal"),
  { ssr: false }
);
const OutlookDialog = dynamic(
  () => import("@/components/outlook/LazyOutlookDialog"),
  { ssr: false }
);

const COLLAPSED_KEY = "cv-sidebar-collapsed";

function navSummaryFetcher() {
  return Promise.all([
    AuctioneerService.getStatus(),
    AuctioneerService.getIncomingSummary(),
  ]).then(([status, summary]) => ({
    availableCount: summary.availableCount,
    showBadge: status.enabled && status.configured,
  }));
}

function visibleRefreshInterval() {
  if (typeof document === "undefined") return 60_000;
  return document.visibilityState === "visible" && navigator.onLine
    ? 60_000
    : 0;
}

function NavLink({
  item,
  active,
  badge,
  collapsed,
  closeMobile,
}: {
  item: NavItem;
  active: boolean;
  badge?: number;
  collapsed: boolean;
  closeMobile: () => void;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        className={styles.navLink}
        data-active={active}
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={closeMobile}
      >
        <Icon className={styles.navIcon} strokeWidth={1.8} aria-hidden />
        <span className={styles.navText}>{item.label}</span>
        {typeof badge === "number" && badge > 0 ? (
          <span className={styles.badge} aria-label={`${badge} available`}>
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuthContext();
  const { resolvedTheme, toggleMode } = useColorMode();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showOutlook, setShowOutlook] = useState(false);

  const { data: summary } = useSWR(
    "auctioneer/navigation-summary",
    navSummaryFetcher,
    {
      refreshInterval: visibleRefreshInterval,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
    }
  );

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const visiblePrimary = useMemo(
    () =>
      PRIMARY_NAVIGATION.filter((item) =>
        item.visible ? item.visible(user) : true
      ),
    [user]
  );
  const title =
    Object.entries(PAGE_TITLES).find(([prefix]) =>
      pathname.startsWith(prefix)
    )?.[1] ?? "Workspace";
  const userLabel = user?.username || user?.email || "Loading account";
  const initial = userLabel.charAt(0).toUpperCase();
  const closeMobile = () => setMobileOpen(false);

  return (
    <div
      className={styles.shell}
      data-collapsed={collapsed}
      data-mobile-open={mobileOpen}
    >
      <button
        className={styles.mobileBackdrop}
        aria-label="Close navigation"
        onClick={closeMobile}
      />

      <aside
        className={styles.sidebar}
        aria-label="Primary navigation"
        aria-hidden={mobileOpen ? undefined : undefined}
      >
        <div className={styles.brandRow}>
          <Link className={styles.brand} href="/dashboard" onClick={closeMobile}>
            <Image
              className={`${styles.brandImage} ${styles.brandLight}`}
              src="/brand/asset-insight-light-compact.png"
              width={298}
              height={96}
              priority
              alt="Asset Insight"
            />
            <Image
              className={`${styles.brandImage} ${styles.brandDark}`}
              src="/brand/asset-insight-dark-compact.png"
              width={298}
              height={96}
              priority
              alt="Asset Insight"
            />
            <span className={styles.mark} aria-hidden>
              AI
            </span>
          </Link>
          <button
            className={`app-button app-button--secondary app-button--icon ${styles.collapseButton}`}
            onClick={() => {
              if (window.innerWidth < 1024) closeMobile();
              else setCollapsed((value) => !value);
            }}
            aria-label={
              mobileOpen
                ? "Close navigation"
                : collapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
            }
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {mobileOpen ? (
              <X size={18} aria-hidden />
            ) : collapsed ? (
              <ChevronRight size={17} aria-hidden />
            ) : (
              <ChevronLeft size={17} aria-hidden />
            )}
          </button>
        </div>

        <div className={styles.navScroll}>
          <nav className={styles.navGroup}>
            <p className={styles.navLabel}>Workspace</p>
            <ul className={styles.navList}>
              {visiblePrimary.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavItemActive(item, pathname)}
                  badge={
                    item.href === "/incoming" && summary?.showBadge
                      ? summary.availableCount
                      : undefined
                  }
                  collapsed={collapsed}
                  closeMobile={closeMobile}
                />
              ))}
              <li>
                <button
                  className={`${styles.navLink} ${styles.actionButton}`}
                  title={collapsed ? "Drafts" : undefined}
                  onClick={() => {
                    closeMobile();
                    setShowDrafts(true);
                  }}
                >
                  <Clock3 className={styles.navIcon} strokeWidth={1.8} aria-hidden />
                  <span className={styles.navText}>Drafts</span>
                </button>
              </li>
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <p className={styles.navLabel}>Tools</p>
            <ul className={styles.navList}>
              <li>
                <button
                  className={`${styles.navLink} ${styles.actionButton}`}
                  title={collapsed ? "Outlook calendar" : undefined}
                  onClick={() => {
                    closeMobile();
                    setShowOutlook(true);
                  }}
                >
                  <CalendarDays
                    className={styles.navIcon}
                    strokeWidth={1.8}
                    aria-hidden
                  />
                  <span className={styles.navText}>Outlook calendar</span>
                </button>
              </li>
              <li>
                <button
                  className={`${styles.navLink} ${styles.actionButton}`}
                  title={
                    collapsed
                      ? resolvedTheme === "dark"
                        ? "Use light theme"
                        : "Use dark theme"
                      : undefined
                  }
                  onClick={toggleMode}
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className={styles.navIcon} strokeWidth={1.8} aria-hidden />
                  ) : (
                    <Moon className={styles.navIcon} strokeWidth={1.8} aria-hidden />
                  )}
                  <span className={styles.navText}>
                    {resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
                  </span>
                </button>
              </li>
            </ul>
          </nav>

          <nav className={styles.navGroup}>
            <p className={styles.navLabel}>Account</p>
            <ul className={styles.navList}>
              {SECONDARY_NAVIGATION.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavItemActive(item, pathname)}
                  collapsed={collapsed}
                  closeMobile={closeMobile}
                />
              ))}
            </ul>
          </nav>
        </div>

        <div className={styles.footer}>
          <Link
            href="/settings"
            className={styles.profile}
            title={collapsed ? userLabel : undefined}
            onClick={closeMobile}
          >
            <span className={styles.avatar} aria-hidden>
              {initial}
            </span>
            <span className={styles.profileCopy}>
              <span className={styles.profileName}>{userLabel}</span>
              <span className={styles.profileEmail}>{user?.email ?? "Secure workspace"}</span>
            </span>
          </Link>
        </div>
      </aside>

      <main className={styles.main}>
        <header className={styles.mobileHeader}>
          <button
            className="app-button app-button--secondary app-button--icon"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={19} aria-hidden />
          </button>
          <div className={styles.mobileHeading}>
            <span className={styles.mobileEyebrow}>Asset Insight</span>
            <span className={styles.mobileTitle}>{title}</span>
          </div>
          <div className={styles.mobileActions}>
            <button
              className="app-button app-button--secondary app-button--icon"
              onClick={toggleMode}
              aria-label={
                resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"
              }
            >
              {resolvedTheme === "dark" ? (
                <Sun size={18} aria-hidden />
              ) : (
                <Moon size={18} aria-hidden />
              )}
            </button>
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>

      {showDrafts ? (
        <InputsHistoryModal
          isOpen
          onClose={() => setShowDrafts(false)}
          onLoadInput={() => undefined}
        />
      ) : null}
      {showOutlook ? (
        <OutlookDialog onClose={() => setShowOutlook(false)} />
      ) : null}
    </div>
  );
}
