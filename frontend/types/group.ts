export default interface Group {
  id: number;
  name: string;
  member_count?: number;
  viewed_count?: boolean;
  not_viewed_count?: boolean;
  created_at?: string;
  parent_group_id?: number | null;
  parent_group_name?: string;
  children_groups?: Group[];
  parent_groups?: {
    id: number;
    name: string;
  }[];
  child_groups?: {
    id: number;
    name: string;
  }[];
}