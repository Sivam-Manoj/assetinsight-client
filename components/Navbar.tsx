"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Avatar,
  Box,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  CalendarMonthRounded,
  AssignmentTurnedInRounded,
  ChevronLeftRounded,
  ChevronRightRounded,
  CloseRounded,
  DarkModeRounded,
  DashboardRounded,
  DescriptionRounded,
  LightModeRounded,
  MenuRounded,
  PersonRounded,
  ScheduleRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import { useColorMode } from "@/components/providers/ColorModeProvider";
import OutlookConnectionDialog from "@/components/outlook/OutlookConnectionDialog";
import { useAuthContext } from "@/context/AuthContext";
import { useOutlookCalendar } from "@/hooks/useOutlookCalendar";

const InputsHistoryModal = dynamic(
  () => import("@/components/modals/InputsHistoryModal"),
  { ssr: false }
);

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardRounded },
  { label: "My Reports", href: "/reports", icon: DescriptionRounded },
  { label: "Previews", href: "/previews", icon: VisibilityRounded },
  {
    label: "Approvals",
    href: "/approvals",
    icon: AssignmentTurnedInRounded,
    requiresReportApprover: true,
  },
  {
    label: "Releases",
    href: "/releases",
    icon: AssignmentTurnedInRounded,
    requiresReleaseManager: true,
  },
];

const secondaryNavItems = [
  { label: "Settings", href: "/settings", icon: PersonRounded },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/reports": "My Reports",
  "/previews": "Previews",
  "/approvals": "Assigned Approvals",
  "/releases": "Assigned Releases",
  "/settings": "Settings",
};

function NavLinkItem({
  collapsed,
  active,
  href,
  label,
  icon: Icon,
  onClick,
}: {
  collapsed: boolean;
  active: boolean;
  href: string;
  label: string;
  icon: typeof DashboardRounded;
  onClick?: () => void;
}) {
  const content = (
    <Link href={href} onClick={onClick}>
      <Stack
        direction="row"
        spacing={collapsed ? 0 : 1.5}
        sx={{
          px: collapsed ? 0.75 : 1.5,
          py: collapsed ? 0.75 : 1.1,
          minHeight: collapsed ? 52 : 56,
          borderRadius: collapsed ? 3 : 4,
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          color: active ? "var(--app-accent)" : "var(--app-text-muted)",
          bgcolor: active ? "var(--app-accent-soft)" : "transparent",
          border: active
            ? "1px solid rgba(244, 63, 94, 0.18)"
            : "1px solid transparent",
          transition: "all 180ms ease",
          "&:hover": {
            bgcolor: active
              ? "var(--app-accent-soft)"
              : "rgba(148, 163, 184, 0.08)",
            color: active ? "var(--app-accent)" : "var(--app-text)",
          },
        }}
      >
        <Avatar
          variant="rounded"
          sx={{
            width: collapsed ? 34 : 38,
            height: collapsed ? 34 : 38,
            borderRadius: collapsed ? 2.5 : 3,
            bgcolor: active
              ? alpha("#e11d48", 0.14)
              : "rgba(148, 163, 184, 0.08)",
            color: "inherit",
          }}
        >
          <Icon fontSize="small" />
        </Avatar>
        {!collapsed ? (
          <Typography sx={{ fontWeight: active ? 800 : 700 }}>{label}</Typography>
        ) : null}
      </Stack>
    </Link>
  );

  return collapsed ? (
    <Tooltip title={label} placement="right">
      {content}
    </Tooltip>
  ) : (
    content
  );
}

function NavActionItem({
  collapsed,
  active,
  label,
  icon: Icon,
  onClick,
}: {
  collapsed: boolean;
  active: boolean;
  label: string;
  icon: typeof DashboardRounded;
  onClick: () => void;
}) {
  const content = (
    <Stack
      direction="row"
      spacing={collapsed ? 0 : 1.5}
      sx={{
        px: collapsed ? 0.75 : 1.5,
        py: collapsed ? 0.75 : 1.1,
        minHeight: collapsed ? 52 : 56,
        borderRadius: collapsed ? 3 : 4,
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        color: active ? "var(--app-accent)" : "var(--app-text-muted)",
        bgcolor: active ? "var(--app-accent-soft)" : "transparent",
        border: active
          ? "1px solid rgba(244, 63, 94, 0.18)"
          : "1px solid transparent",
        cursor: "pointer",
        transition: "all 180ms ease",
        "&:hover": {
          bgcolor: active
            ? "var(--app-accent-soft)"
            : "rgba(148, 163, 184, 0.08)",
          color: active ? "var(--app-accent)" : "var(--app-text)",
        },
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <Avatar
        variant="rounded"
        sx={{
          width: collapsed ? 34 : 38,
          height: collapsed ? 34 : 38,
          borderRadius: collapsed ? 2.5 : 3,
          bgcolor: active
            ? alpha("#e11d48", 0.14)
            : "rgba(148, 163, 184, 0.08)",
          color: "inherit",
        }}
      >
        <Icon fontSize="small" />
      </Avatar>
      {!collapsed ? (
        <Typography sx={{ fontWeight: active ? 800 : 700 }}>{label}</Typography>
      ) : null}
    </Stack>
  );

  return collapsed ? (
    <Tooltip title={label} placement="right">
      {content}
    </Tooltip>
  ) : (
    content
  );
}

function RailAction({
  collapsed,
  label,
  icon,
  accentColor,
  accentBg,
  onClick,
}: {
  collapsed: boolean;
  label: string;
  icon: React.ReactNode;
  accentColor: string;
  accentBg: string;
  onClick: () => void;
}) {
  const content = (
    <Stack
      direction="row"
      spacing={collapsed ? 0 : 1.5}
      sx={{
        px: collapsed ? 0.75 : 1,
        py: collapsed ? 0.75 : 1.05,
        minHeight: collapsed ? 52 : 54,
        borderRadius: collapsed ? 3 : 4,
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        color: "var(--app-text-muted)",
        cursor: "pointer",
        transition: "all 180ms ease",
        "&:hover": {
          bgcolor: "rgba(148, 163, 184, 0.08)",
          color: "var(--app-text)",
        },
      }}
      onClick={onClick}
    >
      <Avatar
        variant="rounded"
        sx={{
          width: collapsed ? 34 : 38,
          height: collapsed ? 34 : 38,
          borderRadius: collapsed ? 2.5 : 3,
          bgcolor: accentBg,
          color: accentColor,
        }}
      >
        {icon}
      </Avatar>
      {!collapsed ? (
        <Box>
          <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
        </Box>
      ) : null}
    </Stack>
  );

  return collapsed ? (
    <Tooltip title={label} placement="right">
      {content}
    </Tooltip>
  ) : (
    content
  );
}

export default function Navbar({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("lg"));
  const { resolvedTheme, toggleMode } = useColorMode();
  const { user } = useAuthContext();
  const {
    status: outlookStatus,
    loading: outlookLoading,
    busy: outlookBusy,
    error: outlookError,
    fetchStatus: refreshOutlookStatus,
    connect: connectOutlook,
    disconnect: disconnectOutlook,
  } = useOutlookCalendar();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showInputsHistory, setShowInputsHistory] = useState(false);
  const [showOutlookDialog, setShowOutlookDialog] = useState(false);

  const isCollapsed = collapsed && desktop;
  const railWidth = isCollapsed ? 88 : 304;
  const title =
    Object.entries(pageTitles).find(([route]) => pathname?.startsWith(route))?.[1] ||
    "Workspace";
  const userLabel = user?.username || user?.email || "Account";
  const initial = userLabel.charAt(0).toUpperCase();
  const visibleNavItems = navItems.filter(
    (item) =>
      (!("requiresReportApprover" in item) || !item.requiresReportApprover || user?.isReportApprover) &&
      (!("requiresReleaseManager" in item) || !item.requiresReleaseManager || user?.isReleaseManager)
  );

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebar = (
    <Stack
      sx={{
        height: "100%",
        minHeight: 0,
        overflowY: !desktop ? "auto" : "visible",
        px: isCollapsed ? 1 : 0,
        py: isCollapsed ? 1 : 0,
      }}
    >
      <Stack
        direction={isCollapsed ? "column" : "row"}
        spacing={isCollapsed ? 1.25 : 1.5}
        sx={{
          px: isCollapsed ? 0 : 2.5,
          pt: isCollapsed ? 0 : 2.5,
          pb: isCollapsed ? 1.5 : 2,
          alignItems: "center",
          justifyContent: isCollapsed ? "flex-start" : "space-between",
        }}
      >
        <Stack
          direction="row"
          spacing={isCollapsed ? 0 : 1.5}
          sx={{
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Box
            sx={{
              width: isCollapsed ? 48 : 56,
              height: isCollapsed ? 48 : 56,
              borderRadius: isCollapsed ? 2.5 : 4,
              display: "grid",
              placeItems: "center",
              bgcolor: "rgba(255,255,255,0.9)",
              border: "1px solid var(--app-border)",
              boxShadow: "var(--app-shadow-card)",
            }}
          >
            <Image
              src="/icon.png"
              alt="Asset Insight"
              width={52}
              height={52}
              className={isCollapsed ? "h-7 w-auto" : "h-10 w-auto"}
            />
          </Box>
          {!isCollapsed ? (
            <Box>
              <Typography sx={{ fontWeight: 800, color: "var(--app-text)" }}>
                Asset Insight
              </Typography>
              <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
                Enterprise workspace
              </Typography>
            </Box>
          ) : null}
        </Stack>
        {desktop ? (
          <Tooltip
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            placement={isCollapsed ? "right" : "bottom"}
          >
            <IconButton
              onClick={() => setCollapsed((value) => !value)}
              sx={{
                border: "1px solid var(--app-border)",
                bgcolor: "var(--app-panel)",
                width: isCollapsed ? 36 : 40,
                height: isCollapsed ? 36 : 40,
                boxShadow: isCollapsed ? "var(--app-shadow-card)" : "none",
              }}
            >
              {collapsed ? <ChevronRightRounded /> : <ChevronLeftRounded />}
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Close menu" placement="bottom">
            <IconButton
              onClick={() => setMobileOpen(false)}
              sx={{
                border: "1px solid var(--app-border)",
                bgcolor: "var(--app-panel)",
                width: 40,
                height: 40,
                boxShadow: "var(--app-shadow-card)",
              }}
            >
              <CloseRounded />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          px: isCollapsed ? 0 : 2,
          pb: 1.25,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            px: isCollapsed ? 0 : 1.5,
            color: "var(--app-text-muted)",
            letterSpacing: "0.18em",
            display: isCollapsed ? "none" : "block",
          }}
        >
          Navigation
        </Typography>
        <Stack spacing={isCollapsed ? 0.75 : 1} sx={{ mt: isCollapsed ? 0 : 1 }}>
          {visibleNavItems.map((item) => (
            <NavLinkItem
              key={item.href}
              collapsed={isCollapsed}
              active={pathname === item.href || pathname?.startsWith(item.href + "/")}
              href={item.href}
              label={item.label}
              icon={item.icon}
              onClick={!desktop ? () => setMobileOpen(false) : undefined}
            />
          ))}
          <NavActionItem
            collapsed={isCollapsed}
            active={showInputsHistory}
            label="Drafts"
            icon={ScheduleRounded}
            onClick={() => {
              setShowInputsHistory(true);
              if (!desktop) setMobileOpen(false);
            }}
          />
        </Stack>

        <Box sx={{ mt: isCollapsed ? 1.25 : 2 }}>
          <Stack
            spacing={isCollapsed ? 0.75 : 1}
            sx={{
              p: isCollapsed ? 0 : 1.25,
              borderRadius: isCollapsed ? 0 : 5,
              border: isCollapsed ? "none" : "1px solid var(--app-border)",
              bgcolor: isCollapsed ? "transparent" : "rgba(148, 163, 184, 0.06)",
            }}
          >
            <RailAction
              collapsed={isCollapsed}
              label={outlookStatus.connected ? "Outlook connected" : "Connect Outlook"}
              icon={<CalendarMonthRounded fontSize="small" />}
              accentBg={
                outlookStatus.connected
                  ? "rgba(5,150,105,0.12)"
                  : "rgba(37, 99, 235, 0.12)"
              }
              accentColor={outlookStatus.connected ? "#059669" : "#2563eb"}
              onClick={() => {
                setShowOutlookDialog(true);
                if (!desktop) setMobileOpen(false);
              }}
            />
            <RailAction
              collapsed={isCollapsed}
              label={resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              icon={
                resolvedTheme === "dark" ? (
                  <LightModeRounded fontSize="small" />
                ) : (
                  <DarkModeRounded fontSize="small" />
                )
              }
              accentBg={
                resolvedTheme === "dark"
                  ? "rgba(251,191,36,0.12)"
                  : "rgba(15, 23, 42, 0.08)"
              }
              accentColor={resolvedTheme === "dark" ? "#fbbf24" : "#0f172a"}
              onClick={toggleMode}
            />
          </Stack>
        </Box>

        <Box sx={{ mt: isCollapsed ? 1.25 : 2 }}>
          <Typography
            variant="overline"
            sx={{
              px: isCollapsed ? 0 : 1.5,
              color: "var(--app-text-muted)",
              letterSpacing: "0.18em",
              display: isCollapsed ? "none" : "block",
            }}
          >
            Account
          </Typography>
          <Stack spacing={isCollapsed ? 0.75 : 1} sx={{ mt: isCollapsed ? 0 : 1 }}>
            {secondaryNavItems.map((item) => (
              <NavLinkItem
                key={item.href}
                collapsed={isCollapsed}
                active={pathname === item.href || pathname?.startsWith(item.href + "/")}
                href={item.href}
                label={item.label}
                icon={item.icon}
                onClick={!desktop ? () => setMobileOpen(false) : undefined}
              />
            ))}
          </Stack>
        </Box>
      </Box>

      <Box
        sx={{
          pt: isCollapsed ? 1 : 1.5,
          px: isCollapsed ? 0 : 2,
          borderTop: "1px solid var(--app-border)",
          flexShrink: 0,
        }}
      >
        <Tooltip
          title={isCollapsed ? `${userLabel}${user?.email ? ` · ${user.email}` : ""}` : ""}
          placement="right"
        >
          <Stack
            direction="row"
            spacing={isCollapsed ? 0 : 1.5}
            sx={{
              p: isCollapsed ? 0.5 : 1.25,
              minHeight: isCollapsed ? 56 : "auto",
              alignItems: "center",
              justifyContent: isCollapsed ? "center" : "flex-start",
              borderRadius: isCollapsed ? 3 : 5,
              border: isCollapsed ? "none" : "1px solid var(--app-border)",
              bgcolor: isCollapsed ? "transparent" : "var(--app-panel-soft)",
              boxShadow: isCollapsed ? "none" : "var(--app-shadow-card)",
            }}
          >
            <Box
              sx={{
                width: isCollapsed ? 48 : "auto",
                height: isCollapsed ? 48 : "auto",
                minWidth: isCollapsed ? 48 : 0,
                display: "grid",
                placeItems: "center",
                borderRadius: isCollapsed ? 3 : 0,
                border: isCollapsed ? "1px solid var(--app-border)" : "none",
                bgcolor: isCollapsed ? "rgba(148, 163, 184, 0.06)" : "transparent",
              }}
            >
              <Avatar
                sx={{
                  bgcolor: "var(--app-accent)",
                  width: isCollapsed ? 38 : 42,
                  height: isCollapsed ? 38 : 42,
                  fontSize: isCollapsed ? 18 : 20,
                }}
              >
                {initial}
              </Avatar>
            </Box>
            {!isCollapsed ? (
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontWeight: 800,
                    color: "var(--app-text)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {userLabel}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: "var(--app-text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user?.email}
                </Typography>
              </Box>
            ) : null}
          </Stack>
        </Tooltip>
      </Box>
    </Stack>
  );

  return (
    <>
      <Box sx={{ minHeight: "100dvh", display: "flex", alignItems: "stretch" }}>
        <Box
          sx={{
            display: { xs: "none", lg: "block" },
            width: railWidth,
            flexShrink: 0,
            alignSelf: "stretch",
            p: { lg: isCollapsed ? 0.75 : 1.25, xl: isCollapsed ? 0.75 : 1.75 },
            transition: "width 180ms ease",
          }}
        >
          <Box
            sx={{
              position: "sticky",
              top: 12,
              height: "calc(100dvh - 24px)",
              maxHeight: "calc(100dvh - 24px)",
              borderRadius: isCollapsed ? 4 : 7,
              border: "1px solid var(--app-border)",
              background: "var(--app-overlay)",
              backdropFilter: "blur(20px)",
              boxShadow: "var(--app-shadow-shell)",
              overflow: "hidden",
            }}
          >
            {sidebar}
          </Box>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0, pb: { xs: 3, md: 4 } }}>
          <Stack
            direction="row"
            sx={{
              display: { xs: "flex", lg: "none" },
              position: "sticky",
              top: 0,
              zIndex: 30,
              px: 2,
              py: 1.5,
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--app-border)",
              bgcolor: "var(--app-panel-soft)",
              backdropFilter: "blur(18px)",
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <IconButton
                onClick={() => setMobileOpen(true)}
                sx={{
                  border: "1px solid var(--app-border)",
                  bgcolor: "var(--app-panel)",
                }}
              >
                <MenuRounded />
              </IconButton>
              <Box>
                <Typography variant="body2" sx={{ color: "var(--app-text-muted)" }}>
                  Asset Insight
                </Typography>
                <Typography sx={{ fontWeight: 800, color: "var(--app-text)" }}>
                  {title}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1}>
              <IconButton
                onClick={() => setShowOutlookDialog(true)}
                sx={{
                  border: "1px solid var(--app-border)",
                  bgcolor: "var(--app-panel)",
                  color: outlookStatus.connected ? "#059669" : "var(--app-text)",
                }}
              >
                <CalendarMonthRounded />
              </IconButton>
              <IconButton
                onClick={toggleMode}
                sx={{
                  border: "1px solid var(--app-border)",
                  bgcolor: "var(--app-panel)",
                }}
              >
                {resolvedTheme === "dark" ? (
                  <LightModeRounded />
                ) : (
                  <DarkModeRounded />
                )}
              </IconButton>
            </Stack>
          </Stack>

          <Box sx={{ px: { xs: 2, md: 3, xl: 4 }, pt: { xs: 2, md: 3 } }}>
            {children}
          </Box>
        </Box>
      </Box>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{
          paper: {
            sx: {
              width: "min(86vw, 320px)",
              height: "100dvh",
              display: "flex",
              flexDirection: "column",
              bgcolor: "var(--app-panel)",
              backgroundImage:
                "radial-gradient(circle at top left, rgba(225,29,72,0.08), transparent 26%), radial-gradient(circle at bottom right, rgba(37,99,235,0.08), transparent 24%)",
            },
          },
        }}
      >
        {sidebar}
      </Drawer>

      <InputsHistoryModal
        isOpen={showInputsHistory}
        onClose={() => setShowInputsHistory(false)}
        onLoadInput={() => { }}
      />
      <OutlookConnectionDialog
        open={showOutlookDialog}
        onClose={() => setShowOutlookDialog(false)}
        status={outlookStatus}
        loading={outlookLoading}
        busy={outlookBusy}
        error={outlookError}
        onRefresh={() => void refreshOutlookStatus()}
        onConnect={() => void connectOutlook()}
        onDisconnect={() => void disconnectOutlook()}
      />
    </>
  );
}
