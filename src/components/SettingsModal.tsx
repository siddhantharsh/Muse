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
  Smartphone,
  Copy,
  Check,
  Shield,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { useMuseStore } from '../store/useMuseStore';
import {
  DistributionModel,
  ViewMode,
  SchedulingHoursProfile,
  DaySchedule,
  TimeBlock,
} from '../types';
import { isElectron, desktopGetSyncInfo, desktopGetPin, desktopResetPin } from '../utils/syncClient';
import { isCloudConfigured, getCloudUser, cloudSignOut, cloudSignIn, cloudSignUp } from '../utils/cloudSync';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SECTION_IDS = ['general', 'scheduling', 'scheduling-hours', 'device-sync', 'cloud-account', 'calendar-sync', 'appearance', 'notifications'] as const;
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
    { id: 'device-sync' as SectionId, label: 'Device Sync', icon: <Smartphone size={16} /> },
    ...(isCloudConfigured()
      ? [{ id: 'cloud-account' as SectionId, label: 'Cloud Account', icon: <Shield size={16} /> }]
      : []),
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
          {activeSection === 'device-sync' && (
            <DeviceSyncSettings />
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

      <SettingRow label="Day start hour" description="Calendar view start time">
        <input
          type="number"
          min={0}
          max={12}
          value={settings.dayStartHour}
          onChange={(e) => updateSettings({ dayStartHour: parseInt(e.target.value) })}
          className="input-base w-20 text-center"
        />
      </SettingRow>

      <SettingRow label="Day end hour" description="Calendar view end time">
        <input
          type="number"
          min={12}
          max={24}
          value={settings.dayEndHour}
          onChange={(e) => updateSettings({ dayEndHour: parseInt(e.target.value) })}
          className="input-base w-20 text-center"
        />
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
                : 'border-nord3 hover:border-nord3Light'
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
                : 'border-nord3 hover:border-nord3Light'
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
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={settings.defaultTaskDuration}
            onChange={(e) =>
              updateSettings({ defaultTaskDuration: parseInt(e.target.value) })
            }
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
          <input
            type="number"
            min={5}
            max={120}
            step={5}
            value={settings.defaultMinBlockDuration}
            onChange={(e) =>
              updateSettings({ defaultMinBlockDuration: parseInt(e.target.value) })
            }
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

// ---- Cloud Account Settings ----
function CloudAccountSettings() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Inline auth form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  useEffect(() => {
    getCloudUser()
      .then((user) => {
        setUserEmail(user?.email || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSignOut = async () => {
    await cloudSignOut();
    setUserEmail(null);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!email || !password) {
      setAuthError('Email and password are required');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }
    if (authMode === 'signup' && password !== confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }

    setAuthLoading(true);
    try {
      if (authMode === 'signup') {
        await cloudSignUp(email, password);
        setSignupSuccess(true);
      } else {
        await cloudSignIn(email, password);
        const user = await getCloudUser();
        setUserEmail(user?.email || email);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader title="Cloud Account" subtitle="Manage your cloud sync account" />
        <p className="text-xs text-nord4">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Cloud Account" subtitle="Sync your tasks across devices via the cloud" />

      {userEmail ? (
        <>
          <SettingRow label="Signed in as" description="Your cloud sync account">
            <span className="text-sm text-nord8">{userEmail}</span>
          </SettingRow>
          <SettingRow label="Sync status" description="Data syncs automatically when changes are made">
            <span className="flex items-center gap-2 text-sm text-nord14">
              <span className="w-2 h-2 bg-nord14 inline-block" />
              Active
            </span>
          </SettingRow>
          <div className="pt-2">
            <button onClick={handleSignOut} className="btn-danger">
              Sign Out
            </button>
          </div>
        </>
      ) : signupSuccess ? (
        <div className="p-4 border border-nord3 bg-nord1 space-y-3">
          <p className="text-sm text-nord14 font-medium">Check your email!</p>
          <p className="text-xs text-nord4">
            A confirmation link was sent to <span className="text-nord8">{email}</span>.
            Click it to verify your account, then sign in below.
          </p>
          <button
            onClick={() => {
              setSignupSuccess(false);
              setAuthMode('signin');
              setPassword('');
              setConfirmPassword('');
            }}
            className="btn-primary text-xs"
          >
            Go to Sign In
          </button>
        </div>
      ) : (
        <div className="p-4 border border-nord3 bg-nord1 space-y-4">
          <p className="text-xs text-nord4">
            Sign in or create an account to sync tasks across devices.
          </p>

          {/* Tabs */}
          <div className="flex border-b border-nord3">
            <button
              onClick={() => { setAuthMode('signin'); setAuthError(''); }}
              className={`flex-1 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                authMode === 'signin'
                  ? 'border-nord8 text-nord8'
                  : 'border-transparent text-nord4 hover:text-nord6'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setAuthMode('signup'); setAuthError(''); }}
              className={`flex-1 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                authMode === 'signup'
                  ? 'border-nord8 text-nord8'
                  : 'border-transparent text-nord4 hover:text-nord6'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Error */}
          {authError && (
            <div className="p-2 text-xs text-nord11 bg-nord11/10 border border-nord11/30">
              {authError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleAuth} className="space-y-3">
            <div>
              <label className="block text-xs text-nord4 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-base"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs text-nord4 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-base"
                placeholder="••••••••"
                autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
              />
            </div>
            {authMode === 'signup' && (
              <div>
                <label className="block text-xs text-nord4 mb-1">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-base"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={authLoading}
              className="btn-primary w-full"
            >
              {authLoading
                ? 'Please wait...'
                : authMode === 'signin'
                ? 'Sign In'
                : 'Create Account'}
            </button>
          </form>
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
                : 'border-nord3 hover:border-nord3Light'
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
                : 'border-nord3 hover:border-nord3Light'
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
          onClick={() =>
            updateSettings({ notificationsEnabled: !settings.notificationsEnabled })
          }
          className={`toggle ${settings.notificationsEnabled ? 'active' : ''}`}
        />
      </SettingRow>

      {settings.notificationsEnabled && (
        <SettingRow label="Notify before" description="Minutes before event/task start time">
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={60}
              step={5}
              value={settings.notifyMinutesBefore}
              onChange={(e) =>
                updateSettings({ notifyMinutesBefore: parseInt(e.target.value) })
              }
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

// ---- Device Sync Settings ----
function DeviceSyncSettings() {
  const [syncInfo, setSyncInfo] = useState<{ urls: string[]; running: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [pin, setPin] = useState<string | null>(null);
  const [pinCopied, setPinCopied] = useState(false);
  const desktop = isElectron();

  useEffect(() => {
    if (desktop) {
      desktopGetSyncInfo().then((info) => {
        if (info) setSyncInfo(info);
      });
      desktopGetPin().then((p) => {
        if (p) setPin(p);
      });
    }
  }, [desktop]);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCopyPin = () => {
    if (!pin) return;
    navigator.clipboard.writeText(pin).then(() => {
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    });
  };

  const handleResetPin = async () => {
    const newPin = await desktopResetPin();
    if (newPin) setPin(newPin);
  };

  if (!desktop) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="Device Sync"
          subtitle="You're viewing Muse from a synced device"
        />
        <div className="bg-nord1 border border-nord3 p-4 space-y-2">
          <div className="text-sm text-nord14 font-medium">Connected to desktop</div>
          <div className="text-xs text-nord4">
            Changes you make here will automatically sync back to the desktop app.
            The sync happens every 3 seconds.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Device Sync"
        subtitle="Access Muse from your phone or tablet on the same WiFi network"
      />

      <div className="bg-nord1 border border-nord3 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${syncInfo?.running ? 'bg-nord14' : 'bg-nord11'}`} />
          <span className="text-sm text-nord6">
            Sync server: {syncInfo?.running ? 'running' : 'starting...'}
          </span>
        </div>

        {syncInfo?.urls && syncInfo.urls.length > 0 ? (
          <div className="space-y-3">
            <div className="text-xs text-nord4">
              Open this URL on your phone browser (both devices must be on the same WiFi):
            </div>
            {syncInfo.urls.map((url) => (
              <div key={url} className="flex items-center gap-2">
                <code className="flex-1 text-sm text-nord13 bg-nord0 px-3 py-2 font-mono border border-nord3">
                  {url}
                </code>
                <button
                  onClick={() => handleCopy(url)}
                  className="btn-secondary text-xs flex items-center gap-1 px-2 py-2"
                  title="Copy URL"
                >
                  {copied ? <Check size={12} className="text-nord14" /> : <Copy size={12} />}
                </button>
              </div>
            ))}
            <div className="text-xs text-nord3 space-y-1 mt-2">
              <p>• Your phone will show the same Muse app in the browser</p>
              <p>• You can &quot;Add to Home Screen&quot; for an app-like experience</p>
              <p>• Changes sync automatically in both directions</p>
              <p>• Works on any WiFi where devices can see each other</p>
            </div>

            {/* PIN Security Section */}
            <div className="border-t border-nord3 pt-3 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <Shield size={14} className="text-nord13" />
                <span className="text-xs text-nord6 font-medium">Security PIN</span>
              </div>
              <div className="text-xs text-nord4 mb-3">
                Your phone must enter this PIN to access Muse. Share it only with your devices.
              </div>
              {pin && (
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-lg text-nord13 bg-nord0 px-4 py-2 font-mono border border-nord3 tracking-[0.3em] font-bold">
                    {pin}
                  </code>
                  <button
                    onClick={handleCopyPin}
                    className="btn-secondary text-xs flex items-center gap-1 px-2 py-2"
                    title="Copy PIN"
                  >
                    {pinCopied ? <Check size={12} className="text-nord14" /> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={handleResetPin}
                    className="btn-secondary text-xs flex items-center gap-1 px-2 py-2"
                    title="Generate new PIN"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>
              )}
              <div className="text-[10px] text-nord3">
                Resetting the PIN will disconnect any currently connected devices.
              </div>
            </div>

            <div className="border-t border-nord3 pt-3 mt-3">
              <div className="text-xs text-nord4 mb-2">
                Or install the Android app for a native experience:
              </div>
              <a
                href={`${syncInfo.urls[0]}/download-app`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-xs inline-flex items-center gap-1.5"
              >
                <Download size={12} />
                Download Muse.apk
              </a>
              <div className="text-[10px] text-nord3 mt-1.5">
                On your phone: open the URL above → tap &quot;Download Muse.apk&quot; → install
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-nord4">
            Unable to detect network address. Make sure you're connected to WiFi.
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Calendar Sync Settings ----
function CalendarSyncSettings({ importICS, exportICS }: { importICS: (content: string) => number; exportICS: () => string }) {
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ics,.ical';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const count = importICS(text);
      setImportStatus(`Imported ${count} event${count !== 1 ? 's' : ''}`);
      setTimeout(() => setImportStatus(null), 3000);
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
    URL.revokeObjectURL(url);
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
