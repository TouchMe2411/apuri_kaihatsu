import { IController } from "../utils/icontroller";
import { ExtendedRequest, verifyToken } from "../middlewares/auth";
import express, { NextFunction, Request, Response, Router } from "express";
import { generatePaginationLinks } from "../utils/helper";
import DB from "../utils/db-client";
import { isValidString, isValidId, isValidArrayId } from "../utils/validate";
import process from "node:process";
import { stringify } from "csv-stringify/sync";
import multer from "multer";
import { Readable } from "node:stream";
import csv from "csv-parser";
import iconv from "iconv-lite";

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Добавим интерфейсы для типизации
interface CreateGroupRequest {
  name: string;
  students?: number[];
  parent_group_ids?: number[];
}

interface EditGroupRequest {
  name: string;
  students?: number[];
  parent_group_ids?: number[];
}

interface GroupInfo {
  id: number;
  name: string;
  parent_group_id: number | null;
  created_at?: string;
  school_id?: number;
}

// ИСПРАВЛЕНО: Функции с правильной типизацией
const getAllChildGroups = async (groupId: number): Promise<number[]> => {
  const directChildren = await DB.query(
    `SELECT id FROM StudentGroup WHERE parent_group_id = :group_id
     UNION
     SELECT gh.child_group_id as id FROM GroupHierarchy gh WHERE gh.parent_group_id = :group_id`,
    { group_id: groupId }
  );

  // ИСПРАВЛЕНО: Правильная типизация
  let allChildren: number[] = directChildren.map((child: any) =>
    Number(child.id)
  );

  // Рекурсивно получаем дочерние группы для каждой дочерней группы
  for (const childId of allChildren) {
    const grandChildren = await getAllChildGroups(childId);
    allChildren = [...allChildren, ...grandChildren];
  }

  // Убираем дубликаты
  return [...new Set(allChildren)];
};

const getAllParentGroups = async (groupId: number): Promise<number[]> => {
  const directParents = await DB.query(
    `SELECT parent_group_id as id FROM StudentGroup WHERE id = :group_id AND parent_group_id IS NOT NULL
     UNION
     SELECT gh.parent_group_id as id FROM GroupHierarchy gh WHERE gh.child_group_id = :group_id`,
    { group_id: groupId }
  );

  // ИСПРАВЛЕНО: Правильная типизация
  let allParents: number[] = directParents.map((parent: any) =>
    Number(parent.id)
  );

  // Рекурсивно получаем родительские группы
  for (const parentId of allParents) {
    const grandParents = await getAllParentGroups(parentId);
    allParents = [...allParents, ...grandParents];
  }

  return [...new Set(allParents)];
};

class GroupController implements IController {
  public router: Router = express.Router();

  constructor() {
    this.initRoutes();
    // ДОБАВЛЕНО: Создаем таблицу при инициализации контроллера
    this.initGroupHierarchyTable();
  }

  // ДОБАВЛЕНО: Метод для создания таблицы GroupHierarchy
  private async initGroupHierarchyTable() {
    try {
      await DB.execute(`
        CREATE TABLE IF NOT EXISTS GroupHierarchy (
          id INT AUTO_INCREMENT PRIMARY KEY,
          child_group_id INT NOT NULL,
          parent_group_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (child_group_id) REFERENCES StudentGroup(id) ON DELETE CASCADE,
          FOREIGN KEY (parent_group_id) REFERENCES StudentGroup(id) ON DELETE CASCADE,
          UNIQUE KEY unique_hierarchy (child_group_id, parent_group_id)
        )
      `);
    } catch (e) {
      console.log(
        "GroupHierarchy table already exists or error creating it:",
        e
      );
    }
  }

  // ИСПРАВЛЕНО: Безопасное получение родительских и дочерних групп
  private async getParentGroups(groupId: number) {
    try {
      // Сначала пробуем получить из новой таблицы
      const hierarchyParents = await DB.query(
        `SELECT sg.id, sg.name 
       FROM GroupHierarchy gh
       JOIN StudentGroup sg ON gh.parent_group_id = sg.id
       WHERE gh.child_group_id = :group_id`,
        { group_id: groupId }
      ).catch(() => []);

      // Если нет данных в новой таблице, проверяем старую структуру
      if (hierarchyParents.length === 0) {
        const legacyParent = await DB.query(
          `SELECT sg.id, sg.name 
         FROM StudentGroup sg
         WHERE sg.id = (
           SELECT parent_group_id 
           FROM StudentGroup 
           WHERE id = :group_id AND parent_group_id IS NOT NULL
         )`,
          { group_id: groupId }
        );
        return legacyParent;
      }

      return hierarchyParents;
    } catch (e) {
      console.log("Error getting parent groups:", e);
      return [];
    }
  }

  private async getChildGroups(groupId: number) {
    try {
      // Сначала пробуем получить из новой таблицы
      const hierarchyChildren = await DB.query(
        `SELECT sg.id, sg.name 
       FROM GroupHierarchy gh
       JOIN StudentGroup sg ON gh.child_group_id = sg.id
       WHERE gh.parent_group_id = :group_id`,
        { group_id: groupId }
      ).catch(() => []);

      // Если нет данных в новой таблице, проверяем старую структуру
      if (hierarchyChildren.length === 0) {
        const legacyChildren = await DB.query(
          `SELECT id, name 
         FROM StudentGroup 
         WHERE parent_group_id = :group_id`,
          { group_id: groupId }
        );
        return legacyChildren;
      }

      return hierarchyChildren;
    } catch (e) {
      console.log("Error getting child groups:", e);
      return [];
    }
  }

  // ИСПРАВЛЕНО: Только один initRoutes
  initRoutes(): void {
    this.router.post("/group/create", verifyToken, this.createGroup);
    this.router.get("/group/list", verifyToken, this.groupFilter);
    this.router.post("/group/ids", verifyToken, this.groupByIds);
    this.router.post(
      "/group/upload",
      verifyToken,
      upload.single("file"),
      this.uploadGroupsFromCSV
    );
    this.router.get("/group/export", verifyToken, this.exportGroupsToCSV);

    this.router.get("/group/:id", verifyToken, this.getGroupById);
    this.router.delete("/group/:id", verifyToken, this.groupDelete);
    this.router.put("/group/:id", verifyToken, this.groupEdit);
    this.router.put("/group/detach/:id", verifyToken, this.detachChildGroup);

    // ДОБАВЛЕНО: Новый endpoint для получения иерархии групп
    this.router.post("/group/hierarchy", verifyToken, this.groupHierarchy);
  }

  // ДОБАВЛЕНО: Метод для отсоединения дочерней группы
  detachChildGroup = async (req: ExtendedRequest, res: Response) => {
    try {
      const groupId = req.params.id;

      if (!groupId || !isValidId(groupId)) {
        throw { status: 400, message: "Invalid or missing group id" };
      }

      // Проверяем существование группы
      const groupInfo = await DB.query(
        `SELECT id, name, parent_group_id FROM StudentGroup 
         WHERE id = :id AND school_id = :school_id`,
        { id: groupId, school_id: req.user.school_id }
      );
      if (groupInfo.length <= 0) {
        throw { status: 404, message: "Group not found" };
      }

      // 1) Отвязываем ВСЕХ детей текущей группы (и legacy, и иерархию)
      await DB.execute(
        `UPDATE StudentGroup SET parent_group_id = NULL WHERE parent_group_id = :group_id`,
        { group_id: groupId }
      );
      try {
        await DB.execute(
          `DELETE FROM GroupHierarchy WHERE parent_group_id = :group_id`,
          { group_id: groupId }
        );
      } catch {}

      // 2) Отвязываем саму группу от её родителя(ей)
      await DB.execute(
        `UPDATE StudentGroup SET parent_group_id = NULL WHERE id = :id`,
        { id: groupId }
      );
      try {
        await DB.execute(
          `DELETE FROM GroupHierarchy WHERE child_group_id = :group_id`,
          { group_id: groupId }
        );
      } catch {}

      return res
        .status(200)
        .json({ message: "Group detached successfully" })
        .end();
    } catch (e: any) {
      if (e.status)
        return res.status(e.status).json({ error: e.message }).end();
      return res.status(500).json({ error: "Internal server error" }).end();
    }
  };

  exportGroupsToCSV = async (req: ExtendedRequest, res: Response) => {
    try {
      const groups = await DB.query(
        `SELECT
                id, name
                FROM StudentGroup
                WHERE school_id = :school_id`,
        {
          school_id: req.user.school_id,
        }
      );

      if (groups.length === 0) {
        return res
          .status(404)
          .json({
            error: "No groups found",
          })
          .end();
      }

      for (const group of groups) {
        const memberList = await DB.query(
          `SELECT 
                    st.student_number
                    FROM GroupMember AS gm
                    INNER JOIN Student as st ON gm.student_id = st.id
                    WHERE gm.group_id = :group_id`,
          {
            group_id: group.id,
          }
        );
        group.student_numbers = memberList.map(
          (member: any) => member.student_number
        );
      }

      const csvData = groups.map((group: any) => ({
        name: group.name,
        student_numbers: group.student_numbers.join(", "),
      }));

      const csvContent = stringify(csvData, {
        header: true,
        columns: ["name", "student_numbers"],
      });

      res.setHeader("Content-Disposition", 'attachment; filename="groups.csv"');
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(Buffer.from("\uFEFF" + csvContent, "utf-8"));
    } catch (e: any) {
      return res
        .status(500)
        .json({
          error: "Internal server error",
          details: e.message,
        })
        .end();
    }
  };

  uploadGroupsFromCSV = async (req: ExtendedRequest, res: Response) => {
    const { throwInError, action, withCSV } = req.body;
    const throwInErrorBool = throwInError === "true";
    const withCSVBool = withCSV === "true";
    const results: any[] = [];
    const errors: any[] = [];
    const inserted: any[] = [];
    const updated: any[] = [];
    const deleted: any[] = [];
    try {
      if (!req.file || !req.file.buffer) {
        return res
          .status(400)
          .json({
            error: "Bad Request",
            details: "File is missing or invalid",
          })
          .end();
      }
      const decodedContent = await iconv.decode(req.file.buffer, "UTF-8");
      const stream = Readable.from(decodedContent);
      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on("headers", (headers: any) => {
            if (headers[0].charCodeAt(0) === 0xfeff) {
              headers[0] = headers[0].substring(1);
            }
          })
          .on("data", (data: any) => {
            if (Object.values(data).some((value: any) => value.trim() !== "")) {
              results.push(data);
            }
          })
          .on("end", resolve)
          .on("error", reject);
      });
      const validResults: any[] = [];
      const existingGroupIdsInCSV: string[] = [];
      for (const row of results) {
        const { name, student_numbers } = row;
        const rowErrors: any = {};
        const normalizedName = String(name).trim();
        const normalizedStudentNumbers = String(student_numbers)
          .split(",")
          .map((item) => item.trim());
        if (!isValidString(normalizedName) && normalizedName.length > 1)
          rowErrors.name = "Invalid name";
        if (existingGroupIdsInCSV.includes(normalizedName)) {
          rowErrors.name = "This group name already exists";
        }
        if (Object.keys(rowErrors).length > 0) {
          errors.push({ row, errors: rowErrors });
        } else {
          row.name = normalizedName;
          row.student_numbers = normalizedStudentNumbers;
          existingGroupIdsInCSV.push(row.name);
          validResults.push(row);
        }
      }
      if (errors.length > 0 && throwInErrorBool) {
        return res.status(400).json({ errors: errors }).end();
      }
      const groupNames = validResults.map((row) => row.name);
      if (groupNames.length === 0) {
        return res
          .status(400)
          .json({
            errors: errors,
            message: "All data invalid",
          })
          .end();
      }
      const existingGroups = await DB.query(
        "SELECT name FROM StudentGroup WHERE name IN (:groupNames)",
        {
          groupNames,
        }
      );
      const existingGroupNames = existingGroups.map((group: any) => group.name);
      if (action === "create") {
        for (const row of validResults) {
          if (existingGroupNames.includes(row.name)) {
            errors.push({ row, errors: { name: "Group already exists" } });
          } else {
            const groupInsert = await DB.execute(
              `INSERT INTO StudentGroup(name, created_at, school_id)
                            VALUE (:name, NOW(), :school_id);`,
              {
                name: row.name,
                school_id: req.user.school_id,
              }
            );
            const groupId = groupInsert.insertId;
            console.log("Created group with ID:", groupId);

            // ИСПРАВЛЕНО: Логика изменена - выбранные группы становятся ДОЧЕРНИМИ для новой группы
            if (
              row.parent_group_ids &&
              Array.isArray(row.parent_group_ids) &&
              row.parent_group_ids.length > 0
            ) {
              console.log(
                "Setting child groups for new group:",
                row.parent_group_ids
              );

              // Проверяем все выбранные группы
              for (const childId of row.parent_group_ids) {
                const childGroupId = Number(childId);

                const childGroup = await DB.query(
                  `SELECT id FROM StudentGroup WHERE id = :child_group_id AND school_id = :school_id`,
                  {
                    child_group_id: childGroupId,
                    school_id: req.user.school_id,
                  }
                );
                if (childGroup.length === 0) {
                  throw {
                    status: 404,
                    message: `Child group with id ${childId} not found`,
                  };
                }

                // Сбрасываем все старые родительские связи ребёнка
                try {
                  await DB.execute(
                    `DELETE FROM GroupHierarchy WHERE child_group_id = :child_id`,
                    { child_id: childGroupId }
                  );
                } catch {}
                await DB.execute(
                  `UPDATE StudentGroup SET parent_group_id = NULL WHERE id = :child_id`,
                  { child_id: childGroupId }
                );

                // Устанавливаем новую группу как родительскую для выбранных групп
                // Сначала очищаем старых родителей
                try {
                  await DB.execute(
                    `DELETE FROM GroupHierarchy WHERE child_group_id = :child_id`,
                    { child_id: childGroupId }
                  );
                } catch {}
                await DB.execute(
                  `UPDATE StudentGroup SET parent_group_id = NULL WHERE id = :child_id`,
                  { child_id: childGroupId }
                );
                await DB.execute(
                  `UPDATE StudentGroup SET parent_group_id = :parent_id WHERE id = :child_id`,
                  { parent_id: groupId, child_id: childGroupId }
                );

                // Также добавляем в таблицу иерархии
                try {
                  await DB.execute(
                    `INSERT INTO GroupHierarchy (child_group_id, parent_group_id) VALUES (:child_id, :parent_id)`,
                    { child_id: childGroupId, parent_id: groupId }
                  );
                } catch (e) {
                  console.log(
                    "Warning: Could not insert into GroupHierarchy:",
                    e
                  );
                }
              }

              console.log(
                `Set ${row.parent_group_ids.length} groups as children of group ${groupId}`
              );
            }

            // Добавляем студентов (остается тот же код)
            const attachedMembers: any[] = [];

            if (
              row.students &&
              Array.isArray(row.students) &&
              isValidArrayId(row.students) &&
              row.students.length > 0
            ) {
              const studentRows = await DB.query(
                "SELECT id FROM Student WHERE id IN (:students) AND school_id = :school_id;",
                {
                  students: row.students,
                  school_id: req.user.school_id,
                }
              );

              if (studentRows.length > 0) {
                const values = studentRows
                  .map((student: any) => `(${student.id}, ${groupId})`)
                  .join(", ");
                await DB.execute(
                  `INSERT INTO GroupMember(student_id, group_id) VALUES ${values}`
                );

                const studentList = await DB.query(
                  `SELECT 
              st.id,st.phone_number,st.email,
              st.student_number,st.given_name,st.family_name 
          FROM GroupMember AS gm
          INNER JOIN Student as st ON gm.student_id = st.id
          WHERE group_id = :group_id;`,
                  {
                    group_id: groupId,
                  }
                );

                attachedMembers.push(...studentList);
              }
            }

            inserted.push({ ...row, members: attachedMembers });
          }
        }
      } else if (action === "update") {
        for (const row of validResults) {
          if (!existingGroupNames.includes(row.name)) {
            errors.push({ row, errors: { name: "Group does not exist" } });
          } else {
            await DB.execute(
              `UPDATE StudentGroup SET
                            name = :name
                            WHERE name = :name`,
              {
                name: row.name,
              }
            );

            const group = await DB.query(
              `SELECT id FROM StudentGroup WHERE name = :name`,
              {
                name: row.name,
              }
            );
            const groupId = group[0].id;
            const attachedMembers: any[] = [];
            if (
              row.student_numbers &&
              Array.isArray(row.student_numbers) &&
              row.student_numbers.length > 0
            ) {
              const studentRows = await DB.query(
                `SELECT id
                                    FROM Student WHERE student_number IN (:students)
                                    GROUP BY id`,
                {
                  students: row.student_numbers,
                }
              );

              if (studentRows.length > 0) {
                await DB.execute(
                  `DELETE FROM GroupMember WHERE group_id = :group_id`,
                  {
                    group_id: groupId,
                  }
                );

                const values = studentRows
                  .map((student: any) => `(${groupId}, ${student.id})`)
                  .join(", ");
                await DB.execute(
                  `INSERT INTO GroupMember (group_id, student_id) VALUES ${values}`
                );

                const studentList = await DB.query(
                  `SELECT st.id,st.given_name, st.family_name
                                        FROM Student as st
                                        INNER JOIN GroupMember as gm
                                        ON gm.student_id = st.id AND gm.group_id = :group_id`,
                  {
                    group_id: groupId,
                  }
                );

                attachedMembers.push(...studentList);
              } else {
                errors.push({
                  row,
                  errors: { student_numbers: "Invalid student numbers" },
                });
              }
            }

            updated.push({ ...row, members: attachedMembers });
          }
        }
      } else if (action === "delete") {
        for (const row of validResults) {
          if (!existingGroupNames.includes(row.name)) {
            errors.push({ row, errors: { name: "Group does not exist" } });
          } else {
            await DB.execute(
              "DELETE FROM StudentGroup WHERE name = :name AND school_id = :school_id",
              {
                name: row.name,
                school_id: req.user.school_id,
              }
            );
            deleted.push(row);
          }
        }
      } else {
        return res
          .status(400)
          .json({
            error: "Bad Request",
            details: "Invalid action",
          })
          .end();
      }
      if (errors.length > 0) {
        let csvFile: Buffer | null = null;
        if (withCSVBool) {
          const csvData = errors.map((error: any) => ({
            name: error?.row?.name,
            student_numbers: error?.row?.student_numbers.join(", "),
          }));
          const csvContent = stringify(csvData, {
            header: true,
            columns: ["name", "student_numbers"],
          });
          // response headers for sending multipart files to send it with json response
          res.setHeader("Content-Type", "text/csv; charset=utf-8");
          res.setHeader(
            "Content-Disposition",
            "attachment; filename=errors.csv"
          );
          csvFile = Buffer.from("\uFEFF" + csvContent, "utf-8");
        }
        return res
          .status(400)
          .json({
            message: "CSV processed successfully but with errors",
            inserted: inserted,
            updated: updated,
            deleted: deleted,
            errors: errors.length > 0 ? errors : null,
            csvFile: csvFile,
          })
          .end();
      }
      return res
        .status(200)
        .json({
          message: "CSV processed successfully",
          inserted: inserted,
          updated: updated,
          deleted: deleted,
        })
        .end();
    } catch (e: any) {
      return res
        .status(500)
        .json({
          error: "Internal server error",
          details: e.message,
        })
        .end();
    }
  };

  createGroup = async (req: ExtendedRequest, res: Response) => {
    try {
      const { name, students, parent_group_ids }: CreateGroupRequest = req.body;

      console.log("Creating group with data:", { name, parent_group_ids });

      // Создать группу БЕЗ родительской группы сначала
      const groupInsert = await DB.execute(
        `INSERT INTO StudentGroup(name, created_at, school_id) 
       VALUE (:name, NOW(), :school_id);`,
        {
          name: name,
          school_id: req.user.school_id,
        }
      );

      const groupId = groupInsert.insertId;
      console.log("Created group with ID:", groupId);

      // ИСПРАВЛЕНО: Логика изменена - выбранные группы становятся ДОЧЕРНИМИ для новой группы
      if (
        parent_group_ids &&
        Array.isArray(parent_group_ids) &&
        parent_group_ids.length > 0
      ) {
        console.log("Setting child groups for new group:", parent_group_ids);

        // Проверяем все выбранные группы
        for (const childId of parent_group_ids) {
          const childGroupId = Number(childId);

          const childGroup = await DB.query(
            `SELECT id FROM StudentGroup WHERE id = :child_group_id AND school_id = :school_id`,
            { child_group_id: childGroupId, school_id: req.user.school_id }
          );
          if (childGroup.length === 0) {
            throw {
              status: 404,
              message: `Child group with id ${childId} not found`,
            };
          }

          // Сбрасываем все старые родительские связи ребёнка
          try {
            await DB.execute(
              `DELETE FROM GroupHierarchy WHERE child_group_id = :child_id`,
              { child_id: childGroupId }
            );
          } catch {}
          await DB.execute(
            `UPDATE StudentGroup SET parent_group_id = NULL WHERE id = :child_id`,
            { child_id: childGroupId }
          );

          // Устанавливаем новую группу как родительскую для выбранных групп
          await DB.execute(
            `UPDATE StudentGroup SET parent_group_id = :parent_id WHERE id = :child_id`,
            { parent_id: groupId, child_id: childGroupId }
          );

          // Также добавляем в таблицу иерархии
          try {
            await DB.execute(
              `INSERT INTO GroupHierarchy (child_group_id, parent_group_id) VALUES (:child_id, :parent_id)`,
              { child_id: childGroupId, parent_id: groupId }
            );
          } catch (e) {
            console.log("Warning: Could not insert into GroupHierarchy:", e);
          }
        }

        console.log(
          `Set ${parent_group_ids.length} groups as children of group ${groupId}`
        );
      }

      // Добавляем студентов (остается тот же код)
      const attachedMembers: any[] = [];

      if (
        students &&
        Array.isArray(students) &&
        isValidArrayId(students) &&
        students.length > 0
      ) {
        const studentRows = await DB.query(
          "SELECT id FROM Student WHERE id IN (:students) AND school_id = :school_id;",
          {
            students: students,
            school_id: req.user.school_id,
          }
        );

        if (studentRows.length > 0) {
          const values = studentRows
            .map((student: any) => `(${student.id}, ${groupId})`)
            .join(", ");
          await DB.execute(
            `INSERT INTO GroupMember(student_id, group_id) VALUES ${values}`
          );

          const studentList = await DB.query(
            `SELECT 
              st.id,st.phone_number,st.email,
              st.student_number,st.given_name,st.family_name 
          FROM GroupMember AS gm
          INNER JOIN Student as st ON gm.student_id = st.id
          WHERE group_id = :group_id;`,
            {
              group_id: groupId,
            }
          );

          attachedMembers.push(...studentList);
        }
      }

      return res
        .status(200)
        .json({
          group: {
            id: groupId,
            name: name,
            parent_group_id: null, // Новая группа не имеет родителя
            child_group_ids: parent_group_ids || [], // Выбранные группы стали дочерними
            members: attachedMembers,
          },
        })
        .end();
    } catch (e: any) {
      console.error("Error creating group:", e);
      if (e.status) {
        return res
          .status(e.status)
          .json({
            error: e.message,
          })
          .end();
      } else {
        return res
          .status(500)
          .json({
            error: "Internal server error",
          })
          .end();
      }
    }
  };

  groupEdit = async (req: ExtendedRequest, res: Response) => {
    try {
      const groupId = req.params.id;
      const { name, students, parent_group_ids }: EditGroupRequest = req.body;

      console.log("Editing group:", groupId, "with data:", {
        name,
        parent_group_ids,
      });

      if (!groupId || !isValidId(groupId)) {
        throw {
          status: 400,
          message: "Invalid or missing group id",
        };
      }

      // Проверяем существование группы
      const groupInfo = (await DB.query(
        `SELECT id, name, parent_group_id FROM StudentGroup 
       WHERE id = :id AND school_id = :school_id`,
        {
          id: groupId,
          school_id: req.user.school_id,
        }
      )) as GroupInfo[];

      if (groupInfo.length <= 0) {
        throw {
          status: 404,
          message: "Group not found",
        };
      }

      // ИСПРАВЛЕНО: Изменена логика - parent_group_ids теперь это дочерние группы
      if (
        parent_group_ids &&
        Array.isArray(parent_group_ids) &&
        parent_group_ids.length > 0
      ) {
        // Проверяем все выбранные группы (которые станут дочерними)
        for (const childId of parent_group_ids) {
          const childGroupId = Number(childId);

          if (!Number.isInteger(childGroupId) || childGroupId <= 0) {
            throw {
              status: 400,
              message: `Invalid child group id: ${childId}`,
            };
          }

          // Проверяем что дочерняя группа существует
          const childGroup = await DB.query(
            `SELECT id FROM StudentGroup WHERE id = :child_group_id AND school_id = :school_id`,
            {
              child_group_id: childGroupId,
              school_id: req.user.school_id,
            }
          );

          if (childGroup.length === 0) {
            throw {
              status: 404,
              message: `Child group with id ${childId} not found`,
            };
          }

          // Проверяем что не создаем циклическую зависимость
          if (childGroupId == Number(groupId)) {
            throw {
              status: 400,
              message: "Group cannot be child of itself",
            };
          }

          // Проверяем что текущая группа не является дочерней для выбранной группы
          const isCurrentChildOfSelected = await DB.query(
            `SELECT id FROM StudentGroup WHERE id = :current_id AND parent_group_id = :selected_id`,
            { current_id: groupId, selected_id: childGroupId }
          );

          if (isCurrentChildOfSelected.length > 0) {
            throw {
              status: 400,
              message: `Cannot set parent group ${childId} as child - would create cycle`,
            };
          }
        }
      }

      // Обновляем основную информацию группы (убираем parent_group_id, так как логика изменилась)
      await DB.execute(
        `UPDATE StudentGroup 
       SET name = :name 
       WHERE id = :id`,
        {
          name: name,
          id: groupId,
        }
      );

      // ИСПРАВЛЕНО: Сначала убираем текущую группу как родителя у всех её дочерних групп
      await DB.execute(
        `UPDATE StudentGroup SET parent_group_id = NULL WHERE parent_group_id = :group_id`,
        { group_id: groupId }
      );

      // Удаляем старые связи из таблицы иерархии
      try {
        await DB.execute(
          `DELETE FROM GroupHierarchy WHERE parent_group_id = :group_id`,
          { group_id: groupId }
        );
      } catch (e) {
        console.log("Warning: GroupHierarchy table may not exist:", e);
      }

      // ИСПРАВЛЕНО: Устанавливаем выбранные группы как дочерние
      if (
        parent_group_ids &&
        Array.isArray(parent_group_ids) &&
        parent_group_ids.length > 0
      ) {
        for (const childId of parent_group_ids) {
          // У ребёнка не должно остаться старых родителей
          try {
            await DB.execute(
              `DELETE FROM GroupHierarchy WHERE child_group_id = :child_id`,
              { child_id: Number(childId) }
            );
          } catch {}
          await DB.execute(
            `UPDATE StudentGroup SET parent_group_id = NULL WHERE id = :child_id`,
            { child_id: Number(childId) }
          );

          // Устанавливаем текущую группу как родительскую для выбранных групп
          await DB.execute(
            `UPDATE StudentGroup SET parent_group_id = :parent_id WHERE id = :child_id`,
            { parent_id: groupId, child_id: Number(childId) }
          );

          // Добавляем в таблицу иерархии
          try {
            await DB.execute(
              `INSERT INTO GroupHierarchy (child_group_id, parent_group_id) VALUES (:child_id, :parent_id)`,
              { child_id: Number(childId), parent_id: groupId }
            );
          } catch (e) {
            console.log("Warning: Could not insert into GroupHierarchy:", e);
          }
        }

        console.log(
          `Set ${parent_group_ids.length} groups as children of group ${groupId}`
        );
      }

      // Обновляем участников группы (остается тот же код)
      if (students && Array.isArray(students)) {
        await DB.execute(`DELETE FROM GroupMember WHERE group_id = :group_id`, {
          group_id: groupId,
        });

        if (students.length > 0 && isValidArrayId(students)) {
          const studentRows = await DB.query(
            "SELECT id FROM Student WHERE id IN (:students) AND school_id = :school_id;",
            {
              students: students,
              school_id: req.user.school_id,
            }
          );

          if (studentRows.length > 0) {
            const values = studentRows
              .map((student: any) => `(${student.id}, ${groupId})`)
              .join(", ");
            await DB.execute(
              `INSERT INTO GroupMember(student_id, group_id) VALUES ${values}`
            );
          }
        }
      }

      console.log(
        `Group ${groupId} updated with ${
          parent_group_ids?.length || 0
        } child groups`
      );

      return res
        .status(200)
        .json({
          message: "Group updated successfully",
          child_groups_count: parent_group_ids?.length || 0,
        })
        .end();
    } catch (e: any) {
      console.error("Error in groupEdit:", e);
      if (e.status) {
        return res
          .status(e.status)
          .json({
            error: e.message,
          })
          .end();
      } else {
        return res
          .status(500)
          .json({
            error: "Internal server error",
          })
          .end();
      }
    }
  };

  getGroupById = async (req: ExtendedRequest, res: Response) => {
    try {
      const groupId = req.params.id;

      if (!groupId || !isValidId(groupId)) {
        throw {
          status: 400,
          message: "Invalid or missing group id",
        };
      }

      const groupInfo = await DB.query(
        `SELECT id, name, parent_group_id, created_at FROM StudentGroup 
       WHERE id = :id AND school_id = :school_id`,
        {
          id: groupId,
          school_id: req.user.school_id,
        }
      );

      if (groupInfo.length <= 0) {
        throw {
          status: 404,
          message: "Group not found",
        };
      }

      // ИСПРАВЛЕНО: Используем безопасные методы получения связей
      const parentGroups = await this.getParentGroups(Number(groupId));
      const childGroups = await this.getChildGroups(Number(groupId));

      const members = await DB.query(
        `SELECT 
        st.id, st.phone_number, st.email,
        st.student_number, st.given_name, st.family_name 
       FROM GroupMember AS gm
       INNER JOIN Student as st ON gm.student_id = st.id
       WHERE group_id = :group_id;`,
        {
          group_id: groupId,
        }
      );

      return res
        .status(200)
        .json({
          group: {
            ...groupInfo[0],
            parent_group_ids: parentGroups.map((p: any) => p.id), // Добавляем массив ID родительских групп
          },
          members: members,
          parent_groups: parentGroups,
          child_groups: childGroups,
        })
        .end();
    } catch (e: any) {
      if (e.status) {
        return res
          .status(e.status)
          .json({
            error: e.message,
          })
          .end();
      } else {
        return res
          .status(500)
          .json({
            error: "Internal server error",
          })
          .end();
      }
    }
  };

  groupFilter = async (req: ExtendedRequest, res: Response) => {
    try {
      const { page = 1, name = "", limit = 10 } = req.query;

      // ИСПРАВЛЕНИЕ: Приводим типы к числам
      const pageNum = Number(page);
      const limitNum = Number(limit);
      const offset = (pageNum - 1) * limitNum;
      const searchQuery = name ? `%${name}%` : "%";

      const groups = await DB.query(
        `SELECT 
        sg.id, 
        sg.name, 
        sg.created_at,
        COUNT(DISTINCT gm.student_id) as member_count
       FROM StudentGroup sg
       LEFT JOIN GroupMember gm ON sg.id = gm.group_id
       WHERE sg.school_id = :school_id AND sg.name LIKE :search
       GROUP BY sg.id, sg.name, sg.created_at
       ORDER BY sg.created_at DESC
       LIMIT :limit OFFSET :offset`,
        {
          school_id: req.user.school_id,
          search: searchQuery,
          limit: limitNum,
          offset: offset,
        }
      );

      // ИСПРАВЛЕНО: Получаем связи для каждой группы безопасно
      for (const group of groups) {
        group.parent_groups = await this.getParentGroups(group.id);
        group.child_groups = await this.getChildGroups(group.id);
      }

      const totalGroups = (
        await DB.query(
          `SELECT COUNT(DISTINCT sg.id) as total
       FROM StudentGroup sg
       LEFT JOIN GroupMember gm ON sg.id = gm.group_id
       WHERE sg.school_id = :school_id AND sg.name LIKE :search`,
          {
            school_id: req.user.school_id,
            search: searchQuery,
          }
        )
      )[0].total;

      const totalPages = Math.ceil(Number(totalGroups) / limitNum);

      const pagination = {
        current_page: pageNum,
        per_page: limitNum,
        total_pages: totalPages,
        total_items: Number(totalGroups),
        next_page: pageNum < totalPages ? pageNum + 1 : null,
        prev_page: pageNum > 1 ? pageNum - 1 : null,
        links: generatePaginationLinks(pageNum, totalPages),
      };

      return res
        .status(200)
        .json({
          groups: groups,
          pagination: pagination,
        })
        .end();
    } catch (e: any) {
      return res
        .status(500)
        .json({
          error: "Internal server error",
          details: e.message,
        })
        .end();
    }
  };

  // ДОБАВЛЕНО: Метод groupByIds
  groupByIds = async (req: ExtendedRequest, res: Response) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw {
          status: 400,
          message: "Invalid or missing group ids",
        };
      }

      // Проверяем что все ID валидные
      for (const id of ids) {
        if (!isValidId(id)) {
          throw {
            status: 400,
            message: `Invalid group id: ${id}`,
          };
        }
      }

      const groups = await DB.query(
        `SELECT 
          sg.id, 
          sg.name, 
          sg.created_at,
          sg.parent_group_id,
          COUNT(DISTINCT gm.student_id) as member_count
         FROM StudentGroup sg
         LEFT JOIN GroupMember gm ON sg.id = gm.group_id
         WHERE sg.id IN (:ids) AND sg.school_id = :school_id
         GROUP BY sg.id, sg.name, sg.created_at, sg.parent_group_id`,
        {
          ids: ids,
          school_id: req.user.school_id,
        }
      );

      // Получаем связи для каждой группы безопасно
      for (const group of groups) {
        group.parent_groups = await this.getParentGroups(group.id);
        group.child_groups = await this.getChildGroups(group.id);
      }

      return res
        .status(200)
        .json({
          groups: groups,
        })
        .end();
    } catch (e: any) {
      if (e.status) {
        return res
          .status(e.status)
          .json({
            error: e.message,
          })
          .end();
      } else {
        return res
          .status(500)
          .json({
            error: "Internal server error",
          })
          .end();
      }
    }
  };

  // ДОБАВЛЕНО: Метод groupDelete
  groupDelete = async (req: ExtendedRequest, res: Response) => {
    try {
      const groupId = req.params.id;

      if (!groupId || !isValidId(groupId)) {
        throw { status: 400, message: "Invalid or missing group id" };
      }

      // Проверяем существование группы
      const groupInfo = await DB.query(
        `SELECT id, name FROM StudentGroup 
         WHERE id = :id AND school_id = :school_id`,
        { id: groupId, school_id: req.user.school_id }
      );
      if (groupInfo.length <= 0) {
        throw { status: 404, message: "Group not found" };
      }

      // 1) Отвязываем дочерние группы (если есть)
      const childGroups = await DB.query(
        `SELECT id FROM StudentGroup WHERE parent_group_id = :group_id`,
        { group_id: groupId }
      );
      if (childGroups.length > 0) {
        await DB.execute(
          `UPDATE StudentGroup SET parent_group_id = NULL WHERE parent_group_id = :group_id`,
          { group_id: groupId }
        );
      }
      // Удаляем строки из таблицы иерархии (если она есть)
      try {
        await DB.execute(
          `DELETE FROM GroupHierarchy WHERE parent_group_id = :group_id OR child_group_id = :group_id`,
          { group_id: groupId }
        );
      } catch {
        // таблицы может не быть — игнорируем
      }

      // 2) Очистка связей в сообщениях
      try {
        // Групповые цели для видимости
        await DB.execute(`DELETE FROM GroupPost WHERE group_id = :group_id`, {
          group_id: groupId,
        });
      } catch {}
      try {
        // Исторические получатели постов — сохраняем, но без привязки к группе
        await DB.execute(
          `UPDATE PostStudent SET group_id = NULL WHERE group_id = :group_id`,
          { group_id: groupId }
        );
      } catch {}

      // 3) Удаляем участников группы
      await DB.execute(`DELETE FROM GroupMember WHERE group_id = :group_id`, {
        group_id: groupId,
      });

      // 4) Удаляем саму группу
      await DB.execute(
        `DELETE FROM StudentGroup WHERE id = :id AND school_id = :school_id`,
        { id: groupId, school_id: req.user.school_id }
      );

      return res
        .status(200)
        .json({
          message: "Group deleted successfully",
          deleted_group: groupInfo[0],
          detached_children_count: childGroups.length || 0,
        })
        .end();
    } catch (e: any) {
      if (e.status) {
        return res.status(e.status).json({ error: e.message }).end();
      }
      return res.status(500).json({ error: "Internal server error" }).end();
    }
  };

  // ДОБАВЛЕНО: Метод для получения иерархии групп
  groupHierarchy = async (req: ExtendedRequest, res: Response) => {
    try {
      const { group_ids } = req.body;

      if (!group_ids || !Array.isArray(group_ids) || group_ids.length === 0) {
        throw {
          status: 400,
          message: "Invalid or missing group ids",
        };
      }

      // ИСПРАВЛЕНО: Правильная типизация для результата
      const result: {
        groups: any[];
        hierarchy_summary: {
          original_groups: any[];
          child_groups: any[];
          parent_groups: any[];
          total_affected_groups: number;
        };
      } = {
        groups: [],
        hierarchy_summary: {
          original_groups: [],
          child_groups: [],
          parent_groups: [],
          total_affected_groups: 0,
        },
      };

      // Получаем информацию об изначально выбранных группах
      const originalGroups = await DB.query(
        `SELECT id, name FROM StudentGroup 
         WHERE id IN (:group_ids) AND school_id = :school_id`,
        {
          group_ids: group_ids,
          school_id: req.user.school_id,
        }
      );

      result.hierarchy_summary.original_groups = originalGroups;

      // ИСПРАВЛЕНО: Правильная типизация массивов
      let allChildGroups: any[] = [];
      let allParentGroups: any[] = [];

      for (const groupId of group_ids) {
        // Получаем дочерние группы
        const childGroups = await getAllChildGroups(Number(groupId));
        if (childGroups.length > 0) {
          const childGroupsData = await DB.query(
            `SELECT id, name FROM StudentGroup WHERE id IN (:child_ids)`,
            { child_ids: childGroups }
          );
          allChildGroups = [...allChildGroups, ...childGroupsData];
        }

        // Получаем родительские группы (для информации)
        const parentGroups = await getAllParentGroups(Number(groupId));
        if (parentGroups.length > 0) {
          const parentGroupsData = await DB.query(
            `SELECT id, name FROM StudentGroup WHERE id IN (:parent_ids)`,
            { parent_ids: parentGroups }
          );
          allParentGroups = [...allParentGroups, ...parentGroupsData];
        }
      }

      // Убираем дубликаты
      const uniqueChildGroups = allChildGroups.filter(
        (group, index, self) =>
          index === self.findIndex((g) => g.id === group.id)
      );
      const uniqueParentGroups = allParentGroups.filter(
        (group, index, self) =>
          index === self.findIndex((g) => g.id === group.id)
      );

      result.hierarchy_summary.child_groups = uniqueChildGroups;
      result.hierarchy_summary.parent_groups = uniqueParentGroups;
      result.hierarchy_summary.total_affected_groups =
        originalGroups.length + uniqueChildGroups.length;

      // Формируем полный список групп с метаданными
      result.groups = [
        ...originalGroups.map((g: any) => ({
          ...g,
          isOriginallySelected: true,
          isChildGroup: false,
          isParentGroup: false,
        })),
        ...uniqueChildGroups.map((g: any) => ({
          ...g,
          isOriginallySelected: false,
          isChildGroup: true,
          isParentGroup: false,
        })),
        ...uniqueParentGroups.map((g: any) => ({
          ...g,
          isOriginallySelected: false,
          isChildGroup: false,
          isParentGroup: true,
        })),
      ];

      return res.status(200).json(result).end();
    } catch (e: any) {
      console.error("Error in groupHierarchy:", e);
      if (e.status) {
        return res.status(e.status).json({ error: e.message }).end();
      } else {
        return res.status(500).json({ error: "Internal server error" }).end();
      }
    }
  };

  // ИСПРАВЛЕНО: Алиасы методов создаются ПОСЛЕ определения основных методов
  getGroups = this.groupFilter;
  getGroup = this.getGroupById;
}

export default GroupController;
