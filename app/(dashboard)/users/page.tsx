"use client";

import { useState, useEffect } from "react";
import { Header, ActionButton } from "@/components/header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  UserPlus,
  Trash2,
  Loader2,
  Users,
  Mail,
  Calendar,
  X,
  Eye,
  EyeOff,
} from "lucide-react";

interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState("");

  // Add user form state
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) {
        setUsers(data.users);
      }
    } catch {
      console.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, []);

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setAddError("");
    setAddSuccess("");
    setAddLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          full_name: newFullName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAddError(data.error || "Failed to create user");
        return;
      }

      setAddSuccess("User created successfully");
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setShowPassword(false);
      fetchUsers();

      setTimeout(() => {
        setAddSuccess("");
        setShowAddForm(false);
      }, 2000);
    } catch {
      setAddError("Something went wrong. Please try again.");
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDeleteUser(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Failed to delete user");
        return;
      }

      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch {
      alert("Failed to delete user");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name && u.full_name.toLowerCase().includes(search.toLowerCase()))
  );

  function getInitials(user: User) {
    if (user.full_name) {
      return user.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return user.email[0].toUpperCase();
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <>
      <Header
        title="User Management"
        subtitle="Add and manage team members"
        actions={
          <ActionButton icon={UserPlus} onClick={() => setShowAddForm(true)}>
            Add User
          </ActionButton>
        }
      />
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Add User Modal */}
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-md mx-4 p-0 overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <UserPlus className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Add New User
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Create an account for a team member
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    setShowAddForm(false);
                    setAddError("");
                    setAddSuccess("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <form onSubmit={handleAddUser} className="p-5 space-y-4">
                {addError && (
                  <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {addError}
                  </div>
                )}
                {addSuccess && (
                  <div className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-500">
                    {addSuccess}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    placeholder="John Doe"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Email <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="user@company.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Password <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete="new-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowAddForm(false);
                      setAddError("");
                      setAddSuccess("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1" disabled={addLoading}>
                    {addLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create User
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {users.length}
              </p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10">
              <Mail className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {users.length}
              </p>
              <p className="text-xs text-muted-foreground">Active Accounts</p>
            </div>
          </Card>
          <Card className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
              <Calendar className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {users.length > 0
                  ? formatDate(users[0].created_at)
                  : "-"}
              </p>
              <p className="text-xs text-muted-foreground">Latest Added</p>
            </div>
          </Card>
        </div>

        {/* Users List */}
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Team Members
                </h2>
                <p className="text-xs text-muted-foreground">
                  {filteredUsers.length} user
                  {filteredUsers.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <Input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>

          <div className="divide-y divide-border">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm font-medium">No users found</p>
                <p className="text-xs mt-1">
                  {search
                    ? "Try a different search term"
                    : "Add your first team member"}
                </p>
              </div>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between px-5 py-4 hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      {user.avatar_url && (
                        <AvatarImage src={user.avatar_url} />
                      )}
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                        {getInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {user.full_name || "No name set"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium"
                    >
                      Joined {formatDate(user.created_at)}
                    </Badge>

                    {confirmDeleteId === user.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-destructive font-medium">
                          Confirm?
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleDeleteUser(user.id)}
                          disabled={deletingId === user.id}
                        >
                          {deletingId === user.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Delete"
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmDeleteId(user.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
