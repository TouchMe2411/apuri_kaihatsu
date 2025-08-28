"use client";

import { Link } from "@/navigation";
import {
  Bell,
  CircleUser,
  Menu,
  Package2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ToggleMode } from "@/components/toggle-mode";
import { useTranslations } from "next-intl";
import { signIn, signOut, useSession } from "next-auth/react";
import { User } from "next-auth";
import NavLinks from "@/components/NavLinks";
import LanguageSelect from "@/components/LanguageSelect";
import { useState, useEffect } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession({
    required: true,
  });
  const t = useTranslations("app");
  const tName = useTranslations("names");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Load sidebar state from localStorage on component mount
  useEffect(() => {
    const savedState = localStorage.getItem("sidebarOpen");
    if (savedState !== null) {
      setSidebarOpen(savedState === "true");
    }
  }, []);

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("sidebarOpen", String(sidebarOpen));
  }, [sidebarOpen]);

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const user = session?.user as User;

  if (session?.error === "RefreshAccessTokenError") signIn();

  return (
    <div
      className={`grid min-h-screen w-full transition-all duration-300 ${
        sidebarOpen
          ? "md:grid-cols-[240px_1fr] lg:grid-cols-[280px_1fr]"
          : "grid-cols-[0px_1fr]"
      } relative`}
    >
      {/* Desktop Sidebar */}
      <div
        className={`hidden md:block relative transition-all duration-300 ${
          sidebarOpen ? "opacity-100 w-full" : "opacity-0 w-0 overflow-hidden"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-primary opacity-10 dark:opacity-20"></div>
        <div className="flex h-full max-h-screen flex-col gap-2 sticky top-0 z-40 backdrop-blur-sm">
          <div className="flex h-16 items-center border-b border-b-primary/20 px-6 lg:h-[60px]">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold leading-none text-gradient-primary"
            >
              <Package2 className="h-6 w-6 text-primary" />
              <span className="text-lg">{session && session?.schoolName}</span>
            </Link>
          </div>
          <div className="flex-1 px-4 py-4">
            <nav className="grid items-start gap-2 text-sm font-medium">
              <NavLinks user={user} />
            </nav>
          </div>
          <div className="mt-auto p-4 border-t border-t-primary/20">
            <div className="flex items-center gap-2 justify-between">
              <LanguageSelect />
              <ToggleMode />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        <header className="flex h-16 items-center gap-4 border-b bg-background/80 backdrop-blur-sm px-6 lg:h-[60px] sticky top-0 z-50">
          {/* Mobile Menu Button - Only visible on mobile */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 md:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">{t("menu")}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0">
              <div className="relative h-full">
                <div className="absolute inset-0 bg-gradient-primary opacity-10 dark:opacity-20"></div>
                <div className="relative h-full flex flex-col">
                  <div className="flex h-16 items-center border-b border-b-primary/20 px-6">
                    <Link
                      href="/"
                      className="flex items-center gap-2 font-semibold leading-none text-gradient-primary"
                    >
                      <Package2 className="h-6 w-6 text-primary" />
                      <span className="text-lg">{session?.schoolName}</span>
                    </Link>
                  </div>
                  <nav className="grid gap-2 p-4 text-md font-medium">
                    <NavLinks user={user} />
                  </nav>
                  <div className="mt-auto p-4 border-t border-t-primary/20">
                    <div className="flex items-center gap-2 justify-between">
                      <LanguageSelect />
                      <ToggleMode />
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Desktop Sidebar Toggle Button - Only visible on desktop */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="hidden md:flex hover:bg-background"
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-5 w-5 text-primary" />
            ) : (
              <PanelLeftOpen className="h-5 w-5 text-primary" />
            )}
            <span className="sr-only">
              {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
            </span>
          </Button>

          <div className="flex items-center justify-end w-full gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer">
                  <span className="hidden sm:block font-medium">
                    {user && tName("name", { ...user })}
                  </span>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="rounded-full bg-gradient-primary text-white hover:opacity-90"
                  >
                    <CircleUser className="h-5 w-5" />
                    <span className="sr-only">{t("account")}</span>
                  </Button>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <div className="font-semibold">{t("account")}</div>
                    <div className="text-muted-foreground text-sm">
                      {user?.email}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>{t("settings")}</DropdownMenuItem>
                <DropdownMenuItem>{t("support")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => await signOut()}>
                  {t("logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6 bg-background/60">
          {children}
        </main>
      </div>
    </div>
  );
}
