import Admin from "./admin";

export default interface Post {
  id: number;
  title: string;
  description: string;
  priority: string;
  admin?: Admin;
  sent_at: string;
  edited_at: string;
  read_percent: string;
  delivery_at?: string;
  scheduled_at?: string;
  timezone?: string;
  timezone_offset?: string;
  status?: string;
  delivered_at?: string;
}
