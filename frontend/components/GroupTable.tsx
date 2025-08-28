"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { useEffect, useState, useMemo, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Group from "@/types/group";
import GroupApi from "@/types/groupApi";
import PaginationApi from "./PaginationApi";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SkeletonLoader } from "./TableApi";
import useApiQuery from "@/lib/useApiQuery";

export function GroupTable({
  selectedGroups,
  setSelectedGroups,
}: {
  selectedGroups: Group[];
  setSelectedGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}) {
  const t = useTranslations("GroupTable");
  const tg = useTranslations("groups"); // moved out of cell

  const [page, setPage] = useState(1);
  const [searchName, setSearchName] = useState("");
  const { data } = useApiQuery<GroupApi>(
    `group/list?page=${page}&name=${searchName}`,
    ["groups", page, searchName]
  );

  const selectedGroupIds = useMemo(
    () => new Set(selectedGroups.map((group) => group.id.toString())),
    [selectedGroups]
  );

  const rowSelection = useMemo(() => {
    const selection: Record<string, boolean> = {};
    selectedGroupIds.forEach((id) => {
      selection[id] = true;
    });
    return selection;
  }, [selectedGroupIds]);

  const { data: selectedGroupData } = useQuery<{
    groupList: Group[];
  }>({
    queryKey: ["selectedGroups", Array.from(selectedGroupIds)],
    queryFn: async () => {
      if (selectedGroupIds.size === 0) {
        return { groupList: [] };
      }
      const token = localStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found");
      }
      const body = { groupIds: Array.from(selectedGroupIds) };
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/group/ids`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      return response.json();
    },
    enabled: selectedGroupIds.size > 0,
  });

  const columns = [
    {
      id: "select",
      header: ({ table }: { table: any }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }: { row: any }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: t("groupName"),
      cell: ({ row }: { row: any }) => {
        const g = row.original as Group;
        const isParent = (g.child_groups?.length ?? 0) > 0;
        const isChild = (g.parent_groups?.length ?? 0) > 0;
        const parentName = isChild ? g.parent_groups?.[0]?.name : undefined;

        return (
          <div className="flex items-center gap-2">
            <span className="font-medium">{g.name}</span>
            {isParent && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {tg("parentGroup")}
              </Badge>
            )}
            {isChild && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {parentName
                  ? tg("childOf", { name: parentName })
                  : tg("childGroup")}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "member_count",
      header: () => <div className="capitalize">{t("studentCount")}</div>,
      cell: ({ row }: { row: any }) => (
        <div className="lowercase">{row.getValue("member_count")}</div>
      ),
    },
  ];

  const table = useReactTable({
    data: useMemo(() => data?.groups ?? [], [data]),
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: (updater) => {
      if (typeof updater === "function") {
        const newSelection = updater(rowSelection);
        const newSelectedGroups =
          data?.groups.filter((group) => newSelection[group.id]) || [];
        setSelectedGroups((prev) => {
          const prevIds = new Set(prev.map((g) => g.id));
          return [
            ...prev.filter((g) => newSelection[g.id]),
            ...newSelectedGroups.filter((g) => !prevIds.has(g.id)),
          ];
        });
      }
    },
    getRowId: (row) => row.id.toString(),
    state: {
      rowSelection,
    },
  });

  const handleDeleteGroup = useCallback(
    (group: Group) => {
      setSelectedGroups((prev) => prev.filter((g) => g.id !== group.id));
    },
    [setSelectedGroups]
  );

  useEffect(() => {
    if (selectedGroupData) {
      setSelectedGroups((prevSelected) => {
        const newSelectedMap = new Map(
          selectedGroupData.groupList.map((g) => [g.id, g])
        );
        return prevSelected.map((g) => newSelectedMap.get(g.id) || g);
      });
    }
  }, [selectedGroupData, setSelectedGroups]);

  return (
    <div className="w-full space-y-4 mt-4">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 items-start content-start">
          {selectedGroups.map((group) => (
            <Badge
              key={group.id}
              className="cursor-pointer"
              onClick={() => handleDeleteGroup(group)}
            >
              {group?.name}
              <Trash2 className="h-4" />
            </Badge>
          ))}
        </div>
        <div className="flex items-center">
          <Input
            placeholder={t("filter")}
            onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
              setSearchName(e.target.value);
              setPage(1);
            }}
            className="max-w-sm"
          />
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {!data ? (
              <SkeletonLoader columnCount={columns.length} rowCount={5} />
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {t("noResults")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-end space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {t("rowsSelected", {
            count: table.getFilteredSelectedRowModel().rows.length,
            total: table.getFilteredRowModel().rows.length,
          })}
        </div>
        <div className="space-x-2">
          <PaginationApi data={data?.pagination ?? null} setPage={setPage} />
        </div>
      </div>
    </div>
  );
}
