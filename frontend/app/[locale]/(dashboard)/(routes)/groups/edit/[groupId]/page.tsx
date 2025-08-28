"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudentTable } from "@/components/StudentTable";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Student from "@/types/student";
import { useMakeZodI18nMap } from "@/lib/zodIntl";
import { Link, useRouter } from "@/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import NotFound from "@/components/NotFound";
import useApiQuery from "@/lib/useApiQuery";
import useApiMutation from "@/lib/useApiMutation";
import { Users, ArrowLeft, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const formSchema = z.object({
  name: z.string().min(1),
});

export default function EditGroup({
  params: { groupId },
}: {
  params: { groupId: string };
}) {
  const zodErrors = useMakeZodI18nMap();
  z.setErrorMap(zodErrors);
  const t = useTranslations("CreateGroup");
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
    },
  });

  // Данные группы
  const { data, isLoading, isError } = useApiQuery<{
    group: {
      name: string;
      parent_group_id?: number | null;
      parent_group_ids?: number[];
    };
    members: Student[];
    parent_groups?: Array<{ id: number; name: string }>;
    child_groups?: Array<{ id: number; name: string }>;
  }>(`group/${groupId}`, ["group", groupId]);

  const { isPending, mutate } = useApiMutation<{ message: string }>(
    `group/${groupId}`,
    "PUT",
    ["editGroup"],
    {
      onSuccess: (data) => {
        toast({
          title: t("GroupEdited"),
          description: data.message,
        });

        queryClient.invalidateQueries({ queryKey: ["groups"] });
        queryClient.invalidateQueries({ queryKey: ["group", groupId] });

        form.reset();
        router.push("/groups");
        setSelectedStudents([]);
      },
      onError: () => {
        toast({
          title: "Ошибка",
          description: "Не удалось обновить группу. Попробуйте снова.",
          variant: "destructive",
        });
      },
    }
  );

  useEffect(() => {
    if (data) {
      form.setValue("name", data.group.name);
      if (data.members && Array.isArray(data.members)) {
        setSelectedStudents(data.members);
      }
    }
  }, [data, form]);

  // Отправка формы (без управления иерархией)
  const handleSubmit = (formData: z.infer<typeof formSchema>) => {
    const requestData = {
      name: formData.name,
      students: selectedStudents.map((student) => student.id),
    };
    mutate(requestData as any);
  };

  if (isError) return <NotFound />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            {t("EditGroup")}
          </h1>
          <p className="text-muted-foreground">{t("ChangeGroupSettings")}</p>
        </div>
        <Link href="/groups">
          <Button variant="outline" size="lg">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("back")}
          </Button>
        </Link>
      </div>

      {/* Form */}
      <div className="grid gap-6">
        <Form {...form}>
          <form
            className="space-y-6"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <Card>
              <CardHeader>
                <CardTitle>{t("MainInformation")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field, formState }) => (
                    <FormItem>
                      <FormLabel>{t("GroupName")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder={t("GroupName")}
                          className="text-base"
                        />
                      </FormControl>
                      <FormMessage>
                        {formState.errors.name?.message}
                      </FormMessage>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Текущая иерархия (только просмотр) */}
            {data &&
              ((data.parent_groups && data.parent_groups.length > 0) ||
                (data.child_groups && data.child_groups.length > 0)) && (
                <Card>
                  <CardHeader>
                    <CardTitle>{t("CurrentHierarchy")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {data.parent_groups && data.parent_groups.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-blue-700 mb-2">
                            {t("ParentGroupsDescription")}
                          </h4>
                          <div className="space-y-1 ml-4">
                            {data.parent_groups.map((parent: any) => (
                              <div
                                key={parent.id}
                                className="flex items-center gap-2 text-sm text-blue-600"
                              >
                                <span>├──</span>
                                <Users className="w-3 h-3" />
                                <span>{parent.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg">
                        <span className="text-primary">●</span>
                        <Users className="w-4 h-4 text-primary" />
                        <span className="font-medium text-primary">
                          {data.group?.name || "Unknown group"} (
                          {t("CurrentGroup")})
                        </span>
                      </div>

                      {data.child_groups && data.child_groups.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-green-700 mb-2">
                            {t("CurrentChildGroups")}
                          </h4>
                          <div className="space-y-1 ml-4">
                            {data.child_groups.map((child: any) => (
                              <div
                                key={child.id}
                                className="flex items-center gap-2 text-sm text-green-600"
                              >
                                <span> ├──</span>
                                <Users className="w-3 h-3" />
                                <span>{child.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

            {/* Студенты */}
            <Card>
              <CardHeader>
                <CardTitle>{t("Students")}</CardTitle>
              </CardHeader>
              <CardContent>
                <StudentTable
                  selectedStudents={selectedStudents}
                  setSelectedStudents={setSelectedStudents}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Link href="/groups">
                <Button variant="outline" disabled={isPending}>
                  {t("Cancel")}
                </Button>
              </Link>
              <Button type="submit" disabled={isPending || isLoading} size="lg">
                <Save className="w-4 h-4 mr-2" />
                {isPending ? t("SavingChanges") : t("SaveChanges")}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
