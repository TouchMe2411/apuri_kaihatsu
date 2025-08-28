import React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/navigation";
import { Globe } from "lucide-react";

const LanguageSelect = () => {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("app");

  const handleLanguageChange = (lang: string): void => {
    router.push(pathname, { locale: lang });
  };

  const getLanguageLabel = (lang: string): string => {
    switch (lang) {
      case "en":
        return "English";
      case "ja":
        return "日本語";
      case "uz":
        return "O'zbekcha";
      case "ru":
        return "Русский";
      default:
        return lang;
    }
  };

  return (
    <Select defaultValue={locale} onValueChange={handleLanguageChange}>
      <SelectTrigger className="w-[130px] border-primary/20 bg-background/80 backdrop-blur-sm hover:bg-background">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <SelectValue placeholder={t("language")} />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-background/80 backdrop-blur-sm border-primary/20">
        <SelectItem
          value="en"
          className="flex items-center gap-2 cursor-pointer"
        >
          English
        </SelectItem>
        <SelectItem
          value="ja"
          className="flex items-center gap-2 cursor-pointer"
        >
          日本語
        </SelectItem>
        <SelectItem
          value="uz"
          className="flex items-center gap-2 cursor-pointer"
        >
          O`zbekcha
        </SelectItem>
        <SelectItem
          value="ru"
          className="flex items-center gap-2 cursor-pointer"
        >
          Русский
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

export default LanguageSelect;
