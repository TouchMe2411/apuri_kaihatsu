"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import Group from "@/types/group";
import { GroupTable } from "@/components/GroupTable";
import Student from "@/types/student";
import { StudentTable } from "@/components/StudentTable";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "@/navigation";
import { useSearchParams } from "next/navigation";
import { useMakeZodI18nMap } from "@/lib/zodIntl";
import { toast } from "@/components/ui/use-toast";
import useApiMutation from "@/lib/useApiMutation";
import useApiQuery from "@/lib/useApiQuery";
import GroupApi from "@/types/groupApi";
import Post from "@/types/post";
import {
  AlertCircle,
  ArrowLeft,
  Save,
  Send,
  Users,
  UserRound,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { saveDraft, getDraft, formToDraft, clearFormData } from "@/lib/drafts";
import { Alert, AlertDescription, AlertActions } from "@/components/ui/alert";
import GroupHierarchyDisplay from "@/components/GroupHierarchyDisplay";

const formSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["high", "medium", "low"]),
  is_scheduled: z.boolean().default(false),
  delivery_date: z.date().optional(),
  delivery_time: z.string().optional(),
});

// Собираем Map<parentId, childIds[]>
function buildChildrenIdMap(groups: Group[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  groups.forEach((g) => {
    g.parent_groups?.forEach((p) => {
      const arr = map.get(p.id) || [];
      arr.push(g.id);
      map.set(p.id, arr);
    });
  });
  return map;
}

// Все потомки (включая детей детей)
function collectDescendantIds(rootId: number, map: Map<number, number[]>) {
  const acc = new Set<number>();
  const stack = Array.from(map.get(rootId) || []);
  while (stack.length) {
    const id = stack.pop()!;
    if (acc.has(id)) continue;
    acc.add(id);
    const kids = map.get(id) || [];
    for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
  }
  return acc;
}

export default function SendMessagePage() {
  const zodErrors = useMakeZodI18nMap();
  z.setErrorMap(zodErrors);
  const t = useTranslations("sendmessage");
  const tName = useTranslations("names");
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Group[]>([]);
  // NEW: явные исключения пользователя (снятые галочки у потомков)
  const [excludedGroupIds, setExcludedGroupIds] = useState<number[]>([]);
  const [studentsWithoutParents, setStudentsWithoutParents] = useState<any[]>(
    []
  );
  const [showParentsError, setShowParentsError] = useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "low",
      is_scheduled: false,
      delivery_date: undefined,
      delivery_time: undefined,
    },
  });
  const formValues = useWatch({ control: form.control });
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftId = searchParams.get("draft");
  const { mutate, isPending } = useApiMutation<{ post: Post }>(
    `post/create`,
    "POST",
    ["sendMessage"],
    {
      onSuccess: (data) => {
        toast({
          title: formValues.is_scheduled
            ? t("messageScheduled")
            : t("messageSent"),
          description: data.post.title,
        });
        form.reset();
        setSelectedStudents([]);
        setSelectedGroups([]);
        setStudentsWithoutParents([]);
        setShowParentsError(false);
        clearFormData();
        router.push("/messages");
      },
      onError: (error: any) => {
        if (
          error.code === "STUDENTS_WITHOUT_PARENTS" ||
          error.code === "GROUP_STUDENTS_WITHOUT_PARENTS"
        ) {
          setStudentsWithoutParents(error.students || []);
          setShowParentsError(true);

          // Переводим сообщение об ошибке
          const locale =
            typeof window !== "undefined"
              ? window.location.pathname.split("/")[1]
              : "en";
          const translatedMessage = translateErrorMessage(
            error.message,
            locale
          );

          toast({
            title: t("cannotSendMessage"),
            description: translatedMessage,
            variant: "destructive",
          });
        } else {
          toast({
            title: t("error"),
            description: error.message || t("unexpectedError"),
            variant: "destructive",
          });
        }
      },
    }
  );

  useEffect(() => {
    if (draftId) {
      const draft = getDraft(draftId);
      if (draft) {
        form.setValue("title", draft.title);
        form.setValue("description", draft.description);
        form.setValue("priority", draft.priority);
        form.setValue("is_scheduled", draft.is_scheduled);
        if (draft.delivery_date) {
          form.setValue("delivery_date", new Date(draft.delivery_date));
        }
        form.setValue("delivery_time", draft.delivery_time);

        setSelectedStudents(draft.students);
        setSelectedGroups(draft.groups);

        toast({
          title: t("draftLoaded"),
          description: draft.title,
        });
      }
    } else {
      const savedFormData = localStorage.getItem("formData");
      const parsedFormData = savedFormData && JSON.parse(savedFormData);
      if (parsedFormData) {
        form.setValue("title", parsedFormData.title);
        form.setValue("description", parsedFormData.description);
        form.setValue("priority", parsedFormData.priority);
        form.setValue("is_scheduled", parsedFormData.is_scheduled || false);
        if (parsedFormData.delivery_date) {
          form.setValue(
            "delivery_date",
            new Date(parsedFormData.delivery_date)
          );
        }
        form.setValue("delivery_time", parsedFormData.delivery_time);
      }
    }

    const subscription = form.watch((values) => {
      localStorage.setItem("formData", JSON.stringify(values));
    });
    return () => subscription.unsubscribe();
  }, [form, draftId, t]);

  const handleSaveDraft = () => {
    const draftData = formToDraft(formValues, selectedStudents, selectedGroups);
    const draft = {
      ...draftData,
      id: draftId || undefined,
    };

    const savedDraft = saveDraft(draft);

    toast({
      title: t("draftSaved"),
      description: formValues.title || t("untitledDraft"),
    });

    if (!draftId) {
      router.replace(`/messages/create?draft=${savedDraft.id}`);
    }
  };

  // Helper function to get priority color
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800 hover:bg-red-200";
      case "medium":
        return "bg-amber-100 text-amber-800 hover:bg-amber-200";
      case "low":
        return "bg-green-100 text-green-800 hover:bg-green-200";
      default:
        return "bg-slate-100 text-slate-800 hover:bg-slate-200";
    }
  };

  // Remove a student from selection
  const removeStudent = (studentId: number) => {
    setSelectedStudents((prev) =>
      prev.filter((student) => student.id !== studentId)
    );
  };

  // Remove a group from selection
  const removeGroup = (groupId: number) => {
    setSelectedGroups((prev) => prev.filter((group) => group.id !== groupId));
  };

  // Function to remove students without parents
  const removeStudentsWithoutParents = () => {
    const studentIdsToRemove = studentsWithoutParents.map((s) => s.id);
    setSelectedStudents((prev) =>
      prev.filter((student) => !studentIdsToRemove.includes(student.id))
    );
    setStudentsWithoutParents([]);
    setShowParentsError(false);

    toast({
      title: t("studentsRemoved"),
      description: t("studentsWithoutParentsRemoved"),
    });
  };

  // Добавьте функцию перевода ошибок
  const translateErrorMessage = (message: string, locale: string): string => {
    // Проверяем, содержит ли сообщение русский текст о родителях
    if (message.includes("не зарегистрированы в parents")) {
      const studentPart = message.split("parents: ")[1] || "";

      const translations = {
        en: `The following students are not registered with parents: ${studentPart}`,
        ru: message, // Оставляем как есть
        ja: `次の学生は保護者に登録されていません: ${studentPart}`,
        uz: `Quyidagi talabalar ota-onalar bilan ro'yxatdan o'tmagan: ${studentPart}`,
      };

      return (
        translations[locale as keyof typeof translations] || translations.en
      );
    }

    return message;
  };

  // Подтягиваем все группы (для построения иерархии)
  const { data: allGroupsResp } = useApiQuery<GroupApi>(
    `group/list?page=1&name=`,
    ["all-groups-for-message"]
  );
  const allGroups = useMemo(
    () => allGroupsResp?.groups ?? [],
    [allGroupsResp?.groups]
  );
  const childrenIdMap = useMemo(
    () => buildChildrenIdMap(allGroups),
    [allGroups]
  );

  // Слежение за добавлением новых родительских id
  const prevSelectedIdsRef = React.useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!allGroups.length) return;

    const currentIds = new Set<number>(selectedGroups.map((g) => g.id));
    const prevIds = prevSelectedIdsRef.current;

    // какие id добавили и какие убрали с прошлого раза
    const addedIds = Array.from(currentIds).filter((id) => !prevIds.has(id));
    const removedIds = Array.from(prevIds).filter((id) => !currentIds.has(id));

    // Помечаем явно снятые пункты как исключённые
    if (removedIds.length) {
      setExcludedGroupIds((prev) => {
        const set = new Set(prev);
        removedIds.forEach((id) => set.add(id));
        return Array.from(set);
      });
    }
    // Если пункт добавили обратно — убираем исключение
    if (addedIds.length) {
      setExcludedGroupIds((prev) =>
        prev.filter((id) => !addedIds.includes(id))
      );
    }

    // собрать всех потомков для добавленных родителей
    const toAdd = new Set<number>();
    addedIds.forEach((id) => {
      const descendants = collectDescendantIds(id, childrenIdMap);
      descendants.forEach((d) => {
        // не добавляем, если пользователь исключил этот id
        if (!currentIds.has(d) && !excludedGroupIds.includes(d)) {
          toAdd.add(d);
        }
      });
    });

    if (toAdd.size === 0) {
      prevSelectedIdsRef.current = currentIds;
      return;
    }

    // добавить недостающие группы в выбранные
    const extraGroups = Array.from(toAdd)
      .map((id) => allGroups.find((g) => g.id === id))
      .filter(Boolean) as Group[];

    setSelectedGroups((prev) => {
      const have = new Set(prev.map((g) => g.id));
      const next = prev.slice();
      extraGroups.forEach((g) => {
        if (!have.has(g.id)) next.push(g);
      });
      return next;
    });

    // запомнить текущее состояние + auto-added
    prevSelectedIdsRef.current = new Set<number>(
      Array.from(currentIds).concat(Array.from(toAdd))
    );
  }, [selectedGroups, allGroups, childrenIdMap, excludedGroupIds]);

  return (
    <div className="w-full h-full bg-gradient-to-br from-background to-muted/20">
      <Card className="shadow-xl border border-border/50 rounded-2xl h-full backdrop-blur-sm bg-card/95">
        <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 border-b border-border/50 rounded-t-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <Link href="/messages" passHref>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl hover:bg-primary/10 transition-all duration-200"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div>
                <CardTitle className="text-2xl font-semibold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  {t("sendMessage")}
                </CardTitle>
                <CardDescription className="text-base text-muted-foreground mt-1">
                  {t("createNewMessage")}
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-3">
              <Link href="/messages/drafts" passHref>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl border-primary/20 hover:bg-primary/5 transition-all duration-200"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {t("viewDrafts")}
                </Button>
              </Link>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                className="rounded-xl border-primary/20 hover:bg-primary/5 transition-all duration-200 gap-2"
              >
                <Save className="h-4 w-4" />
                {t("saveDraft")}
              </Button>
            </div>
          </div>
        </CardHeader>{" "}
        <CardContent className="pt-8 px-8">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => {
                setShowParentsError(false);
                setStudentsWithoutParents([]);

                if (
                  data.is_scheduled &&
                  data.delivery_date &&
                  data.delivery_time
                ) {
                  // Get raw input values
                  const [hours, minutes] = data.delivery_time
                    .split(":")
                    .map(Number);
                  const deliveryDate = new Date(data.delivery_date);

                  // Create a string representation of the exact time the user selected
                  // Format: YYYY-MM-DD|HH:MM - using pipe symbol to store raw values
                  const year = deliveryDate.getFullYear();
                  const month = deliveryDate.getMonth() + 1;
                  const day = deliveryDate.getDate();

                  // Store the exact time values as entered by the user without any adjustments
                  const userSelectedTime = `${year}-${String(month).padStart(
                    2,
                    "0"
                  )}-${String(day).padStart(2, "0")}|${String(hours).padStart(
                    2,
                    "0"
                  )}:${String(minutes).padStart(2, "0")}`;

                  mutate({
                    ...data,
                    delivery_at: userSelectedTime,
                    students: selectedStudents.map((student) => student.id),
                    groups: selectedGroups.map((group) => group.id),
                    excluded_groups: excludedGroupIds,
                  } as any);
                } else {
                  mutate({
                    ...data,
                    students: selectedStudents.map((student) => student.id),
                    groups: selectedGroups.map((group) => group.id),
                    excluded_groups: excludedGroupIds,
                  } as any);
                }
              })}
              ref={formRef}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-6 bg-gradient-to-b from-primary to-primary/50 rounded-full"></div>
                    <h3 className="text-xl font-semibold text-foreground">
                      {t("messageDetails")}
                    </h3>
                  </div>

                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field, formState }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-base font-medium">
                          {t("title")}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t("typeTitle")}
                            className="w-full h-12 rounded-xl border-primary/20 focus:border-primary/50 transition-all duration-200"
                          />
                        </FormControl>
                        <FormMessage>
                          {formState.errors.title && t("titleRequired")}
                        </FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field, formState }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-base font-medium">
                          {t("description")}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder={t("typeMessage")}
                            className="min-h-[140px] rounded-xl border-primary/20 focus:border-primary/50 transition-all duration-200 resize-none"
                          />
                        </FormControl>
                        <FormMessage>
                          {formState.errors.description && t("messageRequired")}
                        </FormMessage>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem className="space-y-3">
                        <FormLabel className="text-base font-medium">
                          {t("priority")}
                        </FormLabel>
                        <FormControl>
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger className="w-full h-12 rounded-xl border-primary/20 focus:border-primary/50 transition-all duration-200">
                              <SelectValue placeholder={t("selectPriority")} />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectGroup>
                                <SelectLabel className="text-sm font-medium">
                                  {t("choosePriority")}
                                </SelectLabel>
                                <SelectItem value="high" className="rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                    {t("high")}
                                  </div>
                                </SelectItem>
                                <SelectItem
                                  value="medium"
                                  className="rounded-lg"
                                >
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                                    {t("medium")}
                                  </div>
                                </SelectItem>
                                <SelectItem value="low" className="rounded-lg">
                                  <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    {t("low")}
                                  </div>
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>{" "}
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3">
                    <h3 className="text-lg font-medium">
                      {t("scheduleDelivery")}
                    </h3>

                    <FormField
                      control={form.control}
                      name="is_scheduled"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              {t("scheduleForLater")}
                            </FormLabel>
                            <FormDescription>
                              {t("scheduleDescription")}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {formValues.is_scheduled && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="delivery_date"
                          render={({ field }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="text-base mb-2">
                                {t("deliveryDate")}
                              </FormLabel>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <FormControl>
                                    <Button
                                      variant={"outline"}
                                      className={cn(
                                        "w-full pl-3 text-left font-normal",
                                        !field.value && "text-muted-foreground"
                                      )}
                                    >
                                      {field.value ? (
                                        format(field.value, "PPP")
                                      ) : (
                                        <span>{t("selectDate")}</span>
                                      )}
                                      <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                  </FormControl>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-auto p-0"
                                  align="start"
                                >
                                  <CalendarComponent
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    disabled={(date) => {
                                      const today = new Date();
                                      today.setHours(0, 0, 0, 0);
                                      const d = new Date(date);
                                      d.setHours(0, 0, 0, 0);
                                      // Compare using < so that the current day is selectable
                                      return d.getTime() < today.getTime();
                                    }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="delivery_time"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-base">
                                {t("deliveryTime")}
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="time"
                                  {...field}
                                  className="w-full"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />{" "}
                      </div>
                    )}
                  </div>
                </div>{" "}
                <div className="space-y-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-1 h-6 bg-gradient-to-b from-secondary to-secondary/50 rounded-full"></div>
                    <h3 className="text-xl font-semibold text-foreground">
                      {t("recipients")}
                    </h3>
                  </div>

                  {selectedGroups.length > 0 && (
                    <GroupHierarchyDisplay selectedGroups={selectedGroups} />
                  )}

                  <div className="space-y-4">
                    {selectedGroups.length > 0 && (
                      <div className="w-full">
                        <span className="text-sm font-medium flex items-center gap-2 mb-3">
                          <Users className="h-4 w-4 text-primary" />
                          <span className="text-foreground">
                            {t("selectedGroups")}
                          </span>
                          <Badge
                            variant="secondary"
                            className="ml-1 px-2 py-0.5 text-xs"
                          >
                            {selectedGroups.length}
                          </Badge>
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {selectedGroups.map((group) => (
                            <Badge
                              key={group.id}
                              variant="secondary"
                              className="text-sm px-3 py-2 flex items-center gap-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/15 transition-colors"
                            >
                              <span className="truncate max-w-[150px] font-medium">
                                {group?.name}
                              </span>
                              <button
                                onClick={() => removeGroup(group.id)}
                                className="ml-1 hover:text-red-500 transition-colors rounded-full p-0.5 hover:bg-red-100 dark:hover:bg-red-900"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedStudents.length > 0 && (
                      <div className="w-full mt-4">
                        <span className="text-sm font-medium flex items-center gap-2 mb-3">
                          <UserRound className="h-4 w-4 text-primary" />
                          <span className="text-foreground">
                            {t("students")}
                          </span>
                          <Badge
                            variant="secondary"
                            className="ml-1 px-2 py-0.5 text-xs"
                          >
                            {selectedStudents.length}
                          </Badge>
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {selectedStudents.map((student) => (
                            <Badge
                              key={student.id}
                              variant="secondary"
                              className="text-sm px-3 py-2 flex items-center gap-2 rounded-lg bg-secondary/80 hover:bg-secondary transition-colors"
                            >
                              <span className="truncate max-w-[150px] font-medium">
                                {tName("name", { ...student, parents: "" })}
                              </span>
                              <button
                                onClick={() => removeStudent(student.id)}
                                className="ml-1 hover:text-red-500 transition-colors rounded-full p-0.5 hover:bg-red-100 dark:hover:bg-red-900"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-gradient-to-br from-card to-muted/20 border border-border/50 rounded-xl overflow-hidden mt-6 shadow-sm backdrop-blur-sm">
                      <Tabs defaultValue="group">
                        <TabsList className="grid w-full grid-cols-2 bg-muted/30 dark:bg-muted/50 rounded-none border-b border-border/50">
                          <TabsTrigger
                            value="group"
                            className="rounded-none py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                          >
                            <Users className="h-4 w-4 mr-2" />
                            {t("groups")}
                          </TabsTrigger>
                          <TabsTrigger
                            value="student"
                            className="rounded-none py-3 data-[state=active]:bg-background data-[state=active]:shadow-sm"
                          >
                            <UserRound className="h-4 w-4 mr-2" />
                            {t("students")}
                          </TabsTrigger>
                        </TabsList>
                        <div className="h-[350px] overflow-y-auto">
                          <TabsContent value="group" className="m-0 p-0 h-full">
                            <GroupTable
                              selectedGroups={selectedGroups}
                              setSelectedGroups={setSelectedGroups}
                            />
                          </TabsContent>
                          <TabsContent
                            value="student"
                            className="m-0 p-0 h-full"
                          >
                            <StudentTable
                              selectedStudents={selectedStudents}
                              setSelectedStudents={setSelectedStudents}
                            />
                          </TabsContent>
                        </div>
                      </Tabs>
                    </div>
                  </div>
                </div>
              </div>{" "}
              {selectedGroups.length === 0 && selectedStudents.length === 0 && (
                <div className="flex items-center bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 p-4 rounded-xl text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-sm">
                  <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <span className="text-base font-medium">
                    {t("noRecipientsWarning")}
                  </span>
                </div>
              )}
              <Separator className="my-8" />
              <div className="flex justify-between items-center pt-4">
                <Link href="/messages" passHref>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="rounded-xl px-6 hover:bg-muted/50 transition-all duration-200"
                  >
                    {t("cancel")}
                  </Button>
                </Link>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      size="lg"
                      disabled={
                        isPending ||
                        (selectedGroups.length === 0 &&
                          selectedStudents.length === 0) ||
                        showParentsError
                      }
                      className={`
      /* enabled state */
      text-gray-700 gap-3 px-8 rounded-xl
  bg-gradient-to-r from-primary to-primary/90
  hover:from-primary/90 hover:to-primary/80
  transition-all duration-200 shadow-md hover:shadow-lg

      /* disabled state */
      disabled:bg-muted disabled:bg-none
  disabled:text-gray-700 dark:disabled:text-gray-200
  disabled:shadow-none
  disabled:cursor-not-allowed
  disabled:opacity-90
    `}
                    >
                      <Send className="h-5 w-5" />
                      {isPending ? `${t("sendMessage")}...` : t("sendMessage")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[700px]">
                    <DialogHeader>
                      <DialogTitle className="text-xl">
                        {t("preview")}
                      </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-5 py-4">
                      <div className="space-y-3">
                        <h3 className="text-xl font-medium">
                          {formValues.title}
                        </h3>
                        <p className="text-base whitespace-pre-wrap">
                          {formValues.description}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 mt-4">
                        <Badge
                          className={`text-base px-3 py-1 ${getPriorityColor(
                            String(formValues.priority || "low")
                          )}`}
                        >
                          {t("priority")}:{" "}
                          {formValues.priority
                            ? t(String(formValues.priority))
                            : t("low")}
                        </Badge>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {selectedGroups.length > 0 && (
                          <div>
                            <h4 className="text-base font-medium mb-3 flex items-center gap-1">
                              <Users className="h-5 w-5" /> {t("groups")} (
                              {selectedGroups.length})
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedGroups.map((group) => (
                                <Badge
                                  key={group.id}
                                  variant="secondary"
                                  className="text-sm px-2 py-1"
                                >
                                  {group?.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedStudents.length > 0 && (
                          <div>
                            <h4 className="text-base font-medium mb-3 flex items-center gap-1">
                              <UserRound className="h-5 w-5" /> {t("students")}{" "}
                              ({selectedStudents.length})
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {selectedStudents.map((student) => (
                                <Badge
                                  key={student.id}
                                  variant="secondary"
                                  className="text-sm px-2 py-1"
                                >
                                  {tName("name", { ...student, parents: "" })}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                      <DialogClose asChild>
                        <Button type="button" variant="outline" size="lg">
                          {t("edit")}
                        </Button>
                      </DialogClose>
                      <DialogClose asChild>
                        <Button
                          size="lg"
                          onClick={() => {
                            if (formRef.current) {
                              formRef.current.dispatchEvent(
                                new Event("submit", { bubbles: true })
                              );
                            }
                          }}
                          className="gap-2"
                        >
                          <Send className="h-5 w-5" />
                          {t("confirm")}
                        </Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Error Alert for Students Without Parents */}
      {showParentsError && studentsWithoutParents.length > 0 && (
        <Alert
          variant="destructive"
          className="border-red-200 bg-red-50 dark:bg-red-950/50"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="font-medium">
              {t("studentsNotRegisteredInParents")}
            </div>
            <div className="text-sm">
              {studentsWithoutParents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between py-1"
                >
                  <span>
                    {student.given_name} {student.family_name}
                    {student.student_number && ` (${student.student_number})`}
                    {student.group_name && ` - ${student.group_name}`}
                  </span>
                </div>
              ))}
            </div>
            <AlertActions>
              <div className="flex gap-2 mt-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={removeStudentsWithoutParents}
                  className="bg-white text-red-600 hover:bg-red-50 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-red-900"
                >
                  {t("removeTheseStudents")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowParentsError(false);
                    setStudentsWithoutParents([]);
                  }}
                  className="bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {t("cancel")}
                </Button>

                {/* Новая кнопка: перейти на страницу Родители */}
                <Link href="/parents" passHref>
                  <Button
                    asChild
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-white text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    {t("goToParents")}
                  </Button>
                </Link>
              </div>
            </AlertActions>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
