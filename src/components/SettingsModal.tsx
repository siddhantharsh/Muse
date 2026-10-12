// ============================================================
// Muse — Settings Modal
// Large centralized popup for all configuration
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Clock,
  Zap,
  Palette,
  Bell,
  Calendar,
  Layout,
  ChevronRight,
  Plus,
  Trash2,
  X,
  Monitor,
  Sun,
  Moon,
  Upload,
  Download,
  CalendarPlus,
  Shield,
  ArrowLeft,
  GraduationCap,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import {
  DistributionModel,
  ViewMode,
  SchedulingHoursProfile,
  DaySchedule,
  TimeBlock,
} from '../types';
import { NumberField } from './NumberField';
import { AuthForm, type AuthMode } from './AuthForm';
import { getDeviceId } from '../hooks/useCloudSync';

function isElectron(): boolean {
  return !!(window as any).electronAPI;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SECTION_IDS = ['general', 'scheduling', 'scheduling-hours', 'cloud-account', 'calendar-sync', 'appearance', 'notifications'] as const;
type SectionId = typeof SECTION_IDS[number];

export function SettingsModal() {
  const { settings, updateSettings, addSchedulingProfile, updateSchedulingProfile, deleteSchedulingProfile, setActiveView, importICS, exportICS } = useMuseStore();
  const [activeSection, setActiveSection] = useState<SectionId>('general');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const sections = [
    { id: 'general' as SectionId, label: 'General', icon: <SettingsIcon size={16} /> },
    { id: 'scheduling' as SectionId, label: 'Scheduling Engine', icon: <Zap size={16} /> },
    { id: 'scheduling-hours' as SectionId, label: 'Scheduling Hours', icon: <Clock size={16} /> },
    { id: 'cloud-account' as SectionId, label: 'Account', icon: <Shield size={16} /> },
    { id: 'calendar-sync' as SectionId, label: 'Calendar Sync', icon: <CalendarPlus size={16} /> },
    { id: 'appearance' as SectionId, label: 'Appearance', icon: <Palette size={16} /> },
    { id: 'notifications' as SectionId, label: 'Notifications', icon: <Bell size={16} /> },
  ];

  return (
    <div className="h-full flex flex-col bg-nord0">
      {/* Mobile header with back button */}
      {isMobile && (
        <div className="flex items-center gap-2 px-3 py-2 bg-nord1 border-b border-nord3 flex-shrink-0">
          <button
            onClick={() => setActiveView('calendar')}
            className="p-1.5 hover:bg-nord2 transition-colors text-nord4"
          >
            <ArrowLeft size={16} />
          </button>
          <SettingsIcon size={14} className="text-nord4" />
          <span className="text-xs font-semibold text-nord6 flex-1">Settings</span>
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value as SectionId)}
            className="input-base text-xs py-1 px-2 w-auto"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
      {/* Settings Sidebar — hidden on mobile */}
      {!isMobile && (
      <div className="w-56 bg-nord1 border-r border-nord3 overflow-y-auto scrollable">
        <div className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <SettingsIcon size={18} className="text-nord4" />
            <h2 className="text-sm font-semibold text-nord6">Settings</h2>
          </div>
          <nav className="space-y-0.5">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2 px-3 py-2  text-sm transition-all ${
                  activeSection === section.id
                    ? 'bg-nord8/15 text-nord8'
                    : 'text-nord4 hover:bg-nord2 hover:text-nord6'
                }`}
              >
                {section.icon}
                {section.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      )}

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto scrollable p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {activeSection === 'general' && (
            <GeneralSettings settings={settings} updateSettings={updateSettings} />
          )}
          {activeSection === 'scheduling' && (
            <SchedulingSettings settings={settings} updateSettings={updateSettings} />
          )}
          {activeSection === 'scheduling-hours' && (
            <SchedulingHoursSettings
              settings={settings}
              addProfile={addSchedulingProfile}
              updateProfile={updateSchedulingProfile}
              deleteProfile={deleteSchedulingProfile}
              editingProfileId={editingProfileId}
              setEditingProfileId={setEditingProfileId}
            />
          )}
          {activeSection === 'calendar-sync' && (
            <CalendarSyncSettings importICS={importICS} exportICS={exportICS} />
          )}
          {activeSection === 'cloud-account' && (
            <CloudAccountSettings />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSettings settings={settings} updateSettings={updateSettings} />
          )}
          {activeSection === 'notifications' && (
            <NotificationSettings settings={settings} updateSettings={updateSettings} />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ---- General Settings ----
function GeneralSettings({ settings, updateSettings }: any) {
  return (
    <div className="space-y-6">
      <SectionHeader title="General" subtitle="Basic application preferences" />

      <SettingRow label="Week starts on" description="First day of the week in calendar views">
        <select
          value={settings.weekStartsOn}
          onChange={(e) => updateSettings({ weekStartsOn: parseInt(e.target.value) })}
          className="input-base w-40"
        >
          <option value={0}>Sunday</option>
          <option value={1}>Monday</option>
        </select>
      </SettingRow>

      <SettingRow label="Time format" description="12-hour or 24-hour clock display">
        <div className="flex gap-2">
          <button
            onClick={() => updateSettings({ timeFormat: '24h' })}
            className={`px-3 py-1.5  text-sm ${
              settings.timeFormat === '24h'
                ? 'bg-nord8 text-nord0'
                : 'bg-nord0 border border-nord3 text-nord4 hover:bg-nord2'
            }`}
          >
            24h
          </button>
          <button
            onClick={() => updateSettings({ timeFormat: '12h' })}
            className={`px-3 py-1.5  text-sm ${
              settings.timeFormat === '12h'
                ? 'bg-nord8 text-nord0'
                : 'bg-nord0 border border-nord3 text-nord4 hover:bg-nord2'
            }`}
          >
            12h
          </button>
        </div>
      </SettingRow>

      <SettingRow label="Default view" description="Calendar view on startup">
        <select
          value={settings.defaultView}
          onChange={(e) => updateSettings({ defaultView: e.target.value })}
          className="input-base w-40"
        >
          <option value={ViewMode.Day}>Day</option>
          <option value={ViewMode.ThreeDay}>3 Day</option>
          <option value={ViewMode.Week}>Week</option>
        </select>
      </SettingRow>

      <SettingRow
        label="Day start hour"
        description="Where the calendar starts, and the earliest “any time” tasks are scheduled"
      >
        <NumberField
          value={settings.dayStartHour}
          min={0}
          max={Math.max(0, settings.dayEndHour - 1)}
          onCommit={(dayStartHour) => updateSettings({ dayStartHour })}
          aria-label="Day start hour"
          className="input-base w-20 text-center"
        />
      </SettingRow>

      <SettingRow
        label="Day end hour"
        description="Where the calendar ends, and the latest “any time” tasks are scheduled"
      >
        <NumberField
          value={settings.dayEndHour}
          min={settings.dayStartHour + 1}
          max={24}
          onCommit={(dayEndHour) => updateSettings({ dayEndHour })}
          aria-label="Day end hour"
          className="input-base w-20 text-center"
        />
      </SettingRow>

      <SettingRow label="Guided tour" description="Walk through how Muse plans your time">
        <button
          onClick={() => useMuseStore.getState().openTutorial()}
          className="btn-secondary text-xs flex items-center gap-1.5"
        >
          <GraduationCap size={12} />
          Replay tutorial
        </button>
      </SettingRow>
    </div>
  );
}

// ---- Scheduling Engine Settings ----
function SchedulingSettings({ settings, updateSettings }: any) {
  return (
    <div className="space-y-6">
      <SectionHeader
        title="Scheduling Engine"
        subtitle="Control how the autonomous algorithm distributes your workload"
      />

      <SettingRow
        label="Distribution Model"
        description="How the engine spreads work across available days"
      >
        <div className="space-y-2">
          <button
            onClick={() => updateSettings({ distributionModel: DistributionModel.Balanced })}
            className={`w-full flex items-start gap-3 p-3  border transition-all ${
              settings.distributionModel === DistributionModel.Balanced
                ? 'border-nord8 bg-nord8/10'
                : 'border-nord3 hover:border-nord9'
            }`}
          >
            <div className="mt-0.5">
              <div className={`w-4 h-4  border-2 flex items-center justify-center ${
                settings.distributionModel === DistributionModel.Balanced
                  ? 'border-nord8'
                  : 'border-nord3'
              }`}>
                {settings.distributionModel === DistributionModel.Balanced && (
                  <div className="w-2 h-2  bg-nord8" />
                )}
              </div>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-nord6">Balanced</div>
              <div className="text-xs text-nord3 mt-0.5">
                Distributes workload evenly across all available days. Prevents burnout by smoothing daily requirements.
              </div>
            </div>
          </button>

          <button
            onClick={() => updateSettings({ distributionModel: DistributionModel.FrontLoad })}
            className={`w-full flex items-start gap-3 p-3  border transition-all ${
              settings.distributionModel === DistributionModel.FrontLoad
                ? 'border-nord8 bg-nord8/10'
                : 'border-nord3 hover:border-nord9'
            }`}
          >
            <div className="mt-0.5">
              <div className={`w-4 h-4  border-2 flex items-center justify-center ${
                settings.distributionModel === DistributionModel.FrontLoad
                  ? 'border-nord8'
                  : 'border-nord3'
              }`}>
                {settings.distributionModel === DistributionModel.FrontLoad && (
                  <div className="w-2 h-2  bg-nord8" />
                )}
              </div>
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-nord6">Front-Load</div>
              <div className="text-xs text-nord3 mt-0.5">
                Greedy algorithm. Places tasks in earliest available slots, compressing all work to the present.
              </div>
            </div>
          </button>
        </div>
      </SettingRow>

      <SettingRow
        label="Auto-Scheduling Cutoff"
        description="How far into the future the engine plans (in weeks)"
      >
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={12}
            value={settings.autoSchedulingCutoffWeeks}
            onChange={(e) =>
              updateSettings({ autoSchedulingCutoffWeeks: parseInt(e.target.value) })
            }
            className="flex-1 accent-nord8"
          />
          <span className="text-sm text-nord6 font-medium w-16 text-right">
            {settings.autoSchedulingCutoffWeeks} weeks
          </span>
        </div>
      </SettingRow>

      <SettingRow label="Smart Color Coding" description="Show green/orange/red urgency colors on tasks">
        <button
          onClick={() => updateSettings({ smartColorCoding: !settings.smartColorCoding })}
          className={`toggle ${settings.smartColorCoding ? 'active' : ''}`}
        />
      </SettingRow>

      <SettingRow label="Default task duration" description="Minutes for new tasks">
        <div className="flex items-center gap-2">
          <NumberField
            value={settings.defaultTaskDuration}
            min={5}
            max={1440}
            step={5}
            onCommit={(defaultTaskDuration) => updateSettings({ defaultTaskDuration })}
            aria-label="Default task duration in minutes"
            className="input-base w-24 text-center"
          />
          <span className="text-xs text-nord3">minutes</span>
        </div>
      </SettingRow>

      <SettingRow label="Default auto-schedule" description="New tasks are auto-scheduled by default">
        <button
          onClick={() => updateSettings({ defaultAutoSchedule: !settings.defaultAutoSchedule })}
          className={`toggle ${settings.defaultAutoSchedule ? 'active' : ''}`}
        />
      </SettingRow>

      <SettingRow label="Default splittable" description="New tasks can be split by default">
        <button
          onClick={() => updateSettings({ defaultSplittable: !settings.defaultSplittable })}
          className={`toggle ${settings.defaultSplittable ? 'active' : ''}`}
        />
      </SettingRow>

      <SettingRow label="Default min block" description="Minimum block duration for split tasks">
        <div className="flex items-center gap-2">
          <NumberField
            value={settings.defaultMinBlockDuration}
            min={5}
            max={480}
            step={5}
            onCommit={(defaultMinBlockDuration) => updateSettings({ defaultMinBlockDuration })}
            aria-label="Default minimum block in minutes"
            className="input-base w-24 text-center"
          />
          <span className="text-xs text-nord3">minutes</span>
        </div>
      </SettingRow>
    </div>
  );
}

// ---- Scheduling Hours Settings ----
function SchedulingHoursSettings({
  settings,
  addProfile,
  updateProfile,
  deleteProfile,
  editingProfileId,
  setEditingProfileId,
}: any) {
  const profiles: SchedulingHoursProfile[] = settings.schedulingHoursProfiles;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Scheduling Hours"
        subtitle="Define temporal masks that control when tasks can be scheduled"
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-nord4">
          {profiles.length} profile{profiles.length !== 1 ? 's' : ''}
        </span>
        <button
          onClick={() => {
            const profile = addProfile({});
            setEditingProfileId(profile.id);
          }}
          className="btn-primary text-xs flex items-center gap-1"
        >
          <Plus size={12} />
          Add Profile
        </button>
      </div>

      <div className="space-y-3">
        {profiles.map((profile: SchedulingHoursProfile) => (
          <div
            key={profile.id}
            className={` border transition-all ${
              editingProfileId === profile.id
                ? 'border-nord8 bg-nord8/5'
                : 'border-nord3 bg-nord1'
            }`}
          >
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer"
              onClick={() =>
                setEditingProfileId(
                  editingProfileId === profile.id ? null : profile.id
                )
              }
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 "
                  style={{ backgroundColor: profile.color }}
                />
                <span className="text-sm font-medium text-nord6">
                  {profile.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {profile.id !== 'default-profile' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProfile(profile.id);
                    }}
                    className="p-1 hover:bg-nord11/20 text-nord3 hover:text-nord11 transition-all"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                <ChevronRight
                  size={14}
                  className={`text-nord3 transition-transform ${
                    editingProfileId === profile.id ? 'rotate-90' : ''
                  }`}
                />
              </div>
            </div>

            {editingProfileId === profile.id && (
              <div className="px-4 pb-4 space-y-3 border-t border-nord3/50 pt-3">
                {/* Profile Name */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) =>
                      updateProfile(profile.id, { name: e.target.value })
                    }
                    className="input-base flex-1"
                    placeholder="Profile name"
                  />
                  <input
                    type="color"
                    value={profile.color}
                    onChange={(e) =>
                      updateProfile(profile.id, { color: e.target.value })
                    }
                    className="w-8 h-8 cursor-pointer bg-transparent border-0"
                  />
                </div>

                {/* Weekly Schedule Grid */}
                <div className="space-y-2">
                  {DAYS.map((day, dayIndex) => {
                    const daySchedule: DaySchedule =
                      profile.weeklySchedule[dayIndex] || {
                        enabled: false,
                        blocks: [],
                      };

                    return (
                      <div key={dayIndex} className="flex items-center gap-3">
                        <div className="w-10">
                          <span className="text-xs text-nord3 font-medium">
                            {day}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const newSchedule = { ...profile.weeklySchedule };
                            newSchedule[dayIndex] = {
                              ...daySchedule,
                              enabled: !daySchedule.enabled,
                              blocks: daySchedule.blocks.length
                                ? daySchedule.blocks
                                : [{ start: '09:00', end: '17:00' }],
                            };
                            updateProfile(profile.id, {
                              weeklySchedule: newSchedule,
                            });
                          }}
                          className={`toggle ${daySchedule.enabled ? 'active' : ''}`}
                        />
                        {daySchedule.enabled && daySchedule.blocks.length > 0 && (
                          <div className="flex items-center gap-2 flex-1">
                            {daySchedule.blocks.map((block: TimeBlock, blockIdx: number) => (
                              <div key={blockIdx} className="flex items-center gap-1">
                                <input
                                  type="time"
                                  value={block.start}
                                  onChange={(e) => {
                                    const newSchedule = {
                                      ...profile.weeklySchedule,
                                    };
                                    const newBlocks = [...daySchedule.blocks];
                                    newBlocks[blockIdx] = {
                                      ...block,
                                      start: e.target.value,
                                    };
                                    newSchedule[dayIndex] = {
                                      ...daySchedule,
                                      blocks: newBlocks,
                                    };
                                    updateProfile(profile.id, {
                                      weeklySchedule: newSchedule,
                                    });
                                  }}
                                  className="px-1 py-0.5 bg-nord0 border border-nord3 text-[11px] text-nord6 focus:outline-none"
                                />
                                <span className="text-xs text-nord3">–</span>
                                <input
                                  type="time"
                                  value={block.end}
                                  onChange={(e) => {
                                    const newSchedule = {
                                      ...profile.weeklySchedule,
                                    };
                                    const newBlocks = [...daySchedule.blocks];
                                    newBlocks[blockIdx] = {
                                      ...block,
                                      end: e.target.value,
                                    };
                                    newSchedule[dayIndex] = {
                                      ...daySchedule,
                                      blocks: newBlocks,
                                    };
                                    updateProfile(profile.id, {
                                      weeklySchedule: newSchedule,
                                    });
                                  }}
                                  className="px-1 py-0.5 bg-nord0 border border-nord3 text-[11px] text-nord6 focus:outline-none"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Date Overrides Section */}
                <DateOverridesEditor
                  profile={profile}
                  updateProfile={updateProfile}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Account Settings ----
function CloudAccountSettings() {
  const account = useMuseStore((s) => s.ui.account);
  const cloudStatus = useMuseStore((s) => s.ui.cloudStatus);
  const cloudError = useMuseStore((s) => s.ui.cloudError);
  const setAccount = useMuseStore((s) => s.setAccount);
  const setOnboardingChoice = useMuseStore((s) => s.setOnboardingChoice);
  const resetLocalData = useMuseStore((s) => s.resetLocalData);
  const [mode, setMode] = useState<AuthMode>('signin');
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (!account) return;
    setSigningOut(true);
    try {
      const sync = await import('../utils/cloudSync');
      // Upload the latest state first so nothing done in the last moments is lost.
      await sync
        .cloudPush(account.uid, useMuseStore.getState().getSyncPayload(), getDeviceId())
        .catch(() => {});
      await sync.cloudSignOut();
    } finally {
      // This device's copy is cleared; the account keeps everything.
      resetLocalData();
      setSigningOut(false);
      setConfirmingSignOut(false);
    }
  };

  const statusText =
    cloudStatus === 'ready'
      ? 'Up to date'
      : cloudStatus === 'syncing'
      ? 'Syncing…'
      : cloudStatus === 'error'
      ? 'Not syncing right now'
      : 'Connecting…';
  const statusColor =
    cloudStatus === 'ready' ? 'bg-nord14' : cloudStatus === 'error' ? 'bg-nord11' : 'bg-nord13';

  return (
    <div className="space-y-6">
      <SectionHeader title="Account" subtitle="Back up your schedule and keep it in sync across devices" />

      {account ? (
        <>
          <SettingRow label="Signed in as" description="Your Muse account">
            <span className="text-sm text-nord8 break-all">{account.email}</span>
          </SettingRow>
          <SettingRow label="Sync" description="Changes upload automatically and arrive live on your other devices">
            <span className="flex items-center gap-2 text-sm text-nord6">
              <span className={`w-2 h-2 inline-block ${statusColor}`} />
              {statusText}
            </span>
          </SettingRow>
          {cloudStatus === 'error' && cloudError && (
            <p className="text-xs text-nord12">
              {cloudError} Your work is safe on this device and will sync once the connection recovers.
            </p>
          )}
          <div className="pt-2">
            {confirmingSignOut ? (
              <div className="p-4 border border-nord3 bg-nord1 space-y-3">
                <p className="text-xs text-nord4 leading-relaxed">
                  Signing out removes your schedule from this device. Everything stays in your
                  account — sign back in any time to get it back.
                </p>
                <div className="flex gap-2">
                  <button onClick={handleSignOut} disabled={signingOut} className="btn-danger">
                    {signingOut ? 'Signing out…' : 'Sign out'}
                  </button>
                  <button onClick={() => setConfirmingSignOut(false)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmingSignOut(true)} className="btn-danger">
                Sign out
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="p-4 border border-nord3 bg-nord1 space-y-4 max-w-sm">
          <p className="text-xs text-nord4 leading-relaxed">
            You’re using Muse without an account, so your schedule lives only on this device.
            Log in or create an account to back it up — everything here comes with you.
          </p>
          <AuthForm
            mode={mode}
            onModeChange={setMode}
            onSuccess={(signedIn) => {
              setOnboardingChoice('account');
              setAccount(signedIn);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ---- Appearance Settings ----
function AppearanceSettings({ settings, updateSettings }: any) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Appearance" subtitle="Customize the look and feel" />

      <SettingRow label="Theme" description="Application color scheme">
        <div className="flex gap-2">
          <button
            onClick={() => updateSettings({ theme: 'dark' })}
            className={`flex items-center gap-2 px-3 py-2  border transition-all ${
              settings.theme === 'dark'
                ? 'border-nord8 bg-nord8/10'
                : 'border-nord3 hover:border-nord9'
            }`}
          >
            <Moon size={14} />
            <span className="text-sm">Dark</span>
          </button>
          <button
            onClick={() => updateSettings({ theme: 'light' })}
            className={`flex items-center gap-2 px-3 py-2  border transition-all ${
              settings.theme === 'light'
                ? 'border-nord8 bg-nord8/10'
                : 'border-nord3 hover:border-nord9'
            }`}
          >
            <Sun size={14} />
            <span className="text-sm">Light</span>
          </button>
        </div>
      </SettingRow>

      <SettingRow label="Show week numbers" description="Display ISO week numbers in calendar">
        <button
          onClick={() => updateSettings({ showWeekNumbers: !settings.showWeekNumbers })}
          className={`toggle ${settings.showWeekNumbers ? 'active' : ''}`}
        />
      </SettingRow>
    </div>
  );
}

// ---- Notification Settings ----
function NotificationSettings({ settings, updateSettings }: any) {
  return (
    <div className="space-y-6">
      <SectionHeader title="Notifications" subtitle="Alert preferences for events and tasks" />

      <SettingRow label="Enable notifications" description="Show desktop notifications for upcoming items">
        <button
          onClick={() => {
            const enabling = !settings.notificationsEnabled;
            // Ask for permission from the click itself — browsers ignore
            // permission prompts that aren't tied to a user gesture.
            if (enabling && 'Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission();
            }
            updateSettings({ notificationsEnabled: enabling });
          }}
          aria-label="Enable notifications"
          aria-pressed={settings.notificationsEnabled}
          className={`toggle ${settings.notificationsEnabled ? 'active' : ''}`}
        />
      </SettingRow>

      {settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'denied' && (
        <p className="text-xs text-nord12">
          Notifications are blocked for this site in your browser settings, so reminders can’t appear.
        </p>
      )}

      {settings.notificationsEnabled && (
        <SettingRow label="Notify before" description="Minutes before event/task start time">
          <div className="flex items-center gap-2">
            <NumberField
              value={settings.notifyMinutesBefore}
              min={0}
              max={120}
              step={5}
              onCommit={(notifyMinutesBefore) => updateSettings({ notifyMinutesBefore })}
              aria-label="Minutes before to notify"
              className="input-base w-24 text-center"
            />
            <span className="text-xs text-nord3">minutes</span>
          </div>
        </SettingRow>
      )}
    </div>
  );
}

// ---- Date Overrides Editor ----
function DateOverridesEditor({ profile, updateProfile }: { profile: SchedulingHoursProfile; updateProfile: (id: string, updates: Partial<SchedulingHoursProfile>) => void }) {
  const [newDate, setNewDate] = useState('');
  const overrides = profile.dateOverrides || {};
  const sortedDates = Object.keys(overrides).sort();

  const addOverride = () => {
    if (!newDate) return;
    const newOverrides = { ...overrides };
    newOverrides[newDate] = { enabled: true, blocks: [{ start: '09:00', end: '17:00' }] };
    updateProfile(profile.id, { dateOverrides: newOverrides });
    setNewDate('');
  };

  const removeOverride = (dateKey: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[dateKey];
    updateProfile(profile.id, { dateOverrides: newOverrides });
  };

  const updateOverride = (dateKey: string, schedule: DaySchedule) => {
    const newOverrides = { ...overrides };
    newOverrides[dateKey] = schedule;
    updateProfile(profile.id, { dateOverrides: newOverrides });
  };

  return (
    <div className="space-y-2 pt-3 border-t border-nord3/30">
      <div className="flex items-center justify-between">
        <span className="text-xs text-nord4 font-medium">Date Overrides</span>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="px-1 py-0.5 bg-nord0 border border-nord3 text-[11px] text-nord6 focus:outline-none"
          />
          <button
            onClick={addOverride}
            disabled={!newDate}
            className="btn-primary text-[10px] px-2 py-0.5 disabled:opacity-30"
          >
            <Plus size={10} />
          </button>
        </div>
      </div>

      {sortedDates.length === 0 && (
        <p className="text-[10px] text-nord3">No date overrides. Add specific dates to override weekly schedule.</p>
      )}

      {sortedDates.map((dateKey) => {
        const schedule = overrides[dateKey];
        return (
          <div key={dateKey} className="flex items-center gap-2 bg-nord0/50 px-2 py-1.5">
            <span className="text-[11px] text-nord8 font-medium min-w-[80px]">{dateKey}</span>
            <button
              onClick={() => updateOverride(dateKey, { ...schedule, enabled: !schedule.enabled })}
              className={`toggle ${schedule.enabled ? 'active' : ''}`}
              style={{ transform: 'scale(0.8)' }}
            />
            {schedule.enabled && schedule.blocks.length > 0 && (
              <div className="flex items-center gap-1 flex-1">
                {schedule.blocks.map((block: TimeBlock, bIdx: number) => (
                  <div key={bIdx} className="flex items-center gap-1">
                    <input
                      type="time"
                      value={block.start}
                      onChange={(e) => {
                        const newBlocks = [...schedule.blocks];
                        newBlocks[bIdx] = { ...block, start: e.target.value };
                        updateOverride(dateKey, { ...schedule, blocks: newBlocks });
                      }}
                      className="px-1 py-0.5 bg-nord0 border border-nord3 text-[10px] text-nord6 focus:outline-none"
                    />
                    <span className="text-[10px] text-nord3">–</span>
                    <input
                      type="time"
                      value={block.end}
                      onChange={(e) => {
                        const newBlocks = [...schedule.blocks];
                        newBlocks[bIdx] = { ...block, end: e.target.value };
                        updateOverride(dateKey, { ...schedule, blocks: newBlocks });
                      }}
                      className="px-1 py-0.5 bg-nord0 border border-nord3 text-[10px] text-nord6 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
            {!schedule.enabled && (
              <span className="text-[10px] text-nord11">Day off</span>
            )}
            <button
              onClick={() => removeOverride(dateKey)}
              className="p-0.5 hover:bg-nord11/20 text-nord3 hover:text-nord11 transition-all"
            >
              <Trash2 size={10} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---- Calendar Sync Settings ----
function CalendarSyncSettings({ importICS, exportICS }: { importICS: (content: string) => Promise<number>; exportICS: () => string }) {
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,.ical';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const count = await importICS(text);
      setImportStatus(
        count > 0
          ? `Imported ${count} event${count !== 1 ? 's' : ''} (re-imports update existing ones)`
          : 'No events found in that file'
      );
      setTimeout(() => setImportStatus(null), 4000);
    };
    input.click();
  };

  const handleExport = () => {
    const icsContent = exportICS();
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muse-calendar-${new Date().toISOString().slice(0, 10)}.ics`;
    a.click();
    // Revoking synchronously can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Calendar Sync"
        subtitle="Import and export events using standard iCalendar (.ics) format"
      />

      <SettingRow label="Import ICS" description="Import events from an .ics file (Google Calendar, Outlook, etc.)">
        <div className="flex items-center gap-2">
          <button onClick={handleImport} className="btn-primary text-xs flex items-center gap-1.5">
            <Upload size={12} />
            Import .ics
          </button>
          {importStatus && (
            <span className="text-xs text-nord14">{importStatus}</span>
          )}
        </div>
      </SettingRow>

      <SettingRow label="Export ICS" description="Export all events to a downloadable .ics file">
        <button onClick={handleExport} className="btn-secondary text-xs flex items-center gap-1.5">
          <Download size={12} />
          Export .ics
        </button>
      </SettingRow>
    </div>
  );
}

// ---- Shared Components ----

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="pb-4 border-b border-nord3">
      <h2 className="text-lg font-semibold text-nord6">{title}</h2>
      <p className="text-sm text-nord3 mt-1">{subtitle}</p>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-8 py-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-nord6">{label}</div>
        <div className="text-xs text-nord3 mt-0.5">{description}</div>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}
