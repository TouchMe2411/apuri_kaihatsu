"use client";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  EllipsisVertical,
  Plus,
  MessageSquare,
  Search,
  Edit,
  Trash2,
  AlertCircle,
  Clock,
  Eye,
  Save,
  Filter,
  SortAsc,
  SortDesc,
  X,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import PaginationApi from "@/components/PaginationApi";
import { Input } from "@/components/ui/input";
import { Link, usePathname, useRouter } from "@/navigation";
import { Button } from "@/components/ui/button";
import PostApi from "@/types/postApi";
import Post from "@/types/post";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogContent,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import TableApi from "@/components/TableApi";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "@/components/ui/use-toast";
import useApiQuery from "@/lib/useApiQuery";
import useApiMutation from "@/lib/useApiMutation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Info() {
  const t = useTranslations("posts");
  const tSend = useTranslations("sendmessage");
  const tName = useTranslations("names");

  // State for pagination and search
  const [page, setPage] = useState(1);
  const [scheduledPage, setScheduledPage] = useState(1);
  const [search, setSearch] = useState("");
  const [scheduledSearch, setScheduledSearch] = useState("");
  const [activeTab, setActiveTab] = useState("sent");

  // Filters and sorting
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [recipientFilter, setRecipientFilter] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<string>("newest");

  // Scheduled tab filters
  const [scheduledPriorityFilter, setScheduledPriorityFilter] =
    useState<string>("");
  const [scheduledRecipientFilter, setScheduledRecipientFilter] =
    useState<string>("");
  const [scheduledSortOrder, setScheduledSortOrder] =
    useState<string>("delivery_asc");

  // Build query parameters
  const buildQueryParams = (
    baseParams: { page: number; text: string },
    filters: {
      priority?: string;
      recipient?: string;
      sort?: string;
    }
  ) => {
    const params = new URLSearchParams();
    params.set("page", baseParams.page.toString());
    if (baseParams.text) params.set("text", baseParams.text);
    if (filters.priority) params.set("priority", filters.priority);
    if (filters.recipient) params.set("recipient_type", filters.recipient);
    if (filters.sort) params.set("sort", filters.sort);
    return params.toString();
  };

  const { data } = useApiQuery<PostApi>(
    `post/list?${buildQueryParams(
      { page, text: search },
      {
        priority: priorityFilter,
        recipient: recipientFilter,
        sort: sortOrder,
      }
    )}`,
    ["posts", page, search, priorityFilter, recipientFilter, sortOrder]
  );

  const { data: scheduledData } = useApiQuery<PostApi>(
    `post/scheduled?${buildQueryParams(
      { page: scheduledPage, text: scheduledSearch },
      {
        priority: scheduledPriorityFilter,
        recipient: scheduledRecipientFilter,
        sort: scheduledSortOrder,
      }
    )}`,
    [
      "scheduled-posts",
      scheduledPage,
      scheduledSearch,
      scheduledPriorityFilter,
      scheduledRecipientFilter,
      scheduledSortOrder,
    ]
  );

  const pathName = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [postId, setPostId] = useState<number | null>(null);
  const [deletingRows, setDeletingRows] = useState<number[]>([]);

  const { mutate } = useApiMutation<{ message: string }>(
    `post/${postId}`,
    "DELETE",
    ["deletePost"],
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["posts"] });
        queryClient.invalidateQueries({ queryKey: ["scheduled-posts"] });

        setTimeout(() => {
          setDeletingRows((current) => current.filter((id) => id !== postId));
        }, 500);

        toast({
          title: t("postDeleted"),
          description: data?.message,
          variant: "destructive",
        });
      },
    }
  );

  // Clear all filters
  const clearFilters = (isScheduled = false) => {
    if (isScheduled) {
      setScheduledPriorityFilter("");
      setScheduledRecipientFilter("");
      setScheduledSortOrder("delivery_asc");
      setScheduledPage(1);
    } else {
      setPriorityFilter("");
      setRecipientFilter("");
      setSortOrder("newest");
      setPage(1);
    }
  };

  // Function to get priority color and styling based on priority level
  const getPriorityBadge = (priority: string) => {
    const priorityLower = priority.toLowerCase();
    if (priorityLower.includes("high")) {
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200 whitespace-nowrap"
        >
          <AlertCircle className="h-3.5 w-3.5 mr-1" /> {priority}
        </Badge>
      );
    } else if (priorityLower.includes("medium")) {
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap"
        >
          <Clock className="h-3.5 w-3.5 mr-1" /> {priority}
        </Badge>
      );
    } else if (priorityLower.includes("low")) {
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200 whitespace-nowrap"
        >
          <Eye className="h-3.5 w-3.5 mr-1" /> {priority}
        </Badge>
      );
    }
    return <Badge variant="outline">{priority}</Badge>;
  };

  // Function to truncate long text
  const truncateText = (text: string, maxLength: number = 60) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  type PostRow = {
    id: number;
    title: string;
    description: string;
    priority: string;
    groups_list?: string[];
    groups_count?: number;
    // ...existing fields...
  };

  function RecipientsCell({ post }: { post: PostRow }) {
    const groups = post.groups_list ?? [];
    const count = post.groups_count ?? 0;

    if (count <= 0) {
      return <span>—</span>;
    }

    const label =
      count === 1
        ? `Sent to ${groups[0]}`
        : `Sent to ${groups[0]} +${count - 1}`;

    return (
      <Tooltip>
        <TooltipTrigger className="cursor-help underline decoration-dotted">
          {label}
        </TooltipTrigger>
        <TooltipContent className="max-w-80">
          <div className="text-xs">
            {groups.map((g) => (
              <div key={g}>• {g}</div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  const postColumns: ColumnDef<Post>[] = [
    {
      accessorKey: "title",
      header: t("postTitle"),
      cell: ({ row }) => (
        <Link
          href={`messages/${row.original.id}`}
          className="font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {row.getValue("title")}
        </Link>
      ),
    },
    {
      accessorKey: "description",
      header: t("Description"),
      cell: ({ row }) => (
        <Link
          href={`messages/${row.original.id}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {truncateText(row.getValue("description") as string)}
        </Link>
      ),
    },
    // NEW: колонка получателей (группы)
    {
      id: "recipients",
      header: "Recipients",
      cell: ({ row }) => {
        const namesStr = (row.original as any).group_names as string | null;
        const names = (namesStr || "")
          .split("||")
          .map((s) => s.trim())
          .filter(Boolean);

        if (!names.length) return null;

        const first = names[0];
        const extra = names.length - 1;

        return (
          <Link
            href={`messages/${row.original.id}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-xs">
              Sent to <span className="font-medium">{first}</span>
              {extra > 0 ? ` +${extra}` : ""}
            </span>
          </Link>
        );
      },
    },
    {
      accessorKey: "admin_name",
      header: t("Admin_name"),
      cell: ({ row }) => (
        <Link
          href={`messages/${row.original.id}`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {tName("name", { ...row?.original?.admin })}
        </Link>
      ),
    },
    {
      accessorKey: "priority",
      header: t("Priority"),
      cell: ({ row }) => {
        const priority = row.getValue("priority") as string;
        return (
          <Link href={`messages/${row.original.id}`}>
            {getPriorityBadge(priority)}
          </Link>
        );
      },
    },
    {
      accessorKey: "read_percent",
      header: t("Read_percent"),
      cell: ({ row }) => {
        const percent = row.getValue("read_percent") as number;
        return (
          <Link
            href={`messages/${row.original.id}`}
            className="flex items-center"
          >
            <div className="w-16 bg-gray-200 rounded-full h-2.5 mr-2 dark:bg-gray-700">
              <div
                className="bg-primary h-2.5 rounded-full"
                style={{ width: `${percent}%` }}
              ></div>
            </div>
            <span className="text-sm">{percent}%</span>
          </Link>
        );
      },
    },
    {
      header: t("action"),
      cell: ({ row }) => (
        <Dialog>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                <EllipsisVertical className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => router.push(`${pathName}/${row.original.id}`)}
                className="gap-2"
              >
                <Eye className="h-4 w-4" />
                {t("view")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  router.push(`${pathName}/edit/${row.original.id}`)
                }
                className="gap-2"
              >
                <Edit className="h-4 w-4" />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                asChild
                className="gap-2 text-red-600 focus:text-red-600"
              >
                <DialogTrigger className="w-full flex items-center">
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t("delete")}
                </DialogTrigger>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="text-lg">
                {row.getValue("title")}
              </DialogTitle>
              <DialogDescription className="mt-2 text-gray-500">
                {truncateText(row.getValue("description") as string, 120)}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-center text-muted-foreground">
                {t("doYouDeleteMessage")}
              </p>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <DialogClose asChild>
                <Button variant="secondary">{t("cancel")}</Button>
              </DialogClose>
              <Button
                type="submit"
                variant="destructive"
                onClick={() => {
                  const id = row.original.id;
                  setPostId(id);
                  setDeletingRows((current) => [...current, id]);
                  mutate({});
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ),
    },
  ];

  // Add column for scheduled delivery time
  const scheduledPostColumns: ColumnDef<Post>[] = [
    ...postColumns.slice(0, postColumns.length - 1),
    {
      id: "recipients",
      header: "Recipients",
      cell: ({ row }) => {
        const namesStr = (row.original as any).group_names as string | null;
        const names = (namesStr || "")
          .split("||")
          .map((s) => s.trim())
          .filter(Boolean);

        if (!names.length) return null;

        const first = names[0];
        const extra = names.length - 1;

        return (
          <Link
            href={`${pathName}/${row.original.id}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="text-xs">
              Sent to <span className="font-medium">{first}</span>
              {extra > 0 ? ` +${extra}` : ""}
            </span>
          </Link>
        );
      },
    },
    {
      accessorKey: "status",
      header: tSend("status"),
      cell: ({ row }) => {
        const status = row.original.status || "scheduled";
        let badge;

        if (status === "delivered") {
          badge = (
            <Badge
              variant="outline"
              className="bg-green-50 text-green-700 border-green-200"
            >
              {tSend("delivered")}
            </Badge>
          );
        } else if (status === "pending") {
          badge = (
            <Badge
              variant="outline"
              className="bg-amber-50 text-amber-700 border-amber-200"
            >
              {tSend("pending")}
            </Badge>
          );
        } else {
          badge = (
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200"
            >
              {tSend("scheduled")}
            </Badge>
          );
        }

        return <Link href={`${pathName}/${row.original.id}`}>{badge}</Link>;
      },
    },
    {
      accessorKey: "delivery_at",
      header: tSend("delivery_at"),
      cell: ({ row }) => {
        if (!row.original.delivery_at) return null;

        try {
          const dateStr = row.original.delivery_at;

          let datePart, timePart;

          if (dateStr.includes("|")) {
            [datePart, timePart] = dateStr.split("|");
          } else if (dateStr.includes(" ")) {
            [datePart, timePart] = dateStr.split(" ");
            const [hour, minute] = timePart.split(":");
            const adjustedHour = (parseInt(hour) - 5 + 24) % 24;
            timePart = `${String(adjustedHour).padStart(2, "0")}:${minute}`;
          } else {
            const cleanStr = dateStr.replace("T", " ").split(".")[0];
            [datePart, timePart] = cleanStr.split(" ");
          }

          const [year, month, day] = datePart.split("-").map(Number);
          const [hour, minute] = timePart.split(":").map(Number);

          const months = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
          ];

          const hour12 = hour % 12 || 12;
          const ampm = hour >= 12 ? "PM" : "AM";

          const formattedDate = `${months[month - 1]} ${day}, ${year}`;
          const formattedTime = `${hour12}:${String(minute).padStart(
            2,
            "0"
          )} ${ampm}`;

          const formatted = (
            <div className="flex flex-col">
              <span>{formattedDate}</span>
              <span className="text-sm font-medium text-primary">
                {formattedTime}
              </span>
            </div>
          );

          return (
            <Link
              href={`${pathName}/${row.original.id}`}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {formatted}
            </Link>
          );
        } catch (error) {
          return row.original.delivery_at;
        }
      },
    },
    postColumns[postColumns.length - 1],
  ];

  // Filter component
  const FilterSection = ({
    isScheduled = false,
  }: {
    isScheduled?: boolean;
  }) => {
    const currentPriorityFilter = isScheduled
      ? scheduledPriorityFilter
      : priorityFilter;
    const currentRecipientFilter = isScheduled
      ? scheduledRecipientFilter
      : recipientFilter;
    const currentSortOrder = isScheduled ? scheduledSortOrder : sortOrder;

    const setPriorityFilterFn = isScheduled
      ? setScheduledPriorityFilter
      : setPriorityFilter;
    const setRecipientFilterFn = isScheduled
      ? setScheduledRecipientFilter
      : setRecipientFilter;
    const setSortOrderFn = isScheduled ? setScheduledSortOrder : setSortOrder;
    const setPageFn = isScheduled ? setScheduledPage : setPage;

    const hasActiveFilters =
      currentPriorityFilter ||
      currentRecipientFilter ||
      (isScheduled
        ? currentSortOrder !== "delivery_asc"
        : currentSortOrder !== "newest");

    return (
      <div className="flex flex-wrap gap-3 items-center">
        {/* Priority Filter */}
        <Select
          value={currentPriorityFilter}
          onValueChange={(value) => {
            setPriorityFilterFn(value === "all" ? "" : value);
            setPageFn(1);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t("priority")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPriorities")}</SelectItem>
            <SelectItem value="high">{t("high")}</SelectItem>
            <SelectItem value="medium">{t("medium")}</SelectItem>
            <SelectItem value="low">{t("low")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Recipient Type Filter (rename placeholder to avoid confusion) */}
        <Select
          value={currentRecipientFilter}
          onValueChange={(value) => {
            setRecipientFilterFn(value === "all" ? "" : value);
            setPageFn(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("recipientType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allRecipients")}</SelectItem>
            <SelectItem value="students">{t("students")}</SelectItem>
            <SelectItem value="groups">{t("groups")}</SelectItem>
            <SelectItem value="parents">{t("parents")}</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Order */}
        <Select
          value={currentSortOrder}
          onValueChange={(value) => {
            setSortOrderFn(value);
            setPageFn(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("sortBy")} />
          </SelectTrigger>
          <SelectContent>
            {isScheduled ? (
              <>
                <SelectItem value="delivery_asc">
                  <div className="flex items-center gap-2">
                    <SortAsc className="h-4 w-4" />
                    {t("deliveryEarliest")}
                  </div>
                </SelectItem>
                <SelectItem value="delivery_desc">
                  <div className="flex items-center gap-2">
                    <SortDesc className="h-4 w-4" />
                    {t("deliveryLatest")}
                  </div>
                </SelectItem>
                <SelectItem value="newest">
                  <div className="flex items-center gap-2">
                    <SortDesc className="h-4 w-4" />
                    {t("newest")}
                  </div>
                </SelectItem>
                <SelectItem value="oldest">
                  <div className="flex items-center gap-2">
                    <SortAsc className="h-4 w-4" />
                    {t("oldest")}
                  </div>
                </SelectItem>
                <SelectItem value="title_asc">
                  <div className="flex items-center gap-2">
                    <SortAsc className="h-4 w-4" />
                    {t("titleAZ")}
                  </div>
                </SelectItem>
                <SelectItem value="title_desc">
                  <div className="flex items-center gap-2">
                    <SortDesc className="h-4 w-4" />
                    {t("titleZA")}
                  </div>
                </SelectItem>
              </>
            ) : (
              <>
                <SelectItem value="newest">
                  <div className="flex items-center gap-2">
                    <SortDesc className="h-4 w-4" />
                    {t("newest")}
                  </div>
                </SelectItem>
                <SelectItem value="oldest">
                  <div className="flex items-center gap-2">
                    <SortAsc className="h-4 w-4" />
                    {t("oldest")}
                  </div>
                </SelectItem>
                <SelectItem value="title_asc">
                  <div className="flex items-center gap-2">
                    <SortAsc className="h-4 w-4" />
                    {t("titleAZ")}
                  </div>
                </SelectItem>
                <SelectItem value="title_desc">
                  <div className="flex items-center gap-2">
                    <SortDesc className="h-4 w-4" />
                    {t("titleZA")}
                  </div>
                </SelectItem>
              </>
            )}
          </SelectContent>
        </Select>

        {/* Clear Filters Button */}
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => clearFilters(isScheduled)}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            {t("clearFilters")}
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">{t("posts")}</h1>
        </div>
        <div className="flex items-center space-x-3">
          <Link href={`${pathName}/create`} passHref>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              {t("createpost")}
            </Button>
          </Link>
          <Link href={`${pathName}/drafts`} passHref>
            <Button variant="outline" className="gap-2">
              <Save className="h-4 w-4" />
              {tSend("viewDrafts")}
            </Button>
          </Link>
        </div>
      </div>

      <Tabs
        defaultValue="sent"
        value={activeTab}
        onValueChange={(value) => setActiveTab(value)}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="sent">{t("posts")}</TabsTrigger>
          <TabsTrigger value="scheduled">
            {tSend("scheduledMessages")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sent" className="mt-0">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("filter")}
                      onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>
                  <PaginationApi
                    data={data?.pagination ?? null}
                    setPage={setPage}
                  />
                </div>

                {/* Filters Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {t("filters")}
                    </span>
                  </div>
                  <FilterSection isScheduled={false} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TableApi
                data={data?.posts ?? null}
                columns={postColumns}
                deletingRows={deletingRows}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scheduled" className="mt-0">
          <Card className="border shadow-sm">
            <CardHeader className="pb-3 border-b">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("filter")}
                      onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
                        setScheduledSearch(e.target.value);
                        setScheduledPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>
                  <PaginationApi
                    data={scheduledData?.pagination ?? null}
                    setPage={setScheduledPage}
                  />
                </div>

                {/* Filters Section */}
                <div className="border-t pt-4">
                  <div className="flex items-center gap-3 mb-3">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      {t("filters")}
                    </span>
                  </div>
                  <FilterSection isScheduled={true} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TableApi
                data={scheduledData?.posts ?? null}
                columns={scheduledPostColumns}
                deletingRows={deletingRows}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
