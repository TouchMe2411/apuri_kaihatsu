import { IController } from "../utils/icontroller";
import express, { Router, Response } from "express";
import DB from "../utils/db-client";
import { verifyToken, type ExtendedRequest } from "../middlewares/auth";
import {
  isValidString,
  isValidArrayId,
  isValidPriority,
  isValidId,
} from "../utils/validate";
import process from "node:process";
import { generatePaginationLinks } from "../utils/helper";

type MessageLocale = "en" | "ru" | "ja" | "uz";
type MessageCode =
  | "STUDENTS_WITHOUT_PARENTS"
  | "GROUP_STUDENTS_WITHOUT_PARENTS";

const messages: Record<MessageLocale, Record<MessageCode, string>> = {
  en: {
    STUDENTS_WITHOUT_PARENTS: `The following students are not registered with parents: ${"{studentNames}"}`,
    GROUP_STUDENTS_WITHOUT_PARENTS: `The following students in selected groups are not registered with parents: ${"{studentNames}"}`,
  },
  ru: {
    STUDENTS_WITHOUT_PARENTS: `Следующие студенты не зарегистрированы в parents: ${"{studentNames}"}`,
    GROUP_STUDENTS_WITHOUT_PARENTS: `Следующие студенты в выбранных группах не зарегистрированы в parents: ${"{studentNames}"}`,
  },
  ja: {
    STUDENTS_WITHOUT_PARENTS: `次の学生は保護者に登録されていません: ${"{studentNames}"}`,
    GROUP_STUDENTS_WITHOUT_PARENTS: `選択されたグループの次の学生は保護者に登録されていません: ${"{studentNames}"}`,
  },
  uz: {
    STUDENTS_WITHOUT_PARENTS: `Quyidagi talabalar ota-onalar bilan ro'yxatdan o'tmagan: ${"{studentNames}"}`,
    GROUP_STUDENTS_WITHOUT_PARENTS: `Tanlangan guruhlardagi quyidagi talabalar ota-onalar bilan ro'yxatdan o'tmagan: ${"{studentNames}"}`,
  },
};

const getErrorMessage = (
  locale: MessageLocale,
  code: MessageCode,
  studentNames: string
): string => {
  // на вход передаём уже готовую studentNames, поэтому здесь подставляем его
  const template = messages[locale]?.[code] ?? messages.en[code];
  return template.replace("{studentNames}", studentNames);
};

// ИСПРАВЛЕНО: Функции вне класса с правильной типизацией
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

// Add a reusable type for read statuses
type ParentReadStatus = {
  id: number;
  given_name: string;
  family_name: string;
  viewed_at: Date | string | null;
  post_student_id: number;
};

class StudentController implements IController {
  public router: Router = express.Router();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.post("/post/create", verifyToken, this.createPost);
    this.router.get("/post/list", verifyToken, this.postList);
    this.router.get("/post/scheduled", verifyToken, this.scheduledPostingList);

    this.router.get("/post/:id", verifyToken, this.postView);
    this.router.get("/post/:id/recipients", verifyToken, this.postRecipients);
    this.router.put("/post/:id", verifyToken, this.postUpdate);
    this.router.delete("/post/:id", verifyToken, this.postDelete);

    this.router.get("/post/:id/students", verifyToken, this.postViewStudents);
    this.router.get(
      "/post/:id/student/:student_id",
      verifyToken,
      this.postStudentParent
    );

    this.router.get("/post/:id/groups", verifyToken, this.postViewGroups);
    this.router.get(
      "/post/:id/group/:group_id",
      verifyToken,
      this.postGroupStudents
    );
    this.router.get(
      "/post/:id/group/:group_id/student/:student_id",
      verifyToken,
      this.postGroupStudentParent
    );

    this.router.post(
      "/post/:id/groups/:group_id",
      verifyToken,
      this.groupRetryPush
    );
    this.router.post(
      "/post/:id/students/:student_id",
      verifyToken,
      this.studentRetryPush
    );
    this.router.post(
      "/post/:id/parents/:parent_id",
      verifyToken,
      this.parentRetryPush
    );
    this.router.get("/post/groups-filter", verifyToken, this.groupsForFilter); // NEW
  }

  // NEW: groups used in posts (distinct, only current school)
  groupsForFilter = async (req: ExtendedRequest, res: Response) => {
    try {
      const schoolId = req.user.school_id;
      const groups = await DB.query(
        `SELECT DISTINCT sg.id, sg.name
         FROM PostStudent ps
         INNER JOIN StudentGroup sg ON sg.id = ps.group_id
         INNER JOIN Post p ON p.id = ps.post_id
         WHERE p.school_id = ?
         ORDER BY sg.name ASC`,
        [schoolId]
      );
      return res.status(200).json({ groups }).end();
    } catch (e) {
      return res.status(500).json({ error: "Internal server error" }).end();
    }
  };

  // ИСПРАВЛЕНО: Убрал дублированные функции из класса и исправил единственный createPost
  createPost = async (req: ExtendedRequest, res: Response) => {
    try {
      const {
        title,
        description,
        priority,
        students,
        groups,
        delivery_at,
        excluded_groups,
      } = req.body;

      // Получаем язык из заголовков запроса и приводим к MessageLocale
      const acceptLang =
        req.headers["accept-language"]?.split(",")[0]?.split("-")[0] || "en";
      const locale: MessageLocale = (
        ["en", "ru", "ja", "uz"] as MessageLocale[]
      ).includes(acceptLang as MessageLocale)
        ? (acceptLang as MessageLocale)
        : "en";

      if (!title || !isValidString(title))
        throw { status: 401, message: "Invalid or missing title" };
      if (!description || !isValidString(description))
        throw { status: 401, message: "Invalid or missing description" };
      if (!priority || !isValidPriority(priority))
        throw { status: 401, message: "Invalid or missing priority" };
      if (
        (!students || students.length === 0) &&
        (!groups || groups.length === 0)
      )
        throw { status: 401, message: "No recipients specified" };

      // ИСПРАВЛЕНО: Расширяем список групп с учетом иерархии
      let allTargetGroups: number[] = [];
      if (groups && Array.isArray(groups) && groups.length > 0) {
        allTargetGroups = await gatherTargetGroupIds(
          req.user.school_id,
          groups,
          excluded_groups
        );
      }

      // Проверка привязки студентов к родителям
      if (students?.length) {
        const studentsWithoutParents = await DB.query(
          `SELECT s.id, s.given_name, s.family_name, s.student_number
         FROM Student s
         WHERE s.id IN (:students)
           AND s.school_id = :school_id
           AND NOT EXISTS (
             SELECT 1 FROM StudentParent sp WHERE sp.student_id = s.id
           )`,
          { students, school_id: req.user.school_id }
        );

        if (studentsWithoutParents.length > 0) {
          const studentNames = studentsWithoutParents
            .map(
              (s: any) =>
                `${s.given_name} ${s.family_name} (${s.student_number})`
            )
            .join(", ");
          const errorMessage = getErrorMessage(
            locale,
            "STUDENTS_WITHOUT_PARENTS",
            studentNames
          );
          throw {
            status: 400,
            message: errorMessage,
            code: "STUDENTS_WITHOUT_PARENTS",
            students: studentsWithoutParents,
          };
        }
      }

      // ИСПРАВЛЕНО: Проверка для расширенного списка групп
      if (allTargetGroups.length > 0) {
        const groupStudentsWithoutParents = await DB.query(
          `SELECT s.id, s.given_name, s.family_name, s.student_number, sg.name as group_name
         FROM Student s 
         INNER JOIN GroupMember gm ON s.id = gm.student_id
         INNER JOIN StudentGroup sg ON gm.group_id = sg.id
         WHERE sg.id IN (:groups) 
         AND sg.school_id = :school_id
         AND NOT EXISTS (
           SELECT 1 FROM StudentParent sp WHERE sp.student_id = s.id
         )`,
          { groups: allTargetGroups, school_id: req.user.school_id }
        );

        if (groupStudentsWithoutParents.length > 0) {
          const studentInfo = groupStudentsWithoutParents
            .map((s: any) => {
              const groupText =
                locale === "en"
                  ? `from group "${s.group_name}"`
                  : locale === "ru"
                  ? `из группы "${s.group_name}"`
                  : locale === "ja"
                  ? `グループ「${s.group_name}」から`
                  : locale === "uz"
                  ? `"${s.group_name}" guruhidan`
                  : `from group "${s.group_name}"`;

              return `${s.given_name} ${s.family_name} (${s.student_number}) ${groupText}`;
            })
            .join(", ");

          const errorMessage = getErrorMessage(
            locale,
            "GROUP_STUDENTS_WITHOUT_PARENTS",
            studentInfo
          );

          throw {
            status: 400,
            message: errorMessage,
            code: "GROUP_STUDENTS_WITHOUT_PARENTS",
            students: groupStudentsWithoutParents,
          };
        }
      }

      // Handle delivery_at
      let deliveryAtValue = null;
      if (delivery_at) {
        if (delivery_at.includes("|")) {
          const [datePart, timePart] = delivery_at.split("|");
          const [year, month, day] = datePart.split("-");
          const [hour, minute] = timePart.split(":");
          const adjustedHour = (parseInt(hour) + 5) % 24;
          deliveryAtValue = `${year}-${month}-${day} ${String(
            adjustedHour
          ).padStart(2, "0")}:${minute}:00`;
        } else {
          const deliveryDate = new Date(delivery_at);
          deliveryAtValue = deliveryDate
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");
        }
      }

      const isProcessed = deliveryAtValue ? 0 : 1;

      // Insert into Post
      let insertQuery = `
          INSERT INTO Post (title, description, priority, admin_id, school_id, is_processed`;
      if (deliveryAtValue) insertQuery += `, delivery_at`;
      insertQuery += `) VALUE (:title, :description, :priority, :admin_id, :school_id, :is_processed`;
      if (deliveryAtValue) insertQuery += `, :delivery_at`;
      insertQuery += `);`;

      const params: any = {
        title,
        description,
        priority,
        admin_id: req.user.id,
        school_id: req.user.school_id,
        is_processed: isProcessed,
      };
      if (deliveryAtValue) params.delivery_at = deliveryAtValue;

      const postInsert = await DB.execute(insertQuery, params);
      const postId = postInsert.insertId;

      // Индивидуальные студенты
      if (
        students &&
        Array.isArray(students) &&
        isValidArrayId(students) &&
        students.length > 0
      ) {
        const studentList = await DB.query(
          `SELECT id FROM Student WHERE id IN (:students)`,
          { students }
        );
        for (const student of studentList) {
          await DB.execute(
            `INSERT INTO PostStudent (post_id, student_id) VALUE (:post_id, :student_id)`,
            { post_id: postId, student_id: student.id }
          );
        }
      }

      // НОВОЕ: сохраняем таргетированные группы (видимость поста, даже если в группе 0 студентов)
      if (allTargetGroups.length > 0) {
        await insertGroupPost(postId, allTargetGroups);
        // Добавляем студентов из этих групп
        await insertPostStudentForGroups(
          postId,
          req.user.school_id,
          allTargetGroups
        );
      }

      // For immediate posts, insert into PostParent immediately.
      // For scheduled posts, delay this until the scheduled time.
      if (!deliveryAtValue) {
        const postStudentIds = await DB.query(
          `SELECT id, student_id FROM PostStudent WHERE post_id = :post_id`,
          { post_id: postId }
        );
        for (const ps of postStudentIds) {
          const studentAttachList = await DB.query(
            `SELECT sp.parent_id FROM StudentParent AS sp WHERE sp.student_id = :student_id`,
            { student_id: ps.student_id }
          );
          if (studentAttachList.length > 0) {
            const values = studentAttachList
              .map((parent: any) => `(${ps.id}, ${parent.parent_id})`)
              .join(", ");
            await DB.execute(
              `INSERT INTO PostParent (post_student_id, parent_id) VALUES ${values}`
            );
          }
        }
      }

      return res
        .status(200)
        .json({
          post: {
            id: postId,
            title,
            description,
            priority,
            target_groups: allTargetGroups, // Возвращаем все целевые группы
            original_groups: groups || [], // Возвращаем изначально выбранные группы
          },
        })
        .end();
    } catch (e: any) {
      if (e.status)
        return res
          .status(e.status)
          .json({
            error: e.message,
            code: e.code || "GENERAL_ERROR",
            students: e.students || [],
          })
          .end();
      return res.status(500).json({ error: "Internal server error" }).end();
    }
  };

  groupRetryPush = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      const groupId = req.params.group_id;

      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }
      if (!groupId || !isValidId(groupId)) {
        throw {
          status: 401,
          message: "Invalid or missing group id",
        };
      }

      const postInfo = await DB.query(
        `SELECT po.id, ps.group_id
                FROM PostStudent AS ps
                INNER JOIN Post AS po ON
                    po.id = ps.post_id
                WHERE ps.post_id = :post_id
                    AND ps.group_id = :group_id
                    AND po.school_id = :school_id`,
        {
          post_id: postId,
          group_id: groupId,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const post = postInfo[0];

      await DB.execute(
        `UPDATE PostParent
                SET push = 0
                WHERE post_student_id IN (
                    SELECT id
                    FROM PostStudent
                    WHERE post_id = :post_id AND group_id = :group_id
                ) AND viewed_at IS NULL`,
        {
          post_id: post.id,
          group_id: post.group_id,
        }
      );

      return res
        .status(200)
        .json({
          message: "Post Notification replayed successfully",
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

  createSchedulePost = async (req: ExtendedRequest, res: Response) => {
    try {
      const {
        title,
        description,
        priority,
        students,
        groups,
        delivery_at,
        excluded_groups,
      } = req.body;

      if (!title || !isValidString(title))
        throw { status: 401, message: "Invalid or missing title" };
      if (!description || !isValidString(description))
        throw { status: 401, message: "Invalid or missing description" };
      if (!priority || !isValidPriority(priority))
        throw { status: 401, message: "Invalid or missing priority" };
      if (
        (!students || students.length === 0) &&
        (!groups || groups.length === 0)
      )
        throw { status: 401, message: "No recipients specified" };

      let deliveryAtValue: string | null = null;
      if (typeof delivery_at === "string" && delivery_at.includes("|")) {
        const [d, t] = delivery_at.split("|");
        deliveryAtValue = `${d} ${t}:00`;
      }
      const isProcessed = deliveryAtValue ? 0 : 1;

      // Создаём пост
      let insertQuery = `
      INSERT INTO Post (title, description, priority, admin_id, school_id, is_processed`;
      if (deliveryAtValue) insertQuery += `, delivery_at`;
      insertQuery += `) VALUE (:title, :description, :priority, :admin_id, :school_id, :is_processed`;
      if (deliveryAtValue) insertQuery += `, :delivery_at`;
      insertQuery += `);`;

      const params: any = {
        title,
        description,
        priority,
        admin_id: req.user.id,
        school_id: req.user.school_id,
        is_processed: isProcessed,
      };
      if (deliveryAtValue) params.delivery_at = deliveryAtValue;

      const postInsert = await DB.execute(insertQuery, params);
      const postId = postInsert.insertId;

      // Индивидуальные студенты
      if (Array.isArray(students) && students.length > 0) {
        const ids = students
          .map((v: any) => Number(v))
          .filter((n: number) => Number.isFinite(n) && n > 0);
        if (ids.length) {
          const values = ids
            .map((sid: number) => `(${postId}, ${sid}, NULL)`)
            .join(", ");
          await DB.execute(
            `INSERT INTO PostStudent (post_id, student_id, group_id) VALUES ${values}`
          );
        }
      }

      // Группы + их потомки
      const allTargetGroups = await gatherTargetGroupIds(
        req.user.school_id,
        groups,
        excluded_groups
      );

      // Сохраняем таргетированные группы (видимость поста при фильтре "Groups", даже без студентов)
      await insertGroupPost(postId, allTargetGroups);

      // Добавляем студентов из этих групп
      await insertPostStudentForGroups(
        postId,
        req.user.school_id,
        allTargetGroups
      );

      // Для немедленных постов создаём PostParent
      if (!deliveryAtValue) {
        await DB.execute(
          `INSERT INTO PostParent (post_student_id, parent_id, viewed_at, push)
         SELECT ps.id, sp.parent_id, NULL, 0
         FROM PostStudent ps
         INNER JOIN StudentParent sp ON sp.student_id = ps.student_id
         WHERE ps.post_id = :post_id`,
          { post_id: postId }
        );
      }

      return res
        .status(200)
        .json({
          post: {
            id: postId,
            title,
            description,
            priority,
            target_groups: allTargetGroups,
            original_groups: Array.isArray(groups) ? groups : [],
          },
        })
        .end();
    } catch (e: any) {
      if (e.status)
        return res
          .status(e.status)
          .json({
            error: e.message,
            code: e.code || "GENERAL_ERROR",
            students: e.students || [],
          })
          .end();
      return res.status(500).json({ error: "Internal server error" }).end();
    }
  };

  studentRetryPush = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      const student_id = req.params.student_id;

      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }
      if (!student_id || !isValidId(student_id)) {
        throw {
          status: 401,
          message: "Invalid or missing student id",
        };
      }

      const postInfo = await DB.query(
        `SELECT po.id, ps.student_id
                    FROM PostStudent AS ps
                    INNER JOIN Post AS po ON
                        po.id = ps.post_id
                    WHERE ps.post_id = :post_id
                        AND ps.student_id = :student_id
                        AND po.school_id = :school_id`,
        {
          post_id: postId,
          student_id: student_id,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const post = postInfo[0];

      await DB.execute(
        `UPDATE PostParent
                SET push = 0
                WHERE post_student_id IN (
                    SELECT id
                    FROM PostStudent
                    WHERE post_id = :post_id AND student_id = :student_id
                ) AND viewed_at IS NULL`,
        {
          post_id: post.id,
          student_id: post.student_id,
        }
      );

      return res
        .status(200)
        .json({
          message: "Post Notification replayed successfully",
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

  parentRetryPush = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      const parent_id = req.params.parent_id;

      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }
      if (!parent_id || !isValidId(parent_id)) {
        throw {
          status: 401,
          message: "Invalid or missing parent id",
        };
      }

      const postInfo = await DB.query(
        `SELECT 
                    pp.parent_id, po.id
                FROM PostStudent AS ps
                INNER JOIN Post AS po ON
                    po.id = ps.post_id
                INNER JOIN PostParent AS pp ON
                    ps.id = pp.post_student_id
                WHERE ps.post_id = :post_id
                    AND po.school_id = :school_id
                    AND pp.parent_id = :parent_id`,
        {
          post_id: postId,
          parent_id: parent_id,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const post = postInfo[0];

      await DB.execute(
        `UPDATE PostParent
         SET push = 0
         WHERE post_student_id IN (
           SELECT id FROM PostStudent WHERE post_id = :post_id
         ) AND parent_id = :parent_id AND viewed_at IS NULL`,
        {
          post_id: post.id,
          parent_id: post.parent_id,
        }
      );

      return res
        .status(200)
        .json({ message: "Post Notification replayed successfully" })
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

  postDelete = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;

      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }
      const postInfo = await DB.query(
        `SELECT 
                    id, title, description, priority FROM Post
                    WHERE school_id = :school_id AND id = :id`,
        {
          id: postId,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      await DB.execute("DELETE FROM Post WHERE id = :id;", {
        id: postId,
      });

      return res
        .status(200)
        .json({
          message: "Post deleted successfully",
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
  postUpdate = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;

      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }
      const {
        title,
        description,
        priority,
        delivery_date,
        delivery_time,
        students,
        groups,
        excluded_groups,
      } = req.body;

      if (!title || !isValidString(title)) {
        throw {
          status: 401,
          message: "Invalid or missing title",
        };
      }
      if (!description || !isValidString(description)) {
        throw {
          status: 401,
          message: "Invalid or missing description",
        };
      }
      if (!priority || !isValidPriority(priority)) {
        throw {
          status: 401,
          message: "Invalid or missing priority",
        };
      }

      // В методе postUpdate замените логику обработки времени:
      let delivery_at = null;
      if (delivery_date && delivery_time) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        const timeRegex = /^\d{2}:\d{2}$/;

        if (!dateRegex.test(delivery_date)) {
          throw {
            status: 400,
            message: "Invalid delivery_date format. Expected YYYY-MM-DD",
          };
        }

        if (!timeRegex.test(delivery_time)) {
          throw {
            status: 400,
            message: "Invalid delivery_time format. Expected HH:MM",
          };
        }

        // Проверка на будущее время БЕЗ создания объекта Date (чтобы избежать UTC преобразования)
        const now = new Date();
        const todayString = now.toISOString().split("T")[0]; // YYYY-MM-DD
        const currentTimeString = now
          .toTimeString()
          .split(" ")[0]
          .substring(0, 5); // HH:MM

        // Простое строковое сравнение для сегодняшней даты
        if (
          delivery_date === todayString &&
          delivery_time <= currentTimeString
        ) {
          throw {
            status: 400,
            message: "Scheduled delivery time must be in the future",
          };
        }

        // Проверка на прошедшие даты
        if (delivery_date < todayString) {
          throw {
            status: 400,
            message: "Cannot schedule delivery for past dates",
          };
        }

        // Сохраняем время ТОЧНО как ввел пользователь, БЕЗ преобразований
        delivery_at = `${delivery_date} ${delivery_time}:00`;
      }

      const postInfo = await DB.query(
        `SELECT 
                    id, title, description, priority FROM Post
                    WHERE school_id = :school_id AND id = :id`,
        {
          id: postId,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      } // Update the post
      const updateQuery = delivery_at
        ? `UPDATE Post 
           SET title = :title, 
               description = :description, 
               priority = :priority, 
               delivery_at = :delivery_at,
               is_processed = 0,
               edited_at = NOW()
           WHERE id = :id AND school_id = :school_id`
        : `UPDATE Post 
           SET title = :title, 
               description = :description, 
               priority = :priority, 
               delivery_at = NULL,
               is_processed = 1,
               edited_at = NOW()
           WHERE id = :id AND school_id = :school_id`;

      const updateParams: any = {
        id: postId,
        title,
        description,
        priority,
        school_id: req.user.school_id,
      };

      if (delivery_at) {
        updateParams.delivery_at = delivery_at;
      }
      await DB.execute(updateQuery, updateParams);

      // Update recipients if provided
      if (students !== undefined || groups !== undefined) {
        // Сбросить текущих получателей
        await DB.execute(`DELETE FROM PostStudent WHERE post_id = :post_id`, {
          post_id: postId,
        });
        await DB.execute(`DELETE FROM GroupPost WHERE post_id = :post_id`, {
          post_id: postId,
        });
        // Add new student recipients
        if (
          students &&
          Array.isArray(students) &&
          isValidArrayId(students) &&
          students.length > 0
        ) {
          const studentList = await DB.query(
            `SELECT id FROM Student WHERE id IN (:students) AND school_id = :school_id`,
            { students, school_id: req.user.school_id }
          );
          for (const student of studentList) {
            await DB.execute(
              `INSERT INTO PostStudent (post_id, student_id) VALUES (:post_id, :student_id)`,
              { post_id: postId, student_id: student.id }
            );
          }
        }

        // Add new group recipients
        if (
          groups &&
          Array.isArray(groups) &&
          isValidArrayId(groups) &&
          groups.length > 0
        ) {
          const allTargetGroups = await gatherTargetGroupIds(
            req.user.school_id,
            groups,
            excluded_groups
          );
          await insertGroupPost(Number(postId), allTargetGroups);
          await insertPostStudentForGroups(
            Number(postId),
            req.user.school_id,
            allTargetGroups
          );
        }
      }

      // Reset push notifications for this post
      await DB.execute(
        `UPDATE PostParent
                SET push = 0
                WHERE post_student_id IN (
                    SELECT id
                    FROM PostStudent
                    WHERE post_id = :post_id
                )`,
        {
          post_id: postId,
        }
      );

      return res
        .status(200)
        .json({
          message: "Post edited successfully",
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

  postGroupStudentParent = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }

      const groupId = req.params.group_id;
      if (!groupId || !isValidId(groupId)) {
        throw {
          status: 401,
          message: "Invalid or missing group id",
        };
      }

      const studentId = req.params.student_id;
      if (!studentId || !isValidId(studentId)) {
        throw {
          status: 401,
          message: "Invalid or missing student id",
        };
      }

      const studentAndGroupInfo = await DB.query(
        `SELECT
                    st.id, st.email,
                    st.phone_number,
                    st.given_name,
                    st.family_name,
                    st.student_number,
                    ps.id AS post_student_id,
                    sg.id AS group_id,sg.name AS group_name
                FROM PostStudent AS ps
                INNER JOIN Student AS st ON ps.student_id = st.id
                INNER JOIN StudentGroup AS sg ON ps.group_id = sg.id
                WHERE ps.student_id = :student_id
                AND ps.post_id = :post_id
                AND st.school_id = :school_id
                AND ps.group_id = :group_id`,
        {
          student_id: studentId,
          post_id: postId,
          school_id: req.user.school_id,
          group_id: groupId,
        }
      );

      if (studentAndGroupInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const student = {
        id: studentAndGroupInfo[0].id,
        email: studentAndGroupInfo[0].email,
        phone_number: studentAndGroupInfo[0].phone_number,
        given_name: studentAndGroupInfo[0].given_name,
        family_name: studentAndGroupInfo[0].family_name,
        student_number: studentAndGroupInfo[0].student_number,
      };
      const group = {
        id: studentAndGroupInfo[0].group_id,
        name: studentAndGroupInfo[0].group_name,
      };

      const postStudentId = studentAndGroupInfo[0].post_student_id;

      const parentsPost = await DB.query(
        `SELECT
                    pa.id, pa.email, pa.phone_number,
                    pa.given_name, pa.family_name,
                    ps.viewed_at
                FROM PostParent AS ps
                INNER JOIN Parent AS pa
                    ON ps.parent_id = pa.id
                WHERE ps.post_student_id = :post_student_id`,
        {
          post_student_id: postStudentId,
        }
      );

      return res
        .status(200)
        .json({
          group: group,
          student: student,
          parents: parentsPost,
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

  postGroupStudents = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }

      const groupId = req.params.group_id;
      if (!groupId || !isValidId(groupId)) {
        throw {
          status: 401,
          message: "Invalid or missing group id",
        };
      }

      const groupInfo = await DB.query(
        `
                SELECT
                    sg.id,
                    sg.name,
                    ps.post_id
                FROM PostStudent AS ps
                INNER JOIN StudentGroup AS sg
                    on ps.group_id = sg.id
                WHERE ps.group_id = :group_id
                AND ps.post_id = :post_id
                AND sg.school_id = :school_id;`,
        {
          group_id: groupId,
          post_id: postId,
          school_id: req.user.school_id,
        }
      );

      if (groupInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const group = groupInfo[0];

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(process.env.PER_PAGE + "");
      const offset = (page - 1) * limit;

      const email = (req.query.email as string) || "";
      const student_number = (req.query.student_number as string) || "";

      const filters = [];
      const params: any = {
        school_id: req.user.school_id,
        limit: limit,
        offset: offset,
        post_id: group.post_id,
        group_id: group.id,
      };

      if (email) {
        filters.push("st.email LIKE :email");
        params.email = `%${email}%`;
      }
      if (student_number) {
        filters.push("st.student_number LIKE :student_number");
        params.student_number = `%${student_number}%`;
      }

      const whereClause =
        filters.length > 0 ? " AND " + filters.join(" AND ") : "";

      const studentPostList = await DB.query(
        `SELECT
                    st.id, st.email, st.given_name, st.family_name,
                    st.phone_number, st.student_number, ps.id AS post_student_id
                FROM PostStudent AS ps
                INNER JOIN Student AS st on ps.student_id = st.id
                WHERE ps.post_id = :post_id 
                AND ps.group_id = :group_id 
                AND st.school_id = :school_id ${whereClause}
                LIMIT :limit OFFSET :offset`,
        params
      );

      const totalStudents = (
        await DB.query(
          `SELECT COUNT(DISTINCT st.id) AS total
                FROM PostStudent AS ps
                INNER JOIN Student AS st ON ps.student_id = st.id
                WHERE ps.post_id = :post_id 
                AND st.school_id = :school_id 
                AND ps.group_id = :group_id ${whereClause};`,
          params
        )
      )[0].total;
      const totalPages = Math.ceil(totalStudents / limit);

      const pagination = {
        current_page: page,
        per_page: limit,
        total_pages: totalPages,
        total_students: totalStudents,
        next_page: page < totalPages ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null,
        links: generatePaginationLinks(page, totalPages),
      };

      const postStudentIds = studentPostList.map(
        (student: any) => student.post_student_id
      );

      // FIX: give readStatuses a concrete type instead of implicit any[]
      const readStatuses: ParentReadStatus[] = postStudentIds.length
        ? ((await DB.query(
            `SELECT
                pa.id,
                pa.given_name, pa.family_name,
                pp.viewed_at, pp.post_student_id
             FROM PostParent AS pp
             INNER JOIN Parent AS pa ON pp.parent_id = pa.id
             WHERE pp.post_student_id IN (:student_ids);`,
            {
              student_ids: postStudentIds,
            }
          )) as ParentReadStatus[])
        : [];

      const readStatusMap = new Map<number, ParentReadStatus[]>();
      readStatuses.forEach((parent) => {
        const parents = readStatusMap.get(parent.post_student_id) || [];
        parents.push({
          id: parent.id,
          given_name: parent.given_name,
          family_name: parent.family_name,
          viewed_at: parent.viewed_at ?? null,
          post_student_id: parent.post_student_id,
        });
        readStatusMap.set(parent.post_student_id, parents);
      });

      const studentsWithReadStatus = studentPostList.map((student: any) => ({
        ...student,
        parents: readStatusMap.get(student.post_student_id) || [],
      }));

      return res
        .status(200)
        .json({
          group: {
            id: group.id,
            name: group.name,
          },
          students: studentsWithReadStatus,
          pagination: pagination,
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

  postStudentParent = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }

      const studentId = req.params.student_id;
      if (!studentId || !isValidId(studentId)) {
        throw {
          status: 401,
          message: "Invalid or missing student id",
        };
      }

      const studentInfo = await DB.query(
        `SELECT
                    st.id, st.email,
                    st.phone_number,
                    st.given_name,
                    st.family_name,
                    st.student_number,
                    ps.id AS post_student_id
                FROM PostStudent AS ps
                INNER JOIN Student AS st on ps.student_id = st.id
                WHERE ps.student_id = :student_id
                  AND ps.post_id = :post_id
                  AND st.school_id = :school_id`,
        {
          student_id: studentId,
          post_id: postId,
          school_id: req.user.school_id,
        }
      );

      if (studentInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const student = studentInfo[0];
      const postStudentId = student.post_student_id;

      const parentsPost = await DB.query(
        `SELECT
                    pa.id, pa.email, pa.phone_number,
                    pa.given_name, pa.family_name,
                    ps.viewed_at
                FROM PostParent AS ps
                INNER JOIN Parent AS pa
                    ON ps.parent_id = pa.id
                WHERE ps.post_student_id = :post_student_id`,
        {
          post_student_id: postStudentId,
        }
      );

      return res
        .status(200)
        .json({
          student: {
            id: student.id,
            email: student.email,
            phone_number: student.phone_number,
            given_name: student.given_name,
            family_name: student.family_name,
            student_number: student.student_number,
          },
          parents: parentsPost,
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

  postViewGroups = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }

      const postInfo = await DB.query(
        `SELECT * FROM Post WHERE id = :id AND school_id = :school_id`,
        { id: postId, school_id: req.user.school_id }
      );
      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(process.env.PER_PAGE + "");
      const offset = (page - 1) * limit;

      const name = (req.query.name as string) || "";

      const filters: string[] = [];
      const params: any = {
        school_id: req.user.school_id,
        limit,
        offset,
        post_id: postId,
      };
      if (name) {
        filters.push("sg.name LIKE :search");
        params.search = `%${name}%`;
      }
      const whereClause =
        filters.length > 0 ? " AND " + filters.join(" AND ") : "";

      // NEW: использовать объединение групп из GroupPost и PostStudent
      const groupsRows = await DB.query(
        `
        WITH target_groups AS (
          SELECT gp.group_id
          FROM GroupPost gp
          WHERE gp.post_id = :post_id
          UNION
          SELECT ps.group_id
          FROM PostStudent ps
          WHERE ps.post_id = :post_id AND ps.group_id IS NOT NULL
        )
        SELECT
          sg.id,
          sg.name,
          COUNT(DISTINCT CASE WHEN pp.viewed_at IS NOT NULL THEN pp.parent_id END) AS read_count,
          COUNT(DISTINCT CASE WHEN pp.viewed_at IS NULL THEN pp.parent_id END) AS not_viewed_count
        FROM target_groups tg
        INNER JOIN StudentGroup sg ON sg.id = tg.group_id AND sg.school_id = :school_id
        LEFT JOIN PostStudent ps ON ps.post_id = :post_id AND ps.group_id = sg.id
        LEFT JOIN PostParent pp ON pp.post_student_id = ps.id
        WHERE 1=1 ${whereClause}
        GROUP BY sg.id, sg.name
        LIMIT :limit OFFSET :offset;`,
        params
      );

      const totalGroups = (
        await DB.query(
          `
          WITH target_groups AS (
            SELECT gp.group_id
            FROM GroupPost gp
            WHERE gp.post_id = :post_id
            UNION
            SELECT ps.group_id
            FROM PostStudent ps
            WHERE ps.post_id = :post_id AND ps.group_id IS NOT NULL
          )
          SELECT COUNT(DISTINCT sg.id) AS total
          FROM target_groups tg
          INNER JOIN StudentGroup sg ON sg.id = tg.group_id AND sg.school_id = :school_id
          WHERE 1=1 ${whereClause};`,
          params
        )
      )[0].total;

      const totalPages = Math.ceil(totalGroups / limit);
      const pagination = {
        current_page: page,
        per_page: limit,
        total_pages: totalPages,
        total_groups: totalGroups,
        next_page: page < totalPages ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null,
        links: generatePaginationLinks(page, totalPages),
      };

      const groupsPostList = groupsRows.map((g: any) => ({
        id: g.id,
        name: g.name,
        read_count: Number(g.read_count) || 0,
        not_viewed_count: Number(g.not_viewed_count) || 0,
      }));

      return res
        .status(200)
        .json({
          groups: groupsPostList,
          pagination,
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

  postViewStudents = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }

      const postInfo = await DB.query(
        `SELECT * FROM Post
                WHERE id = :id AND school_id = :school_id`,
        {
          id: postId,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(process.env.PER_PAGE + "");

      const offset = (page - 1) * limit;

      const email = (req.query.email as string) || "";
      const student_number = (req.query.student_number as string) || "";

      const filters = [];
      const params: any = {
        school_id: req.user.school_id,
        limit: limit,
        offset: offset,
        post_id: postId,
      };

      if (email) {
        filters.push("email LIKE :email");
        params.email = `%${email}%`;
      }
      if (student_number) {
        filters.push("student_number LIKE :student_number");
        params.student_number = `%${student_number}%`;
      }

      const whereClause =
        filters.length > 0 ? " AND " + filters.join(" AND ") : "";

      const studentPostList = await DB.query(
        `SELECT
                    st.id, st.email, st.given_name, st.family_name,
                    st.phone_number, st.student_number, ps.id AS post_student_id
                FROM PostStudent AS ps
                INNER JOIN Student AS st on ps.student_id = st.id
                WHERE ps.post_id = :post_id AND ps.group_id IS NULL ${whereClause}
                LIMIT :limit OFFSET :offset`,
        params
      );

      const totalStudents = (
        await DB.query(
          `SELECT COUNT(DISTINCT st.id) AS total
                FROM PostStudent AS ps
                INNER JOIN Student AS st ON ps.student_id = st.id
                WHERE ps.post_id = :post_id ${whereClause};`,
          params
        )
      )[0].total;
      const totalPages = Math.ceil(totalStudents / limit);

      const pagination = {
        current_page: page,
        per_page: limit,
        total_pages: totalPages,
        total_students: totalStudents,
        next_page: page < totalPages ? page + 1 : null,
        prev_page: page > 1 ? page - 1 : null,
        links: generatePaginationLinks(page, totalPages),
      };

      const postStudentIds = studentPostList.map(
        (student: any) => student.post_student_id
      );

      // FIX: strong typing instead of implicit any
      const readStatuses: ParentReadStatus[] = postStudentIds.length
        ? ((await DB.query(
            `SELECT
                    pa.id,
                    pa.given_name, pa.family_name,
                    pp.viewed_at, pp.post_student_id
                FROM PostParent AS pp
                INNER JOIN Parent AS pa ON pp.parent_id = pa.id
                WHERE pp.post_student_id IN (:student_ids);`,
            { student_ids: postStudentIds }
          )) as ParentReadStatus[])
        : [];

      const readStatusMap = new Map<number, ParentReadStatus[]>();
      readStatuses.forEach((parent) => {
        const parents = readStatusMap.get(parent.post_student_id) || [];
        parents.push({
          id: parent.id,
          given_name: parent.given_name,
          family_name: parent.family_name,
          viewed_at: parent.viewed_at ?? null,
          post_student_id: parent.post_student_id,
        });
        readStatusMap.set(parent.post_student_id, parents);
      });

      const studentsWithReadStatus = studentPostList.map((student: any) => ({
        ...student,
        parents: readStatusMap.get(student.post_student_id) || [],
      }));

      return res
        .status(200)
        .json({
          students: studentsWithReadStatus,
          pagination: pagination,
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

  // В методе postView - добавить преобразование времени
  postView = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;

      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }
      const postInfo = await DB.query(
        `SELECT
                  po.id, po.title, po.description,
                  po.priority, po.sent_at, po.edited_at,
                  po.delivery_at,
                  ad.id AS admin_id, ad.given_name, ad.family_name,
                  COUNT(DISTINCT CASE WHEN pp.viewed_at IS NOT NULL THEN pp.parent_id END) AS read_count,
                  COUNT(DISTINCT CASE WHEN pp.viewed_at IS NULL THEN pp.parent_id END) AS unread_count
              FROM Post AS po
              INNER JOIN Admin AS ad ON po.admin_id = ad.id
              LEFT JOIN PostStudent AS ps ON ps.post_id = po.id
              LEFT JOIN PostParent AS pp ON pp.post_student_id = ps.id
              WHERE po.id = :id AND po.school_id = :school_id
              GROUP BY po.id, ad.id, ad.given_name, ad.family_name`,
        {
          id: postId,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      const post = postInfo[0];

      return res
        .status(200)
        .json({
          post: {
            id: post.id,
            title: post.title,
            description: post.description,
            priority: post.priority,
            sent_at: post.sent_at,
            edited_at: post.edited_at,
            // Возвращаем delivery_at как строку без преобразований
            delivery_at: post.delivery_at
              ? post.delivery_at.toISOString().slice(0, 19).replace("T", " ")
              : null,
            read_count: post.read_count,
            unread_count: post.unread_count,
          },
          admin: {
            id: post.admin_id,
            given_name: post.given_name,
            family_name: post.family_name,
          },
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

  postList = async (req: ExtendedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(process.env.PER_PAGE + "");
      const offset = (page - 1) * limit;

      const priority = (req.query.priority as string) || "";
      const text = (req.query.text as string) || "";
      const recipientType = (req.query.recipient_type as string) || "";
      const sort = (req.query.sort as string) || "newest";

      const filters = [];
      const params: any = {
        school_id: req.user.school_id,
        limit: limit,
        offset: offset,
      };

      if (priority && isValidPriority(priority)) {
        filters.push("po.priority = :priority");
        params.priority = priority;
      }
      if (text) {
        filters.push("(po.title LIKE :text OR po.description LIKE :text)");
        params.text = `%${text}%`;
      }

      // Only show posts that are either already delivered or have no scheduled delivery
      filters.push("(po.delivery_at IS NULL OR po.delivery_at <= NOW())");

      // Recipient type filtering - fix the JOIN logic
      let recipientJoin = "";
      if (recipientType === "students") {
        // Posts sent directly to students (not through groups)
        recipientJoin =
          "INNER JOIN PostStudent ps2 ON po.id = ps2.post_id AND ps2.group_id IS NULL";
      } else if (recipientType === "groups") {
        // Posts sent to groups
        recipientJoin =
          "INNER JOIN PostStudent ps2 ON po.id = ps2.post_id AND ps2.group_id IS NOT NULL";
      } else if (recipientType === "parents") {
        // Posts that have parent recipients
        recipientJoin = `INNER JOIN PostStudent ps2 ON po.id = ps2.post_id 
                       INNER JOIN PostParent pp2 ON ps2.id = pp2.post_student_id`;
      }

      // Build ORDER BY clause using sent_at instead of created_at
      let orderClause = "";
      switch (sort) {
        case "oldest":
          orderClause = "ORDER BY po.sent_at ASC";
          break;
        case "title_asc":
          orderClause = "ORDER BY po.title ASC";
          break;
        case "title_desc":
          orderClause = "ORDER BY po.title DESC";
          break;
        default: // newest
          orderClause = "ORDER BY po.sent_at DESC";
      }

      const whereClause =
        filters.length > 0 ? " AND " + filters.join(" AND ") : "";

      const postList = await DB.query(
        `SELECT
                po.id, po.title, po.description, po.priority,
                ad.id AS admin_id, ad.given_name AS admin_given_name, 
                ad.family_name AS admin_family_name,
                po.sent_at, po.edited_at, po.delivery_at,
                -- NEW: агрегируем имена групп из PostStudent и/или GroupPost
                GROUP_CONCAT(DISTINCT COALESCE(sg.name, sgg.name) SEPARATOR '||') AS group_names,
                COALESCE(
                  ROUND(
                    (COUNT(DISTINCT CASE WHEN pp.viewed_at IS NOT NULL THEN ps.student_id END)
                    / NULLIF(COUNT(DISTINCT ps.student_id),0)) * 100, 2
                  ), 0
                ) AS read_percent
            FROM Post AS po
            INNER JOIN Admin AS ad ON ad.id = po.admin_id
            LEFT JOIN PostStudent AS ps ON ps.post_id = po.id
            LEFT JOIN PostParent AS pp ON pp.post_student_id = ps.id
            -- NEW: связи для имен групп
            LEFT JOIN StudentGroup sg ON sg.id = ps.group_id
            LEFT JOIN GroupPost gp ON gp.post_id = po.id
            LEFT JOIN StudentGroup sgg ON sgg.id = gp.group_id
            ${recipientJoin}
            WHERE po.school_id = :school_id ${whereClause}
            GROUP BY po.id, po.title, po.description, po.priority, ad.id, ad.given_name, ad.family_name, po.sent_at, po.edited_at, po.delivery_at
            ${orderClause}
            LIMIT :limit OFFSET :offset;`,
        params
      );

      const totalPosts = (
        await DB.query(
          `SELECT COUNT(DISTINCT po.id) AS total
            FROM Post AS po
            ${recipientJoin}
            WHERE po.school_id = :school_id ${whereClause};`,
          params
        )
      )[0].total;

      return res.status(200).json({
        posts: postList.map((post: any) => {
          const groups_list = Array.from(
            new Set(
              String(post.group_names || "")
                .split("||")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          );
          const groups_count = groups_list.length;

          return {
            ...post,
            groups_list,
            groups_count,
            admin: {
              id: post.admin_id,
              given_name: post.admin_given_name,
              family_name: post.admin_family_name,
            },
          };
        }),
        pagination: {
          page,
          limit,
          total: totalPosts,
          totalPages: Math.ceil(totalPosts / limit),
        },
      });
    } catch (e: any) {
      console.error("[Post API] postList error:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  scheduledPostingList = async (req: ExtendedRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(process.env.PER_PAGE + "");
      const offset = (page - 1) * limit;

      const priority = (req.query.priority as string) || "";
      const text = (req.query.text as string) || "";
      const recipientType = (req.query.recipient_type as string) || "";
      const sort = (req.query.sort as string) || "delivery_asc";

      const filters = [];
      const params: any = {
        school_id: req.user.school_id,
        limit: limit,
        offset: offset,
      };

      if (priority && isValidPriority(priority)) {
        filters.push("po.priority = :priority");
        params.priority = priority;
      }
      if (text) {
        filters.push("(po.title LIKE :text OR po.description LIKE :text)");
        params.text = `%${text}%`;
      }

      // Only show scheduled posts
      filters.push("po.delivery_at IS NOT NULL AND po.delivery_at > NOW()");

      // Recipient type filtering - fix the JOIN logic
      let recipientJoin = "";
      if (recipientType === "students") {
        // Posts sent directly to students (not through groups)
        recipientJoin =
          "INNER JOIN PostStudent ps2 ON po.id = ps2.post_id AND ps2.group_id IS NULL";
      } else if (recipientType === "groups") {
        // Posts sent to groups
        recipientJoin =
          "INNER JOIN PostStudent ps2 ON po.id = ps2.post_id AND ps2.group_id IS NOT NULL";
      } else if (recipientType === "parents") {
        // Posts that have parent recipients
        recipientJoin = `INNER JOIN PostStudent ps2 ON po.id = ps2.post_id 
                       INNER JOIN PostParent pp2 ON ps2.id = pp2.post_student_id`;
      }

      // Build ORDER BY clause
      let orderClause = "";
      switch (sort) {
        case "delivery_desc":
          orderClause = "ORDER BY po.delivery_at DESC";
          break;
        case "newest":
          orderClause = "ORDER BY po.sent_at DESC";
          break;
        case "oldest":
          orderClause = "ORDER BY po.sent_at ASC";
          break;
        case "title_asc":
          orderClause = "ORDER BY po.title ASC";
          break;
        case "title_desc":
          orderClause = "ORDER BY po.title DESC";
          break;
        default:
          orderClause = "ORDER BY po.delivery_at ASC";
      }

      const whereClause =
        filters.length > 0 ? " AND " + filters.join(" AND ") : "";

      const postList = await DB.query(
        `SELECT
                po.id, po.title, po.description, po.priority,
                ad.id AS admin_id, ad.given_name AS admin_given_name, 
                ad.family_name AS admin_family_name,
                po.sent_at, po.edited_at, po.delivery_at,
                -- NEW: агрегируем имена групп
                GROUP_CONCAT(DISTINCT COALESCE(sg.name, sgg.name) SEPARATOR '||') AS group_names,
                COALESCE(
                  ROUND(
                    (COUNT(DISTINCT CASE WHEN pp.viewed_at IS NOT NULL THEN ps.student_id END)
                    / NULLIF(COUNT(DISTINCT ps.student_id),0)) * 100, 2
                  ), 0
                ) AS read_percent
            FROM Post AS po
            INNER JOIN Admin AS ad ON ad.id = po.admin_id
            LEFT JOIN PostStudent AS ps ON ps.post_id = po.id
            LEFT JOIN PostParent AS pp ON pp.post_student_id = ps.id
            -- NEW: связи для имен групп
            LEFT JOIN StudentGroup sg ON sg.id = ps.group_id
            LEFT JOIN GroupPost gp ON gp.post_id = po.id
            LEFT JOIN StudentGroup sgg ON sgg.id = gp.group_id
            ${recipientJoin}
            WHERE po.school_id = :school_id ${whereClause}
            GROUP BY po.id, po.title, po.description, po.priority, ad.id, ad.given_name, ad.family_name, po.sent_at, po.edited_at, po.delivery_at
            ${orderClause}
            LIMIT :limit OFFSET :offset;`,
        params
      );

      const totalPosts = (
        await DB.query(
          `SELECT COUNT(DISTINCT po.id) AS total
              FROM Post AS po
              ${recipientJoin}
              WHERE po.school_id = :school_id ${whereClause};`,
          params
        )
      )[0].total;

      return res.status(200).json({
        posts: postList.map((post: any) => {
          const groups_list = Array.from(
            new Set(
              String(post.group_names || "")
                .split("||")
                .map((s) => s.trim())
                .filter(Boolean)
            )
          );
          const groups_count = groups_list.length;

          return {
            ...post,
            groups_list,
            groups_count,
            admin: {
              id: post.admin_id,
              given_name: post.admin_given_name,
              family_name: post.admin_family_name,
            },
          };
        }),
        pagination: {
          page,
          limit,
          total: totalPosts,
          totalPages: Math.ceil(totalPosts / limit),
        },
      });
    } catch (e: any) {
      console.error("[Post API] scheduledPostList error:", e);
      res.status(500).json({ error: "Internal server error" });
    }
  };

  postRecipients = async (req: ExtendedRequest, res: Response) => {
    try {
      const postId = req.params.id;
      if (!postId || !isValidId(postId)) {
        throw {
          status: 401,
          message: "Invalid or missing post id",
        };
      }

      // Verify post exists and belongs to school
      const postInfo = await DB.query(
        `SELECT id FROM Post WHERE school_id = :school_id AND id = :id`,
        {
          id: postId,
          school_id: req.user.school_id,
        }
      );

      if (postInfo.length <= 0) {
        throw {
          status: 404,
          message: "Post not found",
        };
      }

      // Get students directly assigned to the post
      const directStudents = await DB.query(
        `SELECT DISTINCT ps.student_id, s.given_name, s.family_name, s.student_number
         FROM PostStudent ps
         INNER JOIN Student s ON ps.student_id = s.id
         WHERE ps.post_id = :post_id AND ps.group_id IS NULL`,
        { post_id: postId }
      );

      // FIX: correct column name
      const groups = await DB.query(
        `SELECT DISTINCT ps.group_id, sg.name AS group_name
         FROM PostStudent ps
         INNER JOIN StudentGroup sg ON ps.group_id = sg.id
         WHERE ps.post_id = :post_id AND ps.group_id IS NOT NULL`,
        { post_id: postId }
      );

      return res
        .status(200)
        .json({
          students: directStudents.map((s: any) => ({
            id: s.student_id,
            given_name: s.given_name,
            family_name: s.family_name,
            student_number: s.student_number,
          })),
          groups: groups.map((g: any) => ({
            id: g.group_id,
            group_name: g.group_name,
          })),
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
        console.error("Error in postRecipients:", e);
        return res
          .status(500)
          .json({
            error: "Internal server error",
          })
          .end();
      }
    }
  };
}

// Уточнённая функция: берём потомков из GroupHierarchy и/или из StudentGroup.parent_group_id
async function expandGroupIdsWithDescendants(
  schoolId: number,
  groupId: number
): Promise<number[]> {
  const rows = (await DB.query(
    `
    WITH RECURSIVE grp (id) AS (
      SELECT id
      FROM StudentGroup
      WHERE school_id = :school_id AND id = :id
      UNION ALL
      -- связь из вспомогательной таблицы
      SELECT gh.child_group_id
      FROM GroupHierarchy AS gh
      JOIN grp g ON gh.parent_group_id = g.id
      UNION ALL
      -- запасной путь по полю parent_group_id
      SELECT sg.id
      FROM StudentGroup sg
      JOIN grp g ON sg.parent_group_id = g.id
      WHERE sg.school_id = :school_id
    )
    SELECT DISTINCT id FROM grp;
    `,
    { school_id: schoolId, id: groupId }
  )) as { id: number }[];
  return rows.map((r) => r.id);
}

// Собираем все целевые группы с учётом потомков и исключений
async function gatherTargetGroupIds(
  schoolId: number,
  groups: any,
  excluded?: number[]
): Promise<number[]> {
  if (!Array.isArray(groups) || groups.length === 0) return [];
  const excludedSet = new Set<number>(
    Array.isArray(excluded)
      ? excluded.map((v) => Number(v)).filter((n) => n > 0)
      : []
  );
  const seeds = groups
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0 && !excludedSet.has(n));

  const acc = new Set<number>();
  for (const gid of seeds) {
    acc.add(gid);
    const desc = await expandGroupIdsWithDescendants(schoolId, gid);
    desc.forEach((d) => {
      if (!excludedSet.has(d)) acc.add(d);
    });
  }
  // Расширим исключения: исключить и их потомков
  if (excludedSet.size) {
    const exAll = new Set<number>();
    for (const ex of excludedSet) {
      exAll.add(ex);
      const exDesc = await expandGroupIdsWithDescendants(schoolId, ex);
      exDesc.forEach((d) => exAll.add(d));
    }
    exAll.forEach((id) => acc.delete(id));
  }
  return Array.from(acc.values());
}

// Вставка целевых групп в GroupPost (пост виден даже без студентов)
async function insertGroupPost(postId: number, groupIds: number[]) {
  if (!groupIds.length) return;
  const values = groupIds.map((_) => "(?, ?)").join(", ");
  await DB.execute(
    `INSERT INTO GroupPost (post_id, group_id) VALUES ${values}`,
    groupIds.flatMap((id) => [postId, id])
  );
}

// Вставка получателей-студентов для выбранных групп
async function insertPostStudentForGroups(
  postId: number,
  schoolId: number,
  groupIds: number[]
) {
  if (!groupIds.length) return;

  const groupStudents = await DB.query(
    `SELECT DISTINCT gm.student_id, gm.group_id
     FROM GroupMember gm
     INNER JOIN Student st ON st.id = gm.student_id
     WHERE gm.group_id IN (:group_ids) AND st.school_id = :school_id`,
    { group_ids: groupIds, school_id: schoolId }
  );

  if (Array.isArray(groupStudents) && groupStudents.length > 0) {
    const values = groupStudents
      .map(
        (r: any) =>
          `(${postId}, ${Number(r.student_id)}, ${Number(r.group_id)})`
      )
      .join(", ");
    await DB.execute(
      `INSERT INTO PostStudent (post_id, student_id, group_id) VALUES ${values}`
    );
  }
}

export default StudentController;
