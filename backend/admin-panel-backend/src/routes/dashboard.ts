import { Response } from "express";
import { ExtendedRequest } from "../middlewares/auth";
import { IController } from "../utils/icontroller";
import DB from "../utils/db-client";
import express, { Router } from "express";
import { verifyToken } from "../middlewares/auth";

class DashboardController implements IController {
  public router: Router = express.Router();

  constructor() {
    this.initRoutes();
  }

  initRoutes(): void {
    this.router.get('/dashboard/stats', verifyToken, this.getStats);
  }

  async getStats(req: ExtendedRequest, res: Response) {
    try {
      const schoolId = req.user?.school_id;

      if (!schoolId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Получаем количество форм для данной школы
      const formsCount = await DB.query(
        "SELECT COUNT(*) as count FROM Form WHERE school_id = ?", 
        [schoolId]
      );
      
      // Получаем количество сообщений для данной школы
      const messagesCount = await DB.query(
        "SELECT COUNT(*) as count FROM Post WHERE school_id = ?", 
        [schoolId]
      );
      
      // Получаем количество студентов для данной школы
      const studentsCount = await DB.query(
        "SELECT COUNT(*) as count FROM Student WHERE school_id = ?", 
        [schoolId]
      );
      
      // Получаем количество групп для данной школы
      const groupsCount = await DB.query(
        "SELECT COUNT(*) as count FROM StudentGroup WHERE school_id = ?", 
        [schoolId]
      );
      
      // Получаем количество родителей для данной школы
      const parentsCount = await DB.query(
        "SELECT COUNT(*) as count FROM Parent WHERE school_id = ?", 
        [schoolId]
      );
      
      // Получаем количество администраторов для данной школы
      const adminsCount = await DB.query(
        "SELECT COUNT(*) as count FROM Admin WHERE school_id = ?", 
        [schoolId]
      );

      const stats = {
        forms: formsCount[0]?.count || 0,
        messages: messagesCount[0]?.count || 0,
        students: studentsCount[0]?.count || 0,
        groups: groupsCount[0]?.count || 0,
        parents: parentsCount[0]?.count || 0,
        admins: adminsCount[0]?.count || 0,
      };

      return res.status(200).json(stats);
    } catch (error) {
      console.error("Error fetching dashboard stats:", error);
      return res.status(500).json({ error: "Failed to fetch dashboard statistics" });
    }
  }
}

export default DashboardController;