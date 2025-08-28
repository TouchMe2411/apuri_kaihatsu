import Student from "./student";
import Group from "./group";

interface Draft {
  id: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  is_scheduled: boolean;
  delivery_date?: Date;
  delivery_time?: string;
  created_at: string;
  updated_at: string;
  students: Student[];
  groups: Group[];
}

export default Draft; 