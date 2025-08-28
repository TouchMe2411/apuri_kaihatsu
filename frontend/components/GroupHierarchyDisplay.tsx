"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import Group from "@/types/group";
import { useTranslations } from "next-intl";
import useApiQuery from "@/lib/useApiQuery";
import GroupApi from "@/types/groupApi";

export default function GroupHierarchyDisplay({
  selectedGroups,
  excludedGroupIds = [],
}: {
  selectedGroups: Group[];
  excludedGroupIds?: number[];
}) {
  const t = useTranslations("sendmessage");
  const { data: allGroupsResp } = useApiQuery<GroupApi>(
    `group/list?page=1&name=`,
    ["all-groups-for-message"]
  );
  const allGroups = React.useMemo(
    () => allGroupsResp?.groups ?? [],
    [allGroupsResp?.groups]
  );

  const childrenIdMap = React.useMemo(() => {
    const map = new Map<number, number[]>();
    allGroups.forEach((g) => {
      (g.parent_groups || []).forEach((p) => {
        const arr = map.get(p.id) || [];
        arr.push(g.id);
        map.set(p.id, arr);
      });
    });
    return map;
  }, [allGroups]);

  const collectDescendantIds = React.useCallback(
    (rootId: number) => {
      const acc = new Set<number>();
      const stack = Array.from(childrenIdMap.get(rootId) || []);
      while (stack.length) {
        const id = stack.pop()!;
        if (acc.has(id)) continue;
        acc.add(id);
        const kids = childrenIdMap.get(id) || [];
        for (let i = 0; i < kids.length; i++) stack.push(kids[i]);
      }
      return acc;
    },
    [childrenIdMap]
  );

  const excludedSet = React.useMemo(
    () => new Set<number>(excludedGroupIds),
    [excludedGroupIds]
  );

  const selectedIds = React.useMemo(
    () => new Set<number>(selectedGroups.map((g) => g.id)),
    [selectedGroups]
  );

  const receivingUnique = React.useMemo(() => {
    const map = new Map<number, string>();
    selectedGroups.forEach((g) => {
      if (!excludedSet.has(g.id)) map.set(g.id, g.name);
    });
    selectedGroups.forEach((g) => {
      const descendants = collectDescendantIds(g.id);
      descendants.forEach((id) => {
        if (!map.has(id) && !excludedSet.has(id)) {
          const found = allGroups.find((ag) => ag.id === id);
          if (found) map.set(id, found.name);
        }
      });
    });
    return map;
  }, [selectedGroups, collectDescendantIds, allGroups, excludedSet]);

  const totalReceiving = receivingUnique.size;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Message Hierarchy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selected groups */}
        <div>
          <div className="text-sm font-medium mb-2">
            {t("selectedGroups")} ({selectedGroups.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedGroups.map((g) => (
              <Badge key={g.id} variant="secondary" className="px-2 py-1">
                {g.name}
              </Badge>
            ))}
            {selectedGroups.length === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>

        {/* Receiving groups */}
        <div>
          <div className="text-sm font-medium mb-2">
            Receiving groups ({totalReceiving})
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(receivingUnique.entries()).map(([id, name]) => (
              <Badge
                key={id}
                variant={selectedIds.has(id) ? "secondary" : "outline"}
                className={`px-2 py-1 ${
                  selectedIds.has(id)
                    ? "bg-primary/10 text-primary"
                    : "border-dashed"
                }`}
              >
                {name}
              </Badge>
            ))}
            {totalReceiving === 0 && (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}