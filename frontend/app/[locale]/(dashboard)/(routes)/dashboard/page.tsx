"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/navigation";
import {
  Users,
  UserRound,
  MessagesSquare,
  BookOpen,
  Shield,
  TrendingUp,
} from "lucide-react";
import useApiQuery from "@/lib/useApiQuery";

type CardData = {
  id: number;
  title: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  countKey?: string;
};

// Dashboard data structure
const cardData: CardData[] = [
  {
    id: 1,
    title: "Forms",
    description: "click here to view forms",
    href: "/forms",
    icon: <BookOpen className="h-5 w-5" />,
    countKey: "forms",
  },
  {
    id: 2,
    title: "Messages",
    description: "click here to view messages",
    href: "/messages",
    icon: <MessagesSquare className="h-5 w-5" />,
    countKey: "messages",
  },
  {
    id: 3,
    title: "Students",
    description: "click here to view students",
    href: "/students",
    icon: <UserRound className="h-5 w-5" />,
    countKey: "students",
  },
  {
    id: 4,
    title: "Groups",
    description: "click here to view groups",
    href: "/groups",
    icon: <Users className="h-5 w-5" />,
    countKey: "groups",
  },
  {
    id: 5,
    title: "Parents",
    description: "click here to view parents",
    href: "/parents",
    icon: <Users className="h-5 w-5" />,
    countKey: "parents",
  },
  {
    id: 6,
    title: "Admins",
    description: "click here to view admins",
    href: "/admins",
    icon: <Shield className="h-5 w-5" />,
    countKey: "admins",
  },
];

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  
  // Fetch dashboard statistics from backend
  const { data: stats, isLoading } = useApiQuery<{
    forms: number;
    messages: number;
    students: number;
    groups: number;
    parents: number;
    admins: number;
  }>(`dashboard/stats`, ["dashboardStats"]);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div>
        <h1 className="text-2xl font-medium text-foreground">
          {t("Dashboard")}
        </h1>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here&apos;s an overview of your school system.
        </p>
      </div>
      
      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cardData.map((data, index) => (
          <Link key={index} href={data.href} passHref>
            <Card className="border border-border hover:shadow-lg dark:hover:shadow-slate-700/50 transition-all duration-200 bg-card">
              <CardHeader className="p-4 border-b border-border">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg font-medium text-card-foreground">
                    {t(data.title)}
                  </CardTitle>
                  <div className="text-muted-foreground">{data.icon}</div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-2xl font-medium text-card-foreground">
                    {isLoading 
                      ? "..." 
                      : stats && data.countKey 
                        ? stats[data.countKey as keyof typeof stats] 
                        : 0
                    }
                  </div>
                </div>
                <CardDescription className="mt-1 text-muted-foreground">
                  {t(data.description)}
                </CardDescription>
              </CardContent>
              <CardFooter className="px-4 py-3 border-t border-border">
                <span className="text-sm font-medium flex items-center text-muted-foreground hover:text-foreground transition-colors">
                  View details
                  <svg
                    className="ml-1 w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </span>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}