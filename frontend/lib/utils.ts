import { type ClassValue, clsx } from "clsx";
import { useFormatter } from "next-intl";
import { twMerge } from "tailwind-merge";
import { DateTimeFormatOptions, useTimeZone } from "use-intl";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function FormatDate(
  date: string,
  style: string | DateTimeFormatOptions | undefined = {
    dateStyle: "long",
  } as DateTimeFormatOptions,
) {
  const format = useFormatter();
  return date && format.dateTime(convertTimeToUTC(date), style);
}
export function FormatDateTime(
  date: string,
  style: string | DateTimeFormatOptions | undefined = {
    dateStyle: "medium",
    timeStyle: "short",
  } as DateTimeFormatOptions,
) {
  const format = useFormatter();
  return date && format.dateTime(convertTimeToUTC(date), style);
}
// Handle dates with appropriate timezone adjustments for scheduled messages
export function convertTimeToUTC(date: string) {
  // If this is not a valid date string, return a new Date object
  if (!date || typeof date !== 'string') {
    return new Date();
  }
  
  // Special case for our custom scheduled message format with pipe
  if (date.includes("|")) {
    try {
      // Parse the custom format
      const [datePart, timePart] = date.split('|');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      
      // Create date object with exact time specified
      return new Date(year, month - 1, day, hour, minute);
    } catch (e) {
      console.error("Error parsing pipe-formatted date:", e);
      return new Date(date);
    }
  }
  
  // For standard MySQL datetime that has the +5 hour adjustment
  if (date.includes("-") && date.includes(":") && !date.includes("delivery_at")) {
    try {
      // Parse the MySQL datetime format
      const [datePart, timePart] = date.includes("T") 
        ? date.split("T") 
        : date.split(" ");
      
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      
      // Adjust time back by 5 hours to get the original user selection
      const adjustedHour = (hour - 5 + 24) % 24; // Add 24 to handle negative hours
      
      // Create date with the adjusted time
      return new Date(year, month - 1, day, adjustedHour, minute);
    } catch (e) {
      console.error("Error adjusting MySQL datetime:", e);
      return new Date(date);
    }
  }
  
  // For dates containing delivery_at field reference, keep them as is
  if (date.includes("delivery_at")) {
    return new Date(date);
  }
  
  // For all other dates, keep them as is without adjustments
  return new Date(date);
}
