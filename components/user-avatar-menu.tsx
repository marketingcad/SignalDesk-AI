"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  User,
  LogOut,
  Camera,
  Eye,
  EyeOff,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface UserData {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}

function getInitials(email: string, name?: string | null): string {
  if (name) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return email.charAt(0).toUpperCase();
}

export function UserAvatarMenu() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Avatar Button */}
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="relative flex items-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Avatar size="default" className="cursor-pointer ring-2 ring-border hover:ring-primary/50 transition-all">
            {user?.avatar_url ? (
              <AvatarImage src={user.avatar_url} alt="Profile" />
            ) : null}
            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
              {user ? getInitials(user.email, user.full_name) : "?"}
            </AvatarFallback>
          </Avatar>
          {/* Green active indicator */}
          <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" />
        </button>

        {/* Dropdown Card */}
        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-64 origin-top-right animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200">
            <div className="rounded-xl border border-border bg-card shadow-xl overflow-hidden">
              {/* User Info */}
              <div className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar size="lg">
                      {user?.avatar_url ? (
                        <AvatarImage src={user.avatar_url} alt="Profile" />
                      ) : null}
                      <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                        {user ? getInitials(user.email, user.full_name) : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user?.full_name || "Admin User"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user?.email || "Loading..."}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] text-emerald-500 font-medium">
                        Active
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Menu Items */}
              <div className="p-1.5">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setProfileOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </button>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    handleLogout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile Modal — portaled to body so it covers the full screen */}
      {profileOpen &&
        createPortal(
          <ProfileModal
            user={user}
            onClose={() => setProfileOpen(false)}
            onUpdate={() => fetchUser()}
          />,
          document.body
        )}
    </>
  );
}

/* ─── Profile Modal ────────────────────────────────────────────── */

function ProfileModal({
  user,
  onClose,
  onUpdate,
}: {
  user: UserData | null;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || "");
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setAvatarPreview(result);
      setAvatarUrl(result);
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setError("");
    setSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (newPassword && !currentPassword) {
      setError("Current password is required to set a new password");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = {};

      if (fullName !== (user?.full_name || "")) body.full_name = fullName;
      if (email !== user?.email) body.email = email;
      if (avatarUrl !== (user?.avatar_url || "")) body.avatar_url = avatarUrl;
      if (newPassword) {
        body.current_password = currentPassword;
        body.new_password = newPassword;
      }

      if (Object.keys(body).length === 0) {
        setSuccess("No changes to save");
        setSaving(false);
        return;
      }

      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to update profile");
      } else {
        setSuccess("Profile updated successfully");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        onUpdate();
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-200 p-4"
    >
      <div className="relative w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Profile</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {/* Avatar Upload */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative group">
                <Avatar
                  size="lg"
                  className="h-20 w-20 ring-4 ring-border"
                >
                  {avatarPreview ? (
                    <AvatarImage src={avatarPreview} alt="Profile" />
                  ) : null}
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xl">
                    {user ? getInitials(user.email, fullName || user.full_name) : "?"}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-1 right-1 block h-4 w-4 rounded-full bg-emerald-500 ring-2 ring-card" />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  <Camera className="h-5 w-5 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Click avatar to change photo
              </p>
            </div>

            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Full Name
              </label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Email
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>

            <Separator />

            {/* Password Section */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                Change Password
              </p>

              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Current Password
                </label>
                <div className="relative">
                  <Input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showCurrentPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </div>
            </div>

            {/* Messages */}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500">
                {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-500">
                <Check className="h-4 w-4 shrink-0" />
                {success}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
