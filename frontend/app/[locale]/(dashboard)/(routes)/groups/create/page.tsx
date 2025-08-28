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
import Student from "@/types/student";
import { useMakeZodI18nMap } from "@/lib/zodIntl";
import { Link, useRouter } from "@/navigation";
import { useEffect, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import useApiMutation from "@/lib/useApiMutation";
import Group from "@/types/group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useApiQuery from "@/lib/useApiQuery";
import GroupApi from "@/types/groupApi";
import { Checkbox } from "@/components/ui/checkbox";

const formSchema = z.object({
  name: z.string().min(1),
  semester: z.string().optional(),
  parent_group_ids: z.array(z.number()).optional(), // Добавить это поле
});

export default function CreateGroup() {
  const zodErrors = useMakeZodI18nMap();
  z.setErrorMap(zodErrors);
  const t = useTranslations("CreateGroup");
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const router = useRouter();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      semester: "",
      parent_group_ids: [],
    },
  });

  const { isPending, mutate } = useApiMutation<{ group: Group }>(
    `group/create`,
    "POST",
    ["createGroup"],
    {
      onSuccess: (data) => {
        toast({
          title: t("GroupCreated"),
          description: data.group.name,
        });
        form.reset();
        router.push("/groups");
        setSelectedStudents([]);
      },
    }
  );

  useEffect(() => {
    const savedFormData = localStorage.getItem("formDataCreateGroup");
    const parsedFormData = savedFormData && JSON.parse(savedFormData);
    if (parsedFormData) {
      form.setValue("name", parsedFormData.name);
      form.setValue("semester", parsedFormData.semester);
    }

    const subscription = form.watch((values) => {
      localStorage.setItem("formDataCreateGroup", JSON.stringify(values));
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Заменить fetchGroups useEffect на useApiQuery:
  const { data: groupsData } = useApiQuery<GroupApi>(
    `group/list?page=1&limit=100`,
    ["availableGroups"]
  );

  useEffect(() => {
    if (groupsData?.groups) {
      // Фильтровать только группы без родителей (могут быть родительскими)
      const availableForParent = groupsData.groups.filter(
        (group: Group) => !group.parent_group_id
      );
      setAvailableGroups(availableForParent);
      console.log("Available groups for parent:", availableForParent);
    }
  }, [groupsData]);

  return (
    <div className="flex flex-col items-center">
      <div className="w-full flex justify-between">
        <h1 className="text-3xl w-2/4 font-bold">{t("CreateGroup")}</h1>
        <Link href={`/groups`} passHref>
          <Button variant={"secondary"}>{t("back")}</Button>
        </Link>
      </div>
      <div className="w-full mt-8">
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={form.handleSubmit((data) =>
              mutate({
                ...data,
                students: selectedStudents.map((student) => student.id),
                parent_group_ids: data.parent_group_ids || [],
              } as any)
            )}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field, formState }) => (
                  <FormItem>
                    <FormLabel>{t("GroupName")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("GroupName")} />
                    </FormControl>
                    <FormMessage>{formState.errors.name?.message}</FormMessage>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="semester"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("GroupSemester")}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder={t("GroupSemester")} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormItem>
              <FormLabel>{t("Students")}</FormLabel>
              <FormControl>
                <StudentTable
                  selectedStudents={selectedStudents}
                  setSelectedStudents={setSelectedStudents}
                />
              </FormControl>
            </FormItem>

            <FormField
              control={form.control}
              name="parent_group_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">
                    {/* ИСПРАВЛЕНО: Изменен лейбл */}
                    Дочерние группы (Child Groups)
                  </FormLabel>
                  <FormControl>
                    <div className="border border-gray-600 rounded-lg p-4 space-y-3 max-h-60 overflow-y-auto bg-gray-800">
                      {availableGroups.length === 0 ? (
                        <p className="text-sm text-gray-300 text-center py-4">
                          {t("NoAvailableGroups")}
                        </p>
                      ) : (
                        <>
                          <div className="text-sm font-medium text-gray-200 mb-2">
                            {/* ИСПРАВЛЕНО: Изменен текст */}
                            Выберите группы, которые станут дочерними:
                          </div>
                          {availableGroups.map((group) => (
                            <div
                              key={group.id}
                              className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-700 transition-colors border border-gray-600"
                            >
                              <Checkbox
                                id={`group-${group.id}`}
                                checked={
                                  field.value?.includes(group.id) || false
                                }
                                onCheckedChange={(checked) => {
                                  const currentValues = field.value || [];
                                  if (checked) {
                                    field.onChange([
                                      ...currentValues,
                                      group.id,
                                    ]);
                                  } else {
                                    field.onChange(
                                      currentValues.filter(
                                        (id) => id !== group.id
                                      )
                                    );
                                  }
                                }}
                                className="border-gray-400 text-blue-400"
                              />
                              <label
                                htmlFor={`group-${group.id}`}
                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1 text-white"
                              >
                                {group.name}
                                <span className="text-xs text-gray-400 ml-2">
                                  ({group.member_count || 0} {t("Students")})
                                </span>
                              </label>
                            </div>
                          ))}
                          {field.value && field.value.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-600">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-blue-400">
                                  {/* ИСПРАВЛЕНО: Изменен текст */}
                                  Выбрано дочерних групп: {field.value.length}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => field.onChange([])}
                                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                                >
                                  {t("ClearAll")}
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button disabled={isPending}>
              {isPending ? `${t("CreateGroup")}...` : t("CreateGroup")}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
