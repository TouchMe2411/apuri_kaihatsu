import { toast } from "@/components/ui/use-toast";
import { MutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import HttpError from "./HttpError";

// Получаем текущий язык из URL
const getCurrentLocale = () => {
  if (typeof window !== "undefined") {
    const locale = window.location.pathname.split("/")[1];
    return ["en", "ru", "ja", "uz"].includes(locale) ? locale : "en";
  }
  return "en";
};

export default function useApiMutation<T>(
  mutationUrl: string,
  method: "POST" | "PUT" | "DELETE" | "PATCH" = "POST",
  mutationKey: unknown[] = [],
  options: MutationOptions<T, HttpError, any, unknown> = {}
) {
  const { data: session } = useSession();
  const t = useTranslations("errors");
  const queryClient = useQueryClient();

  return useMutation<T, HttpError, any, unknown>({
    mutationKey,
    mutationFn: async (data: any = {}): Promise<T> => {
      const locale = getCurrentLocale();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/${mutationUrl}`,
        {
          method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.sessionToken}`,
            "Accept-Language": locale, // добавили заголовок языка
          },
          body: JSON.stringify(data),
        }
      );
      if (!res.ok) {
        const error = await res.json();
        throw error;
      }
      return res.json();
    },
    onMutate: (variables) => {
      // …existing onMutate logic (if any)…
    },
    onError: (error, variables, context) => {
      // …existing onError logic (if any)…
      options.onError?.(error, variables, context);
    },
    onSuccess: (data, variables, context) => {
      // Инвалидируем кэш
      mutationKey.forEach((key) => {
        if (key) queryClient.invalidateQueries({ queryKey: [key] });
      });
      options.onSuccess?.(data, variables, context);
    },
    ...options,
  });
}