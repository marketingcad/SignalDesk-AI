"use client";

import { Bell, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatarMenu } from "@/components/user-avatar-menu";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-card/80 px-6 backdrop-blur-xl">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Search */}
        <Button variant="outline" size="sm" className="gap-2 text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search leads...</span>
          <kbd className="ml-2 hidden rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            /
          </kbd>
        </Button>
        {/* Notifications */}
        <Button variant="outline" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4" />
          <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground border-0">
            5
          </Badge>
        </Button>
        {/* Theme Toggle */}
        <ThemeToggle />
        {/* User Avatar */}
        <UserAvatarMenu />
        {/* Actions */}
        {actions}
      </div>
    </header>
  );
}

export function ActionButton({
  children,
  variant = "primary",
  onClick,
  icon: Icon,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Button
      onClick={onClick}
      variant={variant === "primary" ? "default" : "outline"}
      size="sm"
      className={cn(
        "gap-2",
        variant === "primary" && "shadow-sm shadow-primary/25"
      )}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </Button>
  );
}
