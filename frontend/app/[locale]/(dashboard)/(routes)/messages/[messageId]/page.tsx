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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter, usePathname, Link } from "@/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import postView from "@/types/postView";
import { Button } from "@/components/ui/button";
import StudentApi from "@/types/studentApi";
import {
  ArrowLeft,
  Bell,
  Check,
  CheckCheck,
  Clock,
  Edit,
  EllipsisVertical,
  Eye,
  EyeOff,
  CalendarClock,
  Search,
  Users,
  User,
  AlertTriangle,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import Student from "@/types/student";
import { Input } from "@/components/ui/input";
import PaginationApi from "@/components/PaginationApi";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import GroupApi from "@/types/groupApi";
import Group from "@/types/group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormatDateTime } from "@/lib/utils";
import TableApi from "@/components/TableApi";
import { useState } from "react";
import NotFound from "@/components/NotFound";
import useApiQuery from "@/lib/useApiQuery";
import { Badge } from "@/components/ui/badge";

export default function ThisMessage({
  params: { messageId },
}: {
  params: { messageId: string };
}) {
  const t = useTranslations("ThisMessage");
  const tName = useTranslations("names");
  const router = useRouter();
  const pathname = usePathname();
  const { data } = useApiQuery<postView>(`post/${messageId}`, [
    "message",
    messageId,
  ]);

  const [studentPage, setStudentPage] = useState(1);
  const [studentSearch, setStudentSearch] = useState("");
  const { data: studentData, isError: isStudentError } =
    useApiQuery<StudentApi>(
      `post/${messageId}/students?page=${studentPage}&email=${studentSearch}`,
      ["student", messageId, studentPage, studentSearch]
    );
  const [groupPage, setGroupPage] = useState(1);
  const [groupSearch, setGroupSearch] = useState("");
  const { data: groupData, isError } = useApiQuery<GroupApi>(
    `post/${messageId}/groups?page=${groupPage}&name=${groupSearch}`,
    ["group", messageId, groupPage, groupSearch]
  );

  const studentColumns: ColumnDef<Student>[] = [
    {
      accessorKey: "name",
      header: t("name"),
      cell: ({ row }) => (
        <Link
          href={`${messageId}/student/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {tName("name", { ...row?.original, parents: "" })}
        </Link>
      ),
    },
    {
      accessorKey: "email",
      header: t("email"),
      cell: ({ row }) => (
        <Link
          href={`${messageId}/student/${row.original.id}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {row.getValue("email")}
        </Link>
      ),
    },
    {
      accessorKey: "student_number",
      header: t("studentId"),
      cell: ({ row }) => (
        <Link href={`${messageId}/student/${row.original.id}`}>
          {row.getValue("student_number")}
        </Link>
      ),
    },
    {
      accessorKey: "phone_number",
      header: t("phoneNumber"),
      cell: ({ row }) => (
        <Link href={`${messageId}/student/${row.original.id}`}>
          {row.getValue("phone_number")}
        </Link>
      ),
    },
    {
      accessorKey: "parents",
      header: t("Parents"),
      cell: ({ row }) => {
        const parents = row.original?.parents || [];
        const anyViewed = parents.some((parent) => parent.viewed_at);

        return (
          <HoverCard>
            <HoverCardTrigger asChild>
              <Link
                href={`${pathname}/student/${row.original.id}`}
                className="flex items-center"
              >
                <Bell
                  className={`h-5 w-5 ${
                    anyViewed ? "text-green-500" : "text-amber-500"
                  }`}
                />
                <span className="ml-2">{parents.length}</span>
              </Link>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">
                  {t("ParentNotifications")}
                </h4>
                {row.original?.parents?.length ? (
                  row.original?.parents.map((parent) => (
                    <div key={parent.id}>
                      <div className="flex justify-between items-center py-2">
                        <div className="font-medium">
                          {tName("name", { ...parent })}
                        </div>
                        <div className="flex items-center">
                          {parent.viewed_at ? (
                            <Badge
                              variant="outline"
                              className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200"
                            >
                              <CheckCheck className="h-3.5 w-3.5" />
                              <span>{t("Read")}</span>
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="flex items-center gap-1 bg-amber-50 text-amber-700 border-amber-200"
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>Unread</span>
                            </Badge>
                          )}
                        </div>
                      </div>
                      {row.original?.parents?.at(-1) !== parent && (
                        <Separator className="my-1" />
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground py-2">
                    {t("noParents")}
                  </div>
                )}
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      },
    },
  ];

  const groupColumns: ColumnDef<Group>[] = [
    {
      accessorKey: "name",
      header: t("name"),
      cell: ({ row }) => (
        <Link
          href={`${messageId}/group/${row.original.id}`}
          className="font-medium text-primary hover:underline"
        >
          {row.getValue("name")}
        </Link>
      ),
    },
    {
      accessorKey: "viewed_count",
      header: t("viewed_count"),
      cell: ({ row }) => (
        <Link
          href={`${messageId}/group/${row.original.id}`}
          className="flex items-center"
        >
          <Eye className="h-4 w-4 text-green-500 mr-1.5" />
          <span>{row.getValue("viewed_count")}</span>
        </Link>
      ),
    },
    {
      accessorKey: "not_viewed_count",
      header: t("not_viewed_count"),
      cell: ({ row }) => (
        <Link
          href={`${messageId}/group/${row.original.id}`}
          className="flex items-center"
        >
          <EyeOff className="h-4 w-4 text-amber-500 mr-1.5" />
          <span>{row.getValue("not_viewed_count")}</span>
        </Link>
      ),
    },
    {
      header: t("Actions"),
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <EllipsisVertical className="h-4 w-4" />
              <span className="sr-only">{t("OpenMenu")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() =>
                router.push(`${pathname}/group/${row.original.id}`)
              }
            >
              {t("view")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const edited_atDate = FormatDateTime(data?.post?.edited_at ?? "");
  const sent_atDate = FormatDateTime(data?.post?.sent_at ?? "");

  // Helper function to get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 border-red-200";
      case "medium":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "low":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  if (isError && isStudentError) return <NotFound />;

  // Calculate total recipients safely
  const totalRecipients =
    (data?.post?.read_count ? Number(data.post.read_count) : 0) +
    (data?.post?.unread_count ? Number(data.post.unread_count) : 0);

  return (
    <div className="w-full h-full space-y-6">
      <Card className="shadow-lg border-0 rounded-none h-full">
        <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <div className="flex items-center space-x-2">
              <Link href="/messages" passHref>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <CardTitle className="text-2xl">{t("ViewMessage")}</CardTitle>
            </div>
            <Link href={`/messages/edit/${messageId}`} passHref>
              <Button className="gap-2">
                <Edit className="h-4 w-4" />
                {t("editMessage")}
              </Button>
            </Link>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="space-y-6">
            {/* Message Content Section */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border p-6 shadow-sm">
              <div className="flex flex-col gap-1 mb-4">
                <Badge
                  variant="outline"
                  className={`self-start px-3 py-1 text-sm ${getPriorityColor(
                    data?.post?.priority || "low"
                  )}`}
                >
                  {data?.post && t(`Priority.${data?.post?.priority}`)}
                </Badge>
                <h1 className="text-2xl font-bold mt-3">{data?.post?.title}</h1>
              </div>

              <Separator className="my-4" />

              <div className="text-base whitespace-pre-wrap min-h-[200px]">
                {data?.post?.description}
              </div>

              <Separator className="my-4" />

              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarClock className="h-4 w-4" />
                  <span>
                    {t("SentAt")}: {sent_atDate}
                  </span>
                </div>
                {edited_atDate !== sent_atDate && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      {t("EditedAt")}: {edited_atDate}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Message Stats Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                      {t("ReadCount")}
                    </p>
                    <h3 className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">
                      {data?.post?.read_count}
                    </h3>
                  </div>
                  <Eye className="h-8 w-8 text-green-500" />
                </CardContent>
              </Card>

              <Card className="bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                      {t("UnReadCount")}
                    </p>
                    <h3 className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
                      {data?.post?.unread_count}
                    </h3>
                  </div>
                  <EyeOff className="h-8 w-8 text-amber-500" />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Total Recipients
                    </p>
                    <h3 className="text-2xl font-bold mt-1">
                      {totalRecipients}
                    </h3>
                  </div>
                  <Users className="h-8 w-8 text-primary" />
                </CardContent>
              </Card>
            </div>

            {/* Recipients Tabs Section */}
            <Tabs defaultValue="groups" className="w-full">
              <TabsList className="w-full bg-slate-100 dark:bg-slate-900 p-0 mb-6">
                <TabsTrigger
                  value="groups"
                  className="flex-1 py-3 rounded-none data-[state=active]:bg-background"
                >
                  <Users className="h-4 w-4 mr-2" />
                  {t("groups")}
                </TabsTrigger>
                <TabsTrigger
                  value="students"
                  className="flex-1 py-3 rounded-none data-[state=active]:bg-background"
                >
                  <User className="h-4 w-4 mr-2" />
                  {t("students")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="groups" className="mt-0">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <CardTitle>{t("groups")}</CardTitle>
                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Filter..."
                          onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setGroupSearch(e.target.value);
                            setGroupPage(1);
                          }}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-hidden">
                      <TableApi
                        data={groupData?.groups ?? null}
                        columns={groupColumns}
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-end border-t pt-4">
                    <PaginationApi
                      data={groupData?.pagination ?? null}
                      setPage={setGroupPage}
                    />
                  </CardFooter>
                </Card>
              </TabsContent>

              <TabsContent value="students" className="mt-0">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <CardTitle>{t("students")}</CardTitle>
                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={t("filterEmail")}
                          onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setStudentSearch(e.target.value);
                            setStudentPage(1);
                          }}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border overflow-hidden">
                      <TableApi
                        data={studentData?.students ?? null}
                        columns={studentColumns}
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-end border-t pt-4">
                    <PaginationApi
                      data={studentData?.pagination ?? null}
                      setPage={setStudentPage}
                    />
                  </CardFooter>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
