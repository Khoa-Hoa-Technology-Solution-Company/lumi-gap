import { useState, FormEvent, useEffect } from "react";
import { useParams } from "react-router-dom";
import { User, Lock, Settings2, Save, Key, ShieldAlert, Plus, X, GraduationCap, Mail, FileText, Upload, Award, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUser, useUpdateProfile, useChangePassword } from "@/features/auth";
import { Badge } from "@/components/ui/badge";
import { SubmitPaperPage } from "./papers/submit-paper";
import { MyPapersPage } from "./papers/my-papers";
import { avatars, getLevel, getLevelProgress, getNextLevelPoints, LEVEL_THRESHOLDS } from "@/utils/level";
import { formatNumber } from "@/utils";
import { CreditHistory } from "@/features/credits";

type SettingsSection = "profile" | "credits" | "security" | "preferences" | "submit-paper" | "my-papers";

export function ProfilePage() {
  const { section } = useParams<{ section?: string }>();
  const { data: userData, isLoading: isUserLoading } = useCurrentUser();
  const updateProfileMutation = useUpdateProfile();
  const changePasswordMutation = useChangePassword();

  const user = userData?.user;
  const isAdmin = user?.role === "admin";

  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  // Sync section parameter with active tab state
  useEffect(() => {
    if (section === "security" || section === "account") {
      setActiveSection("security");
    } else if (section === "credits" || section === "credit-history") {
      setActiveSection("credits");
    } else if (section === "preferences" || section === "customization" || section === "notifications") {
      setActiveSection("preferences");
    } else if ((section === "submit-paper" || section === "submit") && !isAdmin) {
      setActiveSection("submit-paper");
    } else if ((section === "my-papers" || section === "submissions") && !isAdmin) {
      setActiveSection("my-papers");
    } else {
      setActiveSection("profile");
    }
  }, [section, isAdmin]);

  // Profile Form State
  const [fullName, setFullName] = useState("");
  const [institution, setInstitution] = useState("");
  const [interestInput, setInterestInput] = useState("");
  const [researchInterests, setResearchInterests] = useState<string[]>([]);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // UI Messages
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Sync state with current user data when loaded
  useEffect(() => {
    if (userData?.user) {
      setFullName(userData.user.fullName || "");
      setInstitution(userData.user.institution || "");
      setResearchInterests(userData.user.researchInterests || []);
    }
  }, [userData]);

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (!fullName.trim()) {
      setErrorMessage("Full Name is required.");
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        fullName,
        institution,
        researchInterests,
      });
      setSuccessMessage("Profile updated successfully.");
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error?.message || "Unable to update profile.");
    }
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (!currentPassword) {
      setErrorMessage("Current password is required.");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("New password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New passwords do not match.");
      return;
    }

    try {
      await changePasswordMutation.mutateAsync({
        currentPassword,
        newPassword,
      });
      setSuccessMessage("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.error?.message || "Unable to update password.");
    }
  };

  // Tag helper
  const handleAddInterest = () => {
    const trimmed = interestInput.trim();
    if (trimmed && !researchInterests.includes(trimmed)) {
      setResearchInterests([...researchInterests, trimmed]);
      setInterestInput("");
    }
  };

  const handleRemoveInterest = (tag: string) => {
    setResearchInterests(researchInterests.filter(t => t !== tag));
  };

  const handleKeyDownInterest = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddInterest();
    }
  };

  if (isUserLoading) {
    return (
      <div className="container py-20 text-center text-slate-500">
        Loading settings...
      </div>
    );
  }

  return (
    <main className="container max-w-5xl py-8 px-4 sm:px-6 lg:px-8">
      {/* Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Account Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Manage your research profile and credentials.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
        {/* Left Nav Menu */}
        <aside className="md:col-span-4 lg:col-span-3 space-y-1">
          <button
            onClick={() => { setActiveSection("profile"); setSuccessMessage(""); setErrorMessage(""); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-semibold transition-all ${
              activeSection === "profile"
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            <User className="w-4 h-4" />
            My Profile
          </button>

          {!isAdmin && (
            <>
              <button
                onClick={() => { setActiveSection("submit-paper"); setSuccessMessage(""); setErrorMessage(""); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-semibold transition-all ${
                  activeSection === "submit-paper"
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <Upload className="w-4 h-4" />
                Submit Paper
              </button>
              <button
                onClick={() => { setActiveSection("my-papers"); setSuccessMessage(""); setErrorMessage(""); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-semibold transition-all ${
                  activeSection === "my-papers"
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                }`}
              >
                <FileText className="w-4 h-4" />
                My Papers
              </button>
            </>
          )}

          <button
            onClick={() => { setActiveSection("credits"); setSuccessMessage(""); setErrorMessage(""); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-semibold transition-all ${
              activeSection === "credits"
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            <ReceiptText className="w-4 h-4" />
            Credit History
          </button>

          <button
            onClick={() => { setActiveSection("security"); setSuccessMessage(""); setErrorMessage(""); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-semibold transition-all ${
              activeSection === "security"
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            <Lock className="w-4 h-4" />
            Security
          </button>
          <button
            onClick={() => { setActiveSection("preferences"); setSuccessMessage(""); setErrorMessage(""); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-semibold transition-all ${
              activeSection === "preferences"
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40"
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Preferences
          </button>
        </aside>

        {/* Right Content Panels */}
        <section className="md:col-span-8 lg:col-span-9 bg-white dark:bg-[#121212] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8">
          
          {/* Notifications */}
          {successMessage && (
            <div className="mb-6 rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-400 animate-fadeIn">
              {successMessage}
            </div>
          )}
          {errorMessage && (
            <div className="mb-6 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 p-4 text-sm font-semibold text-red-700 dark:text-red-400 animate-fadeIn">
              {errorMessage}
            </div>
          )}

          {/* Section 1: User Profile */}
          {activeSection === "profile" && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Profile Information
              </h2>

              {!isAdmin && user && (
                (() => {
                  const pts = user.points ?? 0;
                  const currentLevel = getLevel(pts);
                  const progress = getLevelProgress(pts, currentLevel);
                  const nextLevelPoints = getNextLevelPoints(currentLevel);
                  const pointsNeeded = nextLevelPoints === Infinity ? 0 : nextLevelPoints - pts;
                  const levelAvatar = avatars[currentLevel];

                  return (
                    <div className="mb-8 p-6 bg-slate-50 dark:bg-[#1a1a24]/50 border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col sm:flex-row items-center gap-6 shadow-sm">
                      <div className="relative group shrink-0">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full blur opacity-30 group-hover:opacity-55 transition duration-500"></div>
                        <div className="relative w-24 h-24 rounded-full bg-white dark:bg-zinc-900 border-2 border-white dark:border-zinc-800 overflow-hidden flex items-center justify-center p-1.5 shadow-md">
                          <img
                            src={levelAvatar}
                            alt={`Level ${currentLevel} Avatar`}
                            className="w-full h-full object-contain rounded-full"
                          />
                        </div>
                        <span className="absolute -bottom-1.5 right-1/2 translate-x-1/2 bg-blue-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow border-2 border-white dark:border-zinc-900 uppercase tracking-wide">
                          Lv {currentLevel}
                        </span>
                      </div>

                      <div className="flex-1 w-full text-center sm:text-left space-y-3">
                        <div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">
                              {user.fullName}
                            </h3>
                            <div className="flex justify-center sm:justify-start gap-2">
                              <Badge className="bg-blue-100 hover:bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-none capitalize text-xs font-bold px-2 py-0.5">
                                {user.role}
                              </Badge>
                              <Badge className="bg-indigo-100 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 border-none text-xs font-bold px-2 py-0.5">
                                Level {currentLevel}
                              </Badge>
                            </div>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{user.email}</p>
                        </div>

                        {currentLevel < 10 ? (
                          <div className="space-y-1.5 max-w-md">
                            <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                              <span>Next level: {progress}%</span>
                              <span>{pts}/{nextLevelPoints} pts</span>
                            </div>
                            <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium italic">
                              Need {pointsNeeded} more points to reach level {currentLevel + 1}
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1 max-w-md">
                            <p className="text-xs text-amber-500 font-bold flex items-center gap-1">
                              👑 Max Level reached! (Level 10)
                            </p>
                            <div className="h-2 w-full bg-amber-500 rounded-full"></div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}

              {!isAdmin && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <button
                    type="button"
                    onClick={() => setActiveSection("credits")}
                    className="bg-gradient-to-br from-blue-50 to-indigo-50/50 dark:from-[#1b1c24] dark:to-[#121319] border border-blue-100 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-between text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:hover:border-blue-800"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Available Credits</p>
                      <p className="text-2xl font-black text-blue-700 dark:text-blue-400 mt-1">{formatNumber((userData?.user as any)?.credits)} credits</p>
                      <p className="mt-1 text-[10px] font-semibold text-blue-600/70 dark:text-blue-400/70">View transaction history</p>
                    </div>
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <FileText className="w-5 h-5" />
                    </div>
                  </button>
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-[#241e17] dark:to-[#19130e] border border-amber-100 dark:border-zinc-800 rounded-xl p-4 flex items-center justify-between shadow-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">Contribution Points</p>
                      <p className="text-2xl font-black text-amber-700 dark:text-amber-500 mt-1">{formatNumber((userData?.user as any)?.points)} pts</p>
                    </div>
                    <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-500">
                      <Award className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSaveProfile} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Name Input */}
                  <div className="space-y-2">
                    <Label htmlFor="fullName" className="text-sm font-bold text-slate-700 dark:text-slate-300">Full Name</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="h-10 focus:ring-2 focus:ring-blue-500 dark:bg-[#1e1e1e]"
                    />
                  </div>

                  {/* Email (Readonly) */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-bold text-slate-700 dark:text-slate-300">Email Address (Read-only)</Label>
                    <div className="relative">
                      <Input
                        id="email"
                        value={userData?.user?.email || ""}
                        disabled
                        className="h-10 bg-slate-50 dark:bg-slate-800/40 text-slate-500 border-slate-200 dark:border-slate-800 pl-10 cursor-not-allowed"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

                {/* Institution/University */}
                <div className="space-y-2">
                  <Label htmlFor="institution" className="text-sm font-bold text-slate-700 dark:text-slate-300">University / Institution</Label>
                  <div className="relative">
                    <Input
                      id="institution"
                      value={institution}
                      onChange={(e) => setInstitution(e.target.value)}
                      placeholder="e.g. FPT University"
                      className="h-10 pl-10 focus:ring-2 focus:ring-blue-500 dark:bg-[#1e1e1e]"
                    />
                    <GraduationCap className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Research Interests (Tags) */}
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">Research Interests</Label>
                  <div className="flex flex-wrap gap-2 mb-2 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg min-h-[50px] border border-slate-100 dark:border-slate-800">
                    {researchInterests.length === 0 ? (
                      <span className="text-xs text-slate-400">No interests added yet. Type below and press Enter or click Add.</span>
                    ) : (
                      researchInterests.map((interest) => (
                        <Badge key={interest} variant="secondary" className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded-full font-semibold">
                          {interest}
                          <X
                            className="w-3.5 h-3.5 hover:text-red-500 cursor-pointer"
                            onClick={() => handleRemoveInterest(interest)}
                          />
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={interestInput}
                      onChange={(e) => setInterestInput(e.target.value)}
                      onKeyDown={handleKeyDownInterest}
                      placeholder="Add research interests (e.g. NLP, Computer Vision)"
                      className="h-10 focus:ring-2 focus:ring-blue-500 dark:bg-[#1e1e1e]"
                    />
                    <Button 
                      type="button" 
                      onClick={handleAddInterest} 
                      className="h-10 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 border border-slate-200 dark:border-slate-700"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                </div>

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-bold h-11 px-6 gap-2 rounded-lg"
                >
                  <Save className="w-4 h-4" />
                  {updateProfileMutation.isPending ? "Saving..." : "Save Profile Information"}
                </Button>
              </form>
            </div>
          )}

          {/* Section 2: Credit ledger */}
          {activeSection === "credits" && <CreditHistory />}

          {/* Section 3: Security & Password */}
          {activeSection === "security" && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Key className="w-5 h-5 text-blue-600" />
                Change Password
              </h2>

              <form onSubmit={handleChangePassword} className="space-y-6 max-w-xl">
                {/* Current Password */}
                <div className="space-y-2">
                  <Label htmlFor="currentPassword" className="text-sm font-bold text-slate-700 dark:text-slate-300">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="h-10 focus:ring-2 focus:ring-blue-500 dark:bg-[#1e1e1e]"
                  />
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="newPassword" className="text-sm font-bold text-slate-700 dark:text-slate-300">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Create a strong password (min 8 chars)"
                    className="h-10 focus:ring-2 focus:ring-blue-500 dark:bg-[#1e1e1e]"
                  />
                </div>

                {/* Confirm New Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-bold text-slate-700 dark:text-slate-300">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className="h-10 focus:ring-2 focus:ring-blue-500 dark:bg-[#1e1e1e]"
                  />
                </div>

                {/* Submit button */}
                <Button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  className="bg-blue-700 hover:bg-blue-800 text-white font-bold h-11 px-6 gap-2 rounded-lg"
                >
                  <Lock className="w-4 h-4" />
                  {changePasswordMutation.isPending ? "Updating..." : "Change Password"}
                </Button>
              </form>
            </div>
          )}

          {/* Section 4: Preferences (Mock/Future Work) */}
          {activeSection === "preferences" && (
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-blue-600" />
                Notification & Appearance Preferences
              </h2>

              <div className="space-y-6 text-slate-600 dark:text-slate-400">
                <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 flex gap-3 text-sm">
                  <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0" />
                  <p>These preferences will become available in Phase E. For now, system notification tokens are auto-registered.</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-900">
                    <div>
                      <h4 className="font-semibold text-slate-950 dark:text-white">Email Digest</h4>
                      <p className="text-xs text-slate-500">Weekly summaries of trending papers in your research fields.</p>
                    </div>
                    <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full relative opacity-50">
                      <div className="w-3.5 h-3.5 bg-white rounded-full absolute left-0.5 top-0.5 shadow-sm"></div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-900">
                    <div>
                      <h4 className="font-semibold text-slate-950 dark:text-white">Push Notifications</h4>
                      <p className="text-xs text-slate-500">Receive alerts when new AI reports are generated.</p>
                    </div>
                    <div className="w-8 h-4 bg-slate-300 dark:bg-slate-700 rounded-full relative opacity-50">
                      <div className="w-3.5 h-3.5 bg-white rounded-full absolute left-0.5 top-0.5 shadow-sm"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Section 5: Submit Paper */}
          {activeSection === "submit-paper" && !isAdmin && (
            <SubmitPaperPage isEmbedded={true} />
          )}

          {/* Section 6: My Papers */}
          {activeSection === "my-papers" && !isAdmin && (
            <MyPapersPage isEmbedded={true} />
          )}

        </section>
      </div>
    </main>
  );
}
