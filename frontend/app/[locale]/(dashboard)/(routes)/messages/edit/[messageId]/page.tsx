"use client";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "@/navigation";
import { useMakeZodI18nMap } from "@/lib/zodIntl";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import NotFound from "@/components/NotFound";
import useApiQuery from "@/lib/useApiQuery";
import Post from "@/types/post";
import useApiMutation from "@/lib/useApiMutation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Pencil, Users, UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GroupTable } from "@/components/GroupTable";
import { StudentTable } from "@/components/StudentTable";
import Group from "@/types/group";
import Student from "@/types/student";
import { PostRecipient } from "@/types/postRecipients";

const formSchema = z.object({
  title: z.string().min(2).max(50),
  description: z.string().max(500), // Убрал ограничение .min(10)
  priority: z.enum(["high", "medium", "low"]),
  delivery_date: z.date().optional(),
  delivery_time: z.string().optional(),
  students: z.array(z.number()).optional(),
  groups: z.array(z.number()).optional(),
});

export default function EditMessagePage({
  params: { messageId },
}: {
  params: { messageId: string };
}) {
  const zodErrors = useMakeZodI18nMap();
  z.setErrorMap(zodErrors);
  const t = useTranslations("sendmessage");
  const tName = useTranslations("names");
  const common = useTranslations("common");
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Group[]>([]);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      description: "",
      priority: "low",
      delivery_date: undefined,
      delivery_time: "",
    },
  });
  const formValues = useWatch({ control: form.control });
  const router = useRouter();
  const { data, isLoading, isError } = useApiQuery<{
    post: Post;
  }>(`post/${messageId}`, ["message", messageId]);

  const { data: recipients, isLoading: recipientsLoading } =
    useApiQuery<PostRecipient>(`post/${messageId}/recipients`, [
      "messageRecipients",
      messageId,
    ]);
  const { mutate, isPending } = useApiMutation<{ message: string }>(
    `post/${messageId}`,
    "PUT",
    ["editMessage", messageId],
    {
      onSuccess: (data) => {
        toast({
          title: t("messageEdited"),
          description: data?.message,
        });
        form.reset();
        setSelectedStudents([]);
        setSelectedGroups([]);
        router.push("/messages");
      },
    }
  ); // Исправить useEffect для правильного отображения времени:
  useEffect(() => {
    if (data) {
      form.setValue("title", data.post.title);
      form.setValue("description", data.post.description);
      form.setValue("priority", data.post.priority as any);

      // Правильная обработка delivery_at БЕЗ преобразования часовых поясов
      if (data.post.delivery_at) {
        try {
          let datePart: string;
          let timePart: string;

          if (data.post.delivery_at.includes("T")) {
            // ISO формат: "2025-05-30T14:00:00.000Z"
            const isoDate = data.post.delivery_at.replace("Z", "");
            [datePart, timePart] = isoDate.split("T");
          } else {
            // MySQL формат: "2025-05-30 14:00:00"
            [datePart, timePart] = data.post.delivery_at.split(" ");
          }

          // Создаем дату БЕЗ преобразования часового пояса
          const [year, month, day] = datePart.split("-").map(Number);
          const dateForCalendar = new Date(year, month - 1, day);
          form.setValue("delivery_date", dateForCalendar);

          // Время берем ТОЧНО как сохранено (первые 5 символов HH:MM)
          const timeValue = timePart.substring(0, 5);
          form.setValue("delivery_time", timeValue);
        } catch (error) {
          console.error("Error parsing delivery_at:", error);
        }
      }
    }
  }, [data, form]);

  // Load recipients data
  useEffect(() => {
    if (recipients) {
      // Convert recipients to Student and Group objects
      const students: Student[] = recipients.students.map((s) => ({
        id: s.id,
        given_name: s.given_name,
        family_name: s.family_name,
        student_number: s.student_number,
        school_id: 0, // Will be filled by the backend
        created_at: "",
        updated_at: "",
        email: "",
        phone_number: "",
      }));

      const groups: Group[] = recipients.groups.map((g) => ({
        id: g.id,
        name: g.group_name,
        school_id: 0, // Will be filled by the backend
        created_at: "",
        updated_at: "",
      }));

      setSelectedStudents(students);
      setSelectedGroups(groups);
    }
  }, [recipients]);

  // Helper functions for managing recipients
  const removeStudent = (studentId: number) => {
    setSelectedStudents((prev) => prev.filter((s) => s.id !== studentId));
  };

  const removeGroup = (groupId: number) => {
    setSelectedGroups((prev) => prev.filter((g) => g.id !== groupId));
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

  if (isError) return <NotFound />;

  return (
    <div className="fixed inset-0 bg-background z-50 w-full h-full overflow-auto">
      <Card className="shadow-lg border-0 rounded-none min-h-screen flex flex-col">
        <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Link href="/messages" passHref>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <CardTitle className="text-2xl">{t("editMessage")}</CardTitle>
            </div>
          </div>
          <CardDescription className="text-base">
            Edit existing message
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6 flex-grow">
          <Form {...form}>
            {" "}
            <form
              id="edit-message-form"
              onSubmit={form.handleSubmit((values) => {
                // Format the data for the backend
                const formattedValues = {
                  title: values.title,
                  description: values.description,
                  priority: values.priority,
                  delivery_date: values.delivery_date
                    ? format(values.delivery_date, "yyyy-MM-dd")
                    : undefined,
                  delivery_time: values.delivery_time || undefined,
                  students: selectedStudents.map((s) => s.id),
                  groups: selectedGroups.map((g) => g.id),
                };
                mutate(formattedValues as any);
              })}
              className="space-y-6 flex flex-col h-full"
            >
              <div className="space-y-5 flex-grow">
                <h3 className="text-lg font-medium">{t("messageDetails")}</h3>
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field, formState }) => (
                    <FormItem>
                      <FormLabel className="text-base">{t("title")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t("typeTitle")}
                          className="w-full"
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
                    <FormItem className="flex-grow">
                      <FormLabel className="text-base">
                        {t("yourMessage")}
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          rows={12}
                          placeholder={t("typeMessage")}
                          {...field}
                          className="w-full resize-y min-h-[300px]"
                        />
                      </FormControl>
                      <FormMessage>
                        {formState.errors.description && t("messageRequired")}
                      </FormMessage>
                    </FormItem>
                  )}
                />{" "}
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field, formState }) => (
                    <FormItem>
                      <FormLabel className="text-base">
                        {t("choosePriority")}
                      </FormLabel>
                      <div className="flex gap-3 w-full">
                        <Button
                          type="button"
                          className={`flex-1 ${
                            field.value === "low"
                              ? getPriorityColor("low")
                              : "bg-slate-100 hover:bg-slate-200"
                          }`}
                          variant="outline"
                          onClick={() => form.setValue("priority", "low")}
                        >
                          {t("low")}
                        </Button>
                        <Button
                          type="button"
                          className={`flex-1 ${
                            field.value === "medium"
                              ? getPriorityColor("medium")
                              : "bg-slate-100 hover:bg-slate-200"
                          }`}
                          variant="outline"
                          onClick={() => form.setValue("priority", "medium")}
                        >
                          {t("medium")}
                        </Button>
                        <Button
                          type="button"
                          className={`flex-1 ${
                            field.value === "high"
                              ? getPriorityColor("high")
                              : "bg-slate-100 hover:bg-slate-200"
                          }`}
                          variant="outline"
                          onClick={() => form.setValue("priority", "high")}
                        >
                          {t("high")}
                        </Button>
                      </div>
                      <FormMessage>
                        {formState.errors.priority && t("priorityRequired")}
                      </FormMessage>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="delivery_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-base">
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
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              const d = new Date(date);
                              d.setHours(0, 0, 0, 0);
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
                        <Input type="time" {...field} className="w-full" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Recipients Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">{t("recipients")}</h3>

                  {/* Display selected recipients */}
                  {(selectedGroups.length > 0 ||
                    selectedStudents.length > 0) && (
                    <div className="space-y-4">
                      {selectedGroups.length > 0 && (
                        <div className="w-full">
                          <span className="text-sm font-medium flex items-center gap-2 mb-3">
                            <Users className="h-4 w-4 text-primary" />
                            <span className="text-foreground">
                              {t("groups")}
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
                        <div className="w-full">
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
                    </div>
                  )}

                  {/* Recipient selection tabs */}
                  <div className="bg-gradient-to-br from-card to-muted/20 border border-border/50 rounded-xl overflow-hidden shadow-sm backdrop-blur-sm">
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
                      <div className="h-[300px] overflow-y-auto">
                        <TabsContent value="group" className="m-0 p-0 h-full">
                          <GroupTable
                            selectedGroups={selectedGroups}
                            setSelectedGroups={setSelectedGroups}
                          />
                        </TabsContent>
                        <TabsContent value="student" className="m-0 p-0 h-full">
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

              <Separator />

              <div className="flex justify-between items-center pt-4 pb-6 sticky bottom-0 bg-background">
                <Link href="/messages" passHref>
                  <Button type="button" variant="outline" size="lg">
                    {t("cancel")}
                  </Button>
                </Link>

                <Button
                  type="submit"
                  form="edit-message-form"
                  size="lg"
                  disabled={isPending || isLoading}
                  className="gap-2"
                >
                  <Pencil className="h-5 w-5" />
                  {isPending ? t("saving") : t("saveChanges")}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
