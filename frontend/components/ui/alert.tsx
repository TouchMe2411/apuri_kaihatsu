import React from "react";
import { cn } from "@/lib/utils";

type AlertVariant = "default" | "destructive";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
}

export function Alert({
  variant = "default",
  className,
  ...props
}: AlertProps) {
  const base = "p-4 border rounded-md flex items-start gap-2";
  const variants: Record<AlertVariant, string> = {
    default: "bg-background border-border text-foreground",
    destructive:
      "bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200",
  };
  return (
    <div className={cn(base, variants[variant], className)} {...props} />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h5
      className={cn("text-sm font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  // Сменили <p> на <div>, чтобы внутрь можно было вкладывать любые блоки (flex-обёртки, кнопки и т.п.)
  return (
    <div className={cn("text-sm opacity-90", className)} {...props} />
  );
}

// Опционально: обёртка для группы кнопок внизу алерта
export function AlertActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex gap-2 mt-2", className)} {...props} />
  );
}