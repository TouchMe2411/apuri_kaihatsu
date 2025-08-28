"use client";

import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import {
  EllipsisVertical,
  Search,
  Users,
  Plus,
  GripVertical,
  Unlink,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import PaginationApi from "@/components/PaginationApi";
import { Input } from "@/components/ui/input";
import Group from "@/types/group";
import GroupApi from "@/types/groupApi";
import { Link, usePathname, useRouter } from "@/navigation";
import { Button } from "@/components/ui/button";
import TableApi from "@/components/TableApi";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useLayoutEffect, useRef } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/use-toast";
import useApiQuery from "@/lib/useApiQuery";
import useApiMutation from "@/lib/useApiMutation";
import { Badge } from "@/components/ui/badge";
import { defaultDropAnimationSideEffects } from "@dnd-kit/core";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Modifier,
} from "@dnd-kit/core";

// Custom vertical axis modifier (замена restrictToVerticalAxis из @dnd-kit/modifiers)
const restrictToVerticalAxis: Modifier = ({ transform }) => ({
  ...transform,
  x: 0,
});

const BOX_H = 110;
const ROOT_LEFT_SHIFT = -40;

interface DraggableRowProps {
  group: Group;
  children: React.ReactNode;
  disableDrag?: boolean;
}
const DraggableRow = ({
  group,
  children,
  disableDrag = false,
}: DraggableRowProps) => {
  const localRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `group-${group.id}`,
      data: { group },
      disabled: disableDrag,
    });
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `drop-${group.id}`,
    data: { group },
  });

  useLayoutEffect(() => {
    if (localRef.current && !isDragging) {
      setHeight(localRef.current.offsetHeight);
    }
  }, [isDragging]);

  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
      }
    : {};

  const dragProps = disableDrag ? {} : { ...listeners, ...attributes };

  // Placeholder (оставляет место и показывает куда вернётся элемент)
  if (isDragging) {
    return (
      <div
        style={{ height: height ?? 52 }}
        className="rounded-md border-2 border-dashed border-primary/40 bg-primary/5"
      />
    );
  }

  return (
    <div
      ref={(node) => {
        localRef.current = node;
        setNodeRef(node);
        setDropRef(node);
      }}
      style={style}
      {...dragProps}
      className={`
        transition-colors duration-150
        ${disableDrag ? "cursor-default" : "cursor-grab active:cursor-grabbing"}
        ${
          isOver
            ? "bg-blue-500/10 ring-2 ring-blue-500 ring-offset-1 ring-offset-background"
            : ""
        }
      `}
    >
      {children}
    </div>
  );
};

// ДОБАВИТЬ компонент превью перетаскивания (без fixed top/left)
function DragPreview({ group }: { group: Group }) {
  return (
    <div className="pointer-events-none rounded-md border bg-card shadow-2xl px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
        <Users className="w-4 h-4 text-primary" />
      </div>
      <span className="font-semibold">{group.name}</span>
      <Badge variant="secondary" className="text-xs">
        {group.member_count || 0}
      </Badge>
    </div>
  );
}

// Строим цепочку вверх (родители) + вниз (первые дети) для отображения
function buildChain(start: Group, all: Group[]): Group[] {
  const byId = new Map(all.map((g) => [g.id, g]));
  // вверх
  const up: Group[] = [];
  let cur: Group | undefined = start;
  while (cur && cur.parent_groups && cur.parent_groups.length) {
    const pId = cur.parent_groups[0].id;
    const p = byId.get(pId);
    if (!p || up.find((x) => x.id === p.id)) break;
    up.unshift(p);
    cur = p;
  }
  // вниз (берём единственную цепочку первого ребёнка)
  const down: Group[] = [];
  let node: Group | undefined = start;
  while (node?.child_groups && node.child_groups.length) {
    const cId = node.child_groups[0].id;
    const c = byId.get(cId);
    if (!c || down.find((x) => x.id === c.id)) break;
    down.push(c);
    node = c;
  }
  return [...up, start, ...down.filter((d) => d.id !== start.id)];
}

// Получаем корневые стартовые ноды (те, у кого нет родителя)
function findRootHeads(groups: Group[]): Group[] {
  return groups.filter((g) => !g.parent_groups || g.parent_groups.length === 0);
}

// ЗАМЕНА: orderGroupsFlat – определяем родителя либо через parent_groups, либо через child_groups у других
function orderGroupsFlat(list: Group[]): Group[] {
  const childrenMap = buildChildrenMap(list);
  const roots = list.filter(
    (g) => !(g.parent_groups && g.parent_groups.length)
  );
  const ordered: Group[] = [];
  for (const r of roots) {
    ordered.push(r);
    const kids = childrenMap.get(r.id) || [];
    ordered.push(...kids);
  }
  list.forEach((g) => {
    if (!ordered.find((x) => x.id === g.id)) ordered.push(g);
  });
  return ordered;
}

// NEW: вычисление детей (если backend не возвращает child_groups)
function buildChildrenMap(groups: Group[]): Map<number, Group[]> {
  const map = new Map<number, Group[]>();
  groups.forEach((g) => {
    g.parent_groups?.forEach((p) => {
      const arr = map.get(p.id) || [];
      arr.push(g);
      map.set(p.id, arr);
    });
  });
  return map;
}

export default function Groups() {
  const t = useTranslations("groups");
  const [page, setPage] = useState(1); // просто чтобы запрос сработал
  const [search, setSearch] = useState("");
  const pathName = usePathname();
  const router = useRouter();

  const { data } = useApiQuery<GroupApi>(
    `group/list?page=${page}&name=${search}`,
    ["groups", page, search]
  );

  // REPLACED: rawGroups с useMemo чтобы стабилизировать зависимость
  // const rawGroups = data?.groups || [];
  const rawGroups = useMemo(() => data?.groups ?? [], [data?.groups]);
  const childrenMap = useMemo(() => buildChildrenMap(rawGroups), [rawGroups]);
  const orderedGroups = orderGroupsFlat(rawGroups);

  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState<Group | null>(null);
  const [mutateGroupId, setMutateGroupId] = useState<number | null>(null);
  const [activeGroup, setActiveGroup] = useState<any>(null); // ДОБАВЛЕНО
  const [dragWidth, setDragWidth] = useState<number | null>(null); // ДОБАВЛЕНО состояние для ширины overlay (чтобы совпадало с исходной строкой)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  ); // ДОБАВЛЕНО sensors (мягкая активация через дистанцию)

  // ВЫНЕСЕНО: функция отсоединения ребёнка
  const detachChild = (child: Group) => {
    const parentId = child.parent_groups?.[0]?.id;
    if (!parentId) return;
    const parent = rawGroups.find((g) => g.id === parentId);
    if (!parent) return;

    const currentChildrenIds = (
      childrenMap.get(parent.id)?.map((c) => c.id) || []
    ).filter((id) => id !== child.id);

    setMutateGroupId(parent.id);
    updateHierarchy({
      name: parent.name,
      parent_group_ids: currentChildrenIds,
    });
  };

  // ДОБАВЛЕНО: Мутация для обновления иерархии
  const { mutate: updateHierarchy } = useApiMutation<{ message: string }>(
    `group/${mutateGroupId}`,
    "PUT",
    ["updateGroupHierarchy"],
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["groups"] });
      },
    }
  );

  const { mutate } = useApiMutation<{ message: string }>(
    `group/${mutateGroupId}`,
    "DELETE",
    ["deleteGroup"],
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["groups"] });
        toast({
          title: t("groupDeleted"),
          description: data.message,
        });
      },
    }
  );

  // ДОБАВЛЕНО: Обработчики drag and drop
  const handleDragStart = (event: DragStartEvent) => {
    const group = event.active.data.current?.group as Group | undefined;
    setDragging(group || null);
    setActiveGroup(group || null);
    // ширина оригинального DOM (initial rect)
    const w =
      event.active.rect.current.translated?.width ||
      event.active.rect.current.initial?.width;
    setDragWidth(w || null);
  };

  // УПРОЩЕНО: делаем дочернюю связь (перетянули A на B -> A.child of B)
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDragging(null);
    setActiveGroup(null);
    setDragWidth(null);
    if (!active || !over) return;

    const dragged = active.data.current?.group as Group | undefined;
    if (!dragged) return;

    const target = over.data.current?.group as Group | undefined;
    if (!target || dragged.id === target.id) return;

    const draggedChildren = childrenMap.get(dragged.id) || [];
    const targetIsChild = !!target.parent_groups?.length;
    const draggedIsChild = !!dragged.parent_groups?.length;

    // NEW: уже находится в этой группе (перетаскиваем ребёнка на его текущего родителя)
    const currentParentId = dragged.parent_groups?.[0]?.id;
    if (draggedIsChild && currentParentId && target.id === currentParentId) {
      toast({
        title: t("notAllowed"),
        description: t("alreadyInThisGroup"), // “Already in this group”
        variant: "destructive",
      });
      return;
    }

    // запрет на цикл
    if (draggedChildren.some((c) => c.id === target.id)) {
      toast({
        title: t("notAllowed"),
        description: t("cyclicRelation"),
        variant: "destructive",
      });
      return;
    }

    // НОВОЕ: дочернюю группу нельзя кидать на другую дочернюю
    if (draggedIsChild && targetIsChild) {
      toast({
        title: t("notAllowed"),
        variant: "destructive",
      });
      return;
    }

    // NEW: если бросаем на "детскую" группу — она становится корнем и родителем для перетаскиваемой
    if (targetIsChild) {
      // защищаемся от 3-го уровня: нельзя класть под Y группу с собственными детьми
      if (draggedChildren.length > 0) {
        toast({
          title: t("notAllowed"),
          description: t("maxTwoLevels"),
          variant: "destructive",
        });
        return;
      }

      // 1) отвязать Y от его текущего родителя F
      const targetOldParentId = target.parent_groups?.[0]?.id;
      if (targetOldParentId) {
        const targetOldParent = rawGroups.find(
          (g) => g.id === targetOldParentId
        );
        if (targetOldParent) {
          const pruned = (childrenMap.get(targetOldParentId) || [])
            .map((c) => c.id)
            .filter((id) => id !== target.id);
          setMutateGroupId(targetOldParent.id);
          updateHierarchy({
            name: targetOldParent.name,
            parent_group_ids: pruned,
          });
        }
      }

      // 2) добавить перетаскиваемую группу X в дети Y
      const newKids = new Set<number>(
        (childrenMap.get(target.id) || []).map((c) => c.id)
      );
      newKids.add(dragged.id);
      setMutateGroupId(target.id);
      updateHierarchy({
        name: target.name,
        parent_group_ids: Array.from(newKids),
      });
      return;
    }

    // REWORKED: перетаскиваем ДОЧЕРНЮЮ группу на КОРНЕВУЮ — переназначаем родителя
    if (draggedIsChild && !targetIsChild) {
      const oldParentId = dragged.parent_groups?.[0]?.id;
      if (oldParentId && oldParentId !== target.id) {
        const oldChildrenIds = (childrenMap.get(oldParentId) || [])
          .map((c) => c.id)
          .filter((id) => id !== dragged.id);
        const oldParent = rawGroups.find((g) => g.id === oldParentId);
        if (oldParent) {
          setMutateGroupId(oldParent.id);
          updateHierarchy({
            name: oldParent.name,
            parent_group_ids: oldChildrenIds, // удалить F из старого родителя
          });
        }
      }

      // добавить F в дети A
      const existingChildIds = new Set<number>(
        (childrenMap.get(target.id) || []).map((c) => c.id)
      );
      existingChildIds.add(dragged.id);
      setMutateGroupId(target.id);
      updateHierarchy({
        name: target.name,
        parent_group_ids: Array.from(existingChildIds),
      });
      return;
    }

    // UPDATED: перетащили родителя на корневую -> F станет родителем и детей (Y и X) берём под F
    if (draggedChildren.length > 0 && !targetIsChild) {
      // 1) убрать dragged из его старого родителя (если был)
      const oldParentId = dragged.parent_groups?.[0]?.id;
      if (oldParentId && oldParentId !== target.id) {
        const oldChildrenIds = (childrenMap.get(oldParentId) || [])
          .map((c) => c.id)
          .filter((id) => id !== dragged.id);
        const oldParent = rawGroups.find((g) => g.id === oldParentId);
        if (oldParent) {
          setMutateGroupId(oldParent.id);
          updateHierarchy({
            name: oldParent.name,
            parent_group_ids: oldChildrenIds,
          });
        }
      }

      // 2) очистить детей у dragged (Y), т.к. их поднимаем под F
      setMutateGroupId(dragged.id);
      updateHierarchy({
        name: dragged.name,
        parent_group_ids: [], // detach all children from Y
      });

      // 3) добавить к F: Y и всех прежних детей Y (например, X)
      const targetChildIds = (childrenMap.get(target.id) || []).map(
        (c) => c.id
      );
      const draggedChildIds = draggedChildren.map((c) => c.id);
      const newTargetChildren = Array.from(
        new Set<number>([...targetChildIds, dragged.id, ...draggedChildIds])
      );

      setMutateGroupId(target.id);
      updateHierarchy({
        name: target.name,
        parent_group_ids: newTargetChildren,
      });
      return;
    }

    // прежняя логика: родителя на "детскую" группу — цель становится ребёнком родителя
    if (draggedChildren.length > 0) {
      if (targetIsChild && dragged.parent_groups?.length) {
        toast({
          title: t("notAllowed"),
          description: t("maxTwoLevels"),
          variant: "destructive",
        });
        return;
      }

      const oldParentIdT = target.parent_groups?.[0]?.id;
      if (oldParentIdT && oldParentIdT !== dragged.id) {
        const oldChildrenIdsT = (childrenMap.get(oldParentIdT) || [])
          .map((c) => c.id)
          .filter((id) => id !== target.id);
        const oldParentT = rawGroups.find((g) => g.id === oldParentIdT);
        if (oldParentT) {
          setMutateGroupId(oldParentT.id);
          updateHierarchy({
            name: oldParentT.name,
            parent_group_ids: oldChildrenIdsT,
          });
        }
      }

      const newChildIds = Array.from(
        new Set([...draggedChildren.map((c) => c.id), target.id])
      );
      setMutateGroupId(dragged.id);
      updateHierarchy({
        name: dragged.name,
        parent_group_ids: newChildIds,
      });
      return;
    }

    // иначе: перемещаем одиночную группу под цель
    if (targetIsChild && (childrenMap.get(dragged.id) || []).length > 0) {
      toast({
        title: t("notAllowed"),
        description: t("maxTwoLevels"),
        variant: "destructive",
      });
      return;
    }

    const oldParentId = dragged.parent_groups?.[0]?.id;
    if (oldParentId && oldParentId !== target.id) {
      const oldChildrenIds = (childrenMap.get(oldParentId) || [])
        .map((c) => c.id)
        .filter((id) => id !== dragged.id);
      const oldParent = rawGroups.find((g) => g.id === oldParentId);
      if (oldParent) {
        setMutateGroupId(oldParent.id);
        updateHierarchy({
          name: oldParent.name,
          parent_group_ids: oldChildrenIds,
        });
      }
    }

    const existingChildIds = new Set<number>(
      (childrenMap.get(target.id) || []).map((c) => c.id)
    );
    existingChildIds.add(dragged.id);

    setMutateGroupId(target.id);
    updateHierarchy({
      name: target.name,
      parent_group_ids: Array.from(existingChildIds),
    });
  };

  const columns: ColumnDef<Group>[] = [
    {
      accessorKey: "name",
      header: () => (
        <div className="flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
          {t("groupName")}
        </div>
      ),
      cell: ({ row }) => {
        const g = row.original;
        const parentId = g.parent_groups?.[0]?.id;
        const parent = parentId
          ? rawGroups.find((pg) => pg.id === parentId)
          : undefined;
        const isChild = !!parent;

        return (
          <DraggableRow group={g}>
            <div
              className={`flex items-center gap-3 ${
                isChild ? "pl-10" : ""
              } relative`}
            >
              {isChild && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-primary text-sm font-semibold">
                  ↳
                </span>
              )}
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold flex items-center gap-2">
                  {g.name}
                  {isChild && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      data-nodrag
                      className="h-5 px-1 text-xs"
                      onPointerDown={(e) => {
                        // предотвращаем старт drag
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        detachChild(g);
                      }}
                      title={t("detach")}
                    >
                      <Unlink className="w-3 h-3" />
                    </Button>
                  )}
                </span>
                {isChild && parent && (
                  <span className="text-xs text-muted-foreground">
                    {t("childOf", { name: parent.name })}
                  </span>
                )}
              </div>
            </div>
          </DraggableRow>
        );
      },
    },
    {
      accessorKey: "member_count",
      header: t("studentCount"),
      cell: ({ row }) => (
        <DraggableRow group={row.original}>
          <Badge variant="secondary" className="font-medium">
            <Users className="w-3 h-3 mr-1" />
            {row.getValue("member_count")} {t("students")}
          </Badge>
        </DraggableRow>
      ),
    },
    {
      header: t("action"),
      cell: ({ row }) => (
        <DraggableRow group={row.original} disableDrag>
          <Dialog>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/groups/${row.original.id}`);
                  }}
                >
                  {t("view")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/groups/edit/${row.original.id}`);
                  }}
                >
                  {t("edit")}
                </DropdownMenuItem>
                <DialogTrigger asChild>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t("delete")}
                  </DropdownMenuItem>
                </DialogTrigger>
              </DropdownMenuContent>
            </DropdownMenu>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-destructive/10 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-destructive" />
                  </div>
                  {row?.original.name}
                </DialogTitle>
                <DialogDescription>
                  {t("groupContainsStudents", {
                    count: row.original.member_count,
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <p className="text-muted-foreground">
                  {t("DouYouDeleteGroup")}
                </p>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t("cancel")}</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setMutateGroupId(row.original.id);
                    mutate({});
                  }}
                >
                  {t("confirm")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DraggableRow>
      ),
    },
  ];

  return (
    <DndContext
      sensors={sensors}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{t("groups")}</h1>
            <p className="text-muted-foreground">
              {t("manageGroupsDescription")}
            </p>
          </div>
          <Link href={`${pathName}/create`}>
            <Button
              size="lg"
              className="shadow-md hover:shadow-lg transition-shadow"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t("creategroup")}
            </Button>
          </Link>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder={t("filter")}
                  onInput={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <PaginationApi
                data={data?.pagination || null}
                setPage={setPage}
              />
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <TableApi data={orderedGroups} columns={columns} />
        </Card>

        {/* ОБНОВЛЕНО: DragOverlay без createPortal и без fixed top-left */}
        <DragOverlay
          dropAnimation={{
            duration: 160,
            easing: "ease-out",
            sideEffects: defaultDropAnimationSideEffects({
              styles: { active: { opacity: "0.35" } },
            }),
          }}
          style={{ cursor: "grabbing" }}
        >
          {activeGroup ? (
            <div
              style={{ width: dragWidth ?? undefined }}
              className="pointer-events-none rounded-md border bg-card shadow-xl px-4 py-3 flex items-center gap-3"
            >
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-primary" />
              </div>
              <span className="font-semibold">{activeGroup.name}</span>
              <Badge variant="secondary" className="text-xs">
                {activeGroup.member_count || 0}
              </Badge>
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
