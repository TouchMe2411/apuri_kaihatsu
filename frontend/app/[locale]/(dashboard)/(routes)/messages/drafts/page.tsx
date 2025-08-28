"use client";
import React, { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@/navigation";
import { toast } from "@/components/ui/use-toast";
import { ArrowLeft, Edit, FileEdit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDrafts, deleteDraft } from "@/lib/drafts";
import Draft from "@/types/draft";
import { format } from "date-fns";

export default function DraftsPage() {
  const t = useTranslations("sendmessage");
  const tPosts = useTranslations("posts");
  const tName = useTranslations("names");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const loadedDrafts = getDrafts();
    // Sort by updated_at in descending order (newest first)
    loadedDrafts.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    setDrafts(loadedDrafts);
  }, []);

  const handleDeleteDraft = (id: string) => {
    deleteDraft(id);
    setDrafts(drafts.filter(draft => draft.id !== id));
    toast({
      title: t("draftDeleted"),
      description: t("draftDeletedDescription"),
    });
  };

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

  // Format the updated_at date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM dd, yyyy HH:mm');
    } catch (e) {
      return dateString;
    }
  };

  // Truncate text to a specific length
  const truncateText = (text: string, maxLength: number = 60) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="w-full">
      <Card className="shadow-lg border-0 rounded-none">
        <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Link href="/messages" passHref>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <CardTitle className="text-2xl">{t("messageDrafts")}</CardTitle>
            </div>
            <Link href="/messages/create" passHref>
              <Button className="gap-2">
                <FileEdit className="h-4 w-4" />
                {t("newMessage")}
              </Button>
            </Link>
          </div>
          <CardDescription className="text-base">
            {t("draftsDescription")}
          </CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          {isClient && drafts.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-muted-foreground mb-4">
                {t("noDrafts")}
              </h3>
              <Link href="/messages/create" passHref>
                <Button className="gap-2">
                  <FileEdit className="h-4 w-4" />
                  {t("createNewMessage")}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tPosts("postTitle")}</TableHead>
                    <TableHead>{tPosts("Description")}</TableHead>
                    <TableHead>{tPosts("Priority")}</TableHead>
                    <TableHead>{t("lastUpdated")}</TableHead>
                    <TableHead className="w-[150px]">{tPosts("action")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isClient && drafts.map((draft) => (
                    <TableRow key={draft.id}>
                      <TableCell className="font-medium">
                        {draft.title || t("untitledDraft")}
                      </TableCell>
                      <TableCell>{truncateText(draft.description)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`${getPriorityColor(draft.priority)}`}
                        >
                          {t(draft.priority)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(draft.updated_at)}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Link href={`/messages/create?draft=${draft.id}`} passHref>
                            <Button variant="outline" size="sm" className="h-9 px-3">
                              <Edit className="h-4 w-4 mr-1" />
                              {tPosts("edit")}
                            </Button>
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-9 px-3 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                {tPosts("delete")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("deleteDraft")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("deleteDraftDescription")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => handleDeleteDraft(draft.id)}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {tPosts("delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 