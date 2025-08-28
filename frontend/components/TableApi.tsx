import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface TableApiProps<T> {
  data: T[] | null;
  columns: ColumnDef<T>[];
  deletingRows?: number[];
}

function TableApi<T>({ data, columns, deletingRows = [] }: TableApiProps<T>) {
  const t = useTranslations("table");

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>

      <TableBody>
        {data === null ? (
          <SkeletonLoader rowCount={5} columnCount={columns.length} />
        ) : table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => {
            const rowId = (row.original as any)?.id;
            const isDeleting =
              rowId !== undefined && deletingRows.includes(rowId);

            return (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                className={cn(
                  isDeleting && "opacity-50 transition-opacity duration-500"
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })
        ) : (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center">
              {t("noResults")}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

export const SkeletonLoader: React.FC<{
  rowCount: number;
  columnCount: number;
}> = ({ rowCount, columnCount }) => {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columnCount }).map((_, columnIndex) => (
            <TableCell key={columnIndex}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
};

export default TableApi;
